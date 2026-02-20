import { app } from 'electron';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';

import { IPC_CHANNELS } from '../../types/ipc';
import { getMainWindow } from '../window/summonController';
import { getDb } from '../db';
import { remindersMappings, type RemindersMapping } from '../db/schema';
import {
  SETTING_KEY_REMINDERS_SYNC_ENABLED,
  SETTING_KEY_REMINDERS_LIST_ID,
  SETTING_KEY_REMINDERS_SYNC_FILTER,
  SETTING_KEY_REMINDERS_IMPORT_ENABLED,
} from '../defaultSettings';
import { getSetting, getSettingWithDefault, setSetting } from './settingsService';
import { listTasks, getTaskById, completeTask, subscribeTaskChanges, createTask, cancelTask, updateTask } from './taskService';
import { blockNoteToMarkdown } from './notesService';
import { TERMINAL_STATUSES, type PredefinedStatusId, type TaskStatusConfig } from '../../types/models';
import type { Task } from '../db/schema';

// ─── Constants ──────────────────────────────────────────────

const DEBOUNCE_MS = 2000;
const PULL_DEBOUNCE_MS = 500;
const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
const HELPER_TIMEOUT_MS = 15_000;
const FETCH_ALL_TIMEOUT_MS = 60_000;
const PUSH_COOLDOWN_MS = 3000;
const RECENTLY_PULLED_TTL_MS = 5000;
const BATCH_SIZE = 20;
const BATCH_DELAY_MS = 500;
const WATCHER_RESTART_BASE_MS = 5000;
const WATCHER_RESTART_MAX_MS = 60_000;

// ─── Priority mapping ───────────────────────────────────────

const PRIORITY_TO_EVENTKIT: Record<string, number> = {
  none: 0,
  low: 9,
  medium: 5,
  high: 1,
};

const EVENTKIT_TO_PRIORITY: Record<number, 'none' | 'low' | 'medium' | 'high'> = {
  0: 'none',
  1: 'high',
  2: 'high',
  3: 'high',
  4: 'high',
  5: 'medium',
  6: 'medium',
  7: 'medium',
  8: 'medium',
  9: 'low',
};

function eventKitToUntaskPriority(eventKitPriority: number): 'none' | 'low' | 'medium' | 'high' {
  return EVENTKIT_TO_PRIORITY[eventKitPriority] ?? 'none';
}

function getTaskStatusConfig(): TaskStatusConfig {
  const raw = getSetting('task_statuses');
  if (!raw) return { enabled: ['inbox', 'active', 'in_progress', 'done'], order: ['active', 'in_progress', 'done'] };
  try {
    return JSON.parse(raw) as TaskStatusConfig;
  } catch {
    return { enabled: ['inbox', 'active', 'in_progress', 'done'], order: ['active', 'in_progress', 'done'] };
  }
}

function getTerminalStatusForSync(preferred: 'done' | 'cancelled'): PredefinedStatusId {
  if (preferred === 'done') return 'done';
  const config = getTaskStatusConfig();
  if (config.enabled.includes('cancelled')) return 'cancelled';
  return 'done';
}

function isImportEnabled(): boolean {
  return getSettingWithDefault(SETTING_KEY_REMINDERS_IMPORT_ENABLED) === 'true';
}

function convertRecurrenceRule(rrule: string | null): string | null {
  if (!rrule) return null;

  const parts: Record<string, string> = {};
  for (const part of rrule.split(';')) {
    const [key, value] = part.split('=');
    if (key && value) parts[key] = value;
  }

  const freq = parts.FREQ;
  const interval = parseInt(parts.INTERVAL ?? '1', 10);
  const byDay = parts.BYDAY?.split(',');

  if (interval === 1) {
    if (freq === 'DAILY') return 'daily';
    if (freq === 'WEEKLY') return 'weekly';
    if (freq === 'MONTHLY') return 'monthly';
    if (freq === 'YEARLY') return 'yearly';
  }

  if (interval > 1) {
    if (freq === 'DAILY') return `every ${interval} days`;
    if (freq === 'WEEKLY') return `every ${interval} weeks`;
    if (freq === 'MONTHLY') return `every ${interval} months`;
  }

  if (freq === 'WEEKLY' && byDay?.length === 5 &&
      ['MO', 'TU', 'WE', 'TH', 'FR'].every((d) => byDay.includes(d))) {
    return 'every weekday';
  }

  if (freq === 'WEEKLY' && byDay?.length === 1) {
    const dayMap: Record<string, string> = {
      MO: 'monday', TU: 'tuesday', WE: 'wednesday',
      TH: 'thursday', FR: 'friday', SA: 'saturday', SU: 'sunday',
    };
    return `every ${dayMap[byDay[0]] ?? byDay[0].toLowerCase()}`;
  }

  console.warn(`[reminders-sync] unsupported recurrence rule: ${rrule}`);
  return null;
}

// ─── Module state ───────────────────────────────────────────

let debounceTimer: NodeJS.Timeout | null = null;
let pullDebounceTimer: NodeJS.Timeout | null = null;
let pollInterval: NodeJS.Timeout | null = null;
let unsubscribeTaskChange: (() => void) | null = null;
let watcherProcess: ChildProcess | null = null;
let watcherRestartTimer: NodeJS.Timeout | null = null;
let watcherRestartAttempts = 0;
let listId: string | null = null;

// ─── Loop prevention state ──────────────────────────────────

let pushInFlight = false;
let pullInFlight = false;
let pushCooldownTimer: NodeJS.Timeout | null = null;
const recentlyPulled = new Map<string, number>();

function markAsPulled(taskId: string): void {
  recentlyPulled.set(taskId, Date.now());
}

function wasPulledRecently(taskId: string): boolean {
  const ts = recentlyPulled.get(taskId);
  if (!ts) return false;
  if (Date.now() - ts > RECENTLY_PULLED_TTL_MS) {
    recentlyPulled.delete(taskId);
    return false;
  }
  return true;
}

function setPushInFlight(): void {
  pushInFlight = true;
  if (pushCooldownTimer) clearTimeout(pushCooldownTimer);
}

function clearPushInFlight(): void {
  pushCooldownTimer = setTimeout(() => {
    pushInFlight = false;
  }, PUSH_COOLDOWN_MS);
}

// ─── Sync status broadcasting ───────────────────────────────

type SyncStatus = { status: 'syncing' | 'idle' | 'error'; message?: string };

function broadcastSyncStatus(syncStatus: SyncStatus): void {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC_CHANNELS.REMINDERS_SYNC_STATUS, syncStatus);
  }
}

// ─── Helper path resolution ─────────────────────────────────

function getHelperPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'untask-helper');
  }
  return path.join(app.getAppPath(), 'resources', 'bin', 'untask-helper');
}

// ─── Helper invocation ──────────────────────────────────────

function runHelper(
  command: string,
  input?: unknown,
  timeoutMs: number = HELPER_TIMEOUT_MS,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const helperPath = getHelperPath();

    if (!existsSync(helperPath)) {
      reject(new Error(`Swift helper not found at ${helperPath}`));
      return;
    }

    const child = execFile(helperPath, [command], { timeout: timeoutMs }, (error, stdout) => {
      if (error) {
        reject(new Error(`Helper ${command} failed: ${error.message}`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        if (parsed && typeof parsed === 'object' && 'error' in parsed) {
          reject(new Error(`Helper ${command}: ${parsed.error}`));
          return;
        }
        resolve(parsed);
      } catch {
        reject(new Error(`Helper ${command}: invalid JSON output`));
      }
    });

    if (input !== undefined && child.stdin) {
      child.stdin.write(JSON.stringify(input));
      child.stdin.end();
    }
  });
}

// ─── Mapping helpers ────────────────────────────────────────

function getAllMappings(): RemindersMapping[] {
  const db = getDb();
  return db.select().from(remindersMappings).all();
}

function insertMapping(taskId: string, reminderId: string, externalId?: string | null): void {
  const db = getDb();
  db.insert(remindersMappings)
    .values({
      taskId,
      reminderId,
      externalId: externalId ?? null,
      lastSyncedAt: new Date().toISOString(),
    })
    .run();
}

function updateMappingReminderId(taskId: string, reminderId: string): void {
  const db = getDb();
  db.update(remindersMappings)
    .set({ reminderId, lastSyncedAt: new Date().toISOString() })
    .where(eq(remindersMappings.taskId, taskId))
    .run();
}

function updateMappingSyncTime(taskId: string): void {
  const db = getDb();
  db.update(remindersMappings)
    .set({ lastSyncedAt: new Date().toISOString() })
    .where(eq(remindersMappings.taskId, taskId))
    .run();
}

function deleteMapping(taskId: string): void {
  const db = getDb();
  db.delete(remindersMappings)
    .where(eq(remindersMappings.taskId, taskId))
    .run();
}

// ─── Task filter logic ──────────────────────────────────────

type SyncFilter = 'due_date_only' | 'today' | 'all';

function getSyncFilter(): SyncFilter {
  const stored = getSettingWithDefault(SETTING_KEY_REMINDERS_SYNC_FILTER);
  if (stored === 'today' || stored === 'all') return stored;
  return 'due_date_only';
}

function isTerminal(status: string | null): boolean {
  return TERMINAL_STATUSES.includes(status as PredefinedStatusId);
}

function taskMatchesFilter(task: Task, filter: SyncFilter): boolean {
  if (isTerminal(task.status)) return false;

  switch (filter) {
    case 'due_date_only':
      return task.dueDate !== null;
    case 'today':
      return task.dueDate !== null || task.today === true;
    case 'all':
      return true;
  }
}

// ─── Build reminder payload ─────────────────────────────────

function buildReminderPayload(task: {
  title: string;
  body: string | null;
  dueDate: string | null;
  priority: string | null;
}): {
  title: string;
  notes: string | null;
  dueDate: string | null;
  priority: number;
} {
  const notesText = task.body ? blockNoteToMarkdown(task.body) : null;
  return {
    title: task.title,
    notes: notesText ? notesText.slice(0, 500) : null,
    dueDate: task.dueDate,
    priority: PRIORITY_TO_EVENTKIT[task.priority ?? 'none'] ?? 0,
  };
}

// ─── Push: Untask → Reminders ───────────────────────────────

async function pushChanges(): Promise<void> {
  if (!listId) return;

  setPushInFlight();
  broadcastSyncStatus({ status: 'syncing' });

  try {
    const filter = getSyncFilter();
    const allTasks = listTasks();
    const mappings = getAllMappings();
    const mappingByTaskId = new Map(mappings.map((m) => [m.taskId, m]));

    // Track which task IDs still have valid mappings
    const processedTaskIds = new Set<string>();

    for (const task of allTasks) {
      processedTaskIds.add(task.id);

      if (wasPulledRecently(task.id)) continue;

      const mapping = mappingByTaskId.get(task.id);
      const taskIsTerminal = isTerminal(task.status);
      const matchesFilter = taskMatchesFilter(task, filter);

      if (!mapping && matchesFilter && !taskIsTerminal) {
        // Create new reminder
        try {
          const payload = buildReminderPayload(task);
          const result = await runHelper('--create', {
            listId,
            ...payload,
          }) as { reminderId: string; externalId?: string };
          insertMapping(task.id, result.reminderId, result.externalId);
        } catch (e) {
          console.warn(`[reminders-sync] create failed for task ${task.id}:`, e);
        }
      } else if (mapping && matchesFilter && !taskIsTerminal) {
        // Update existing reminder
        try {
          const payload = buildReminderPayload(task);
          await runHelper('--update', {
            reminderId: mapping.reminderId,
            ...payload,
          });
          updateMappingSyncTime(task.id);
        } catch (e) {
          console.warn(`[reminders-sync] update failed for task ${task.id}:`, e);
        }
      } else if (mapping && taskIsTerminal) {
        // Task completed/cancelled → mark reminder complete and remove mapping
        try {
          await runHelper('--complete', { reminderId: mapping.reminderId });
        } catch (e) {
          console.warn(`[reminders-sync] complete failed for task ${task.id}:`, e);
        }
        deleteMapping(task.id);
      } else if (mapping && !matchesFilter) {
        // Task no longer matches filter → delete reminder and remove mapping
        try {
          await runHelper('--delete', { reminderId: mapping.reminderId });
        } catch (e) {
          console.warn(`[reminders-sync] delete failed for task ${task.id}:`, e);
        }
        deleteMapping(task.id);
      }
    }

    // Handle orphaned mappings (task deleted in Untask)
    for (const mapping of mappings) {
      if (!processedTaskIds.has(mapping.taskId)) {
        try {
          await runHelper('--delete', { reminderId: mapping.reminderId });
        } catch (e) {
          console.warn(`[reminders-sync] orphan delete failed for ${mapping.taskId}:`, e);
        }
        deleteMapping(mapping.taskId);
      }
    }

    broadcastSyncStatus({ status: 'idle' });
  } catch (e) {
    console.error('[reminders-sync] push failed:', e);
    broadcastSyncStatus({
      status: 'error',
      message: e instanceof Error ? e.message : 'Push failed',
    });
  } finally {
    clearPushInFlight();
  }
}

// ─── Pull: Reminders → Untask ───────────────────────────────

type FetchedReminder = {
  reminderId: string;
  externalId: string | null;
  title: string;
  notes: string | null;
  dueDate: string | null;
  priority: number;
  isCompleted: boolean;
  recurrenceRule?: string | null;
};

async function pullChanges(): Promise<void> {
  if (!listId || pushInFlight || pullInFlight) return;

  pullInFlight = true;

  try {
    const fetched = (await runHelper('--fetch-all', { listId }, FETCH_ALL_TIMEOUT_MS)) as FetchedReminder[];

    const fetchedById = new Map(fetched.map((r) => [r.reminderId, r]));
    const fetchedByExternalId = new Map<string, FetchedReminder>();
    for (const r of fetched) {
      if (r.externalId) fetchedByExternalId.set(r.externalId, r);
    }

    const mappings = getAllMappings();
    const mappedReminderIds = new Set(mappings.map((m) => m.reminderId));

    // ─── Handle existing mappings ─────────────────────────────
    for (const mapping of mappings) {
      let reminder = fetchedById.get(mapping.reminderId);

      // If not found by reminderId, try externalId (iCloud ID change)
      if (!reminder && mapping.externalId) {
        reminder = fetchedByExternalId.get(mapping.externalId);
        if (reminder) {
          updateMappingReminderId(mapping.taskId, reminder.reminderId);
        }
      }

      if (!reminder) {
        // Reminder was DELETED in Reminders.app → mark task as cancelled
        const task = getTaskById(mapping.taskId);
        if (task && !isTerminal(task.status)) {
          try {
            const terminalStatus = getTerminalStatusForSync('cancelled');
            if (terminalStatus === 'cancelled') {
              cancelTask(task.id, 'user');
            } else {
              completeTask(task.id, 'user');
            }
            markAsPulled(task.id);
          } catch (e) {
            console.warn(`[reminders-sync] mark cancelled failed for task ${mapping.taskId}:`, e);
          }
        }
        deleteMapping(mapping.taskId);
        continue;
      }

      // Check if reminder was completed on phone
      if (reminder.isCompleted) {
        const task = getTaskById(mapping.taskId);
        if (task && !isTerminal(task.status)) {
          try {
            completeTask(task.id, 'user');
            markAsPulled(task.id);
          } catch (e) {
            console.warn(`[reminders-sync] pull complete failed for task ${mapping.taskId}:`, e);
          }
        }
        deleteMapping(mapping.taskId);
        continue;
      }

      // Pull data changes from Reminders (title, dueDate, priority)
      const task = getTaskById(mapping.taskId);
      if (task && !isTerminal(task.status)) {
        const hasChanges =
          task.title !== reminder.title ||
          task.dueDate !== reminder.dueDate ||
          task.priority !== eventKitToUntaskPriority(reminder.priority);

        if (hasChanges) {
          try {
            updateTask({
              id: task.id,
              title: reminder.title,
              dueDate: reminder.dueDate,
              priority: eventKitToUntaskPriority(reminder.priority),
            }, 'user');
            markAsPulled(task.id);
            console.info(`[reminders-sync] pulled data from Reminders for task ${task.id}`);
          } catch (e) {
            console.warn(`[reminders-sync] pull data failed for task ${mapping.taskId}:`, e);
          }
        }
      }

      updateMappingSyncTime(mapping.taskId);
    }

    // ─── Import NEW reminders (unmapped) ───────────────────────
    if (!isImportEnabled()) return;

    for (const reminder of fetched) {
      if (mappedReminderIds.has(reminder.reminderId)) continue;
      if (reminder.isCompleted) continue;

      try {
        const task = createTask({
          title: reminder.title,
          body: reminder.notes ?? null,
          status: 'inbox',
          dueDate: reminder.dueDate,
          priority: eventKitToUntaskPriority(reminder.priority),
          recurrence: convertRecurrenceRule(reminder.recurrenceRule ?? null),
        }, 'user');

        insertMapping(task.id, reminder.reminderId, reminder.externalId);
        markAsPulled(task.id); // Prevent push from unnecessarily updating
        console.info(`[reminders-sync] imported reminder "${reminder.title}" as task ${task.id}`);
      } catch (e) {
        console.warn(`[reminders-sync] import failed for reminder ${reminder.reminderId}:`, e);
      }
    }
  } catch (e) {
    console.error('[reminders-sync] pull failed:', e);
  } finally {
    pullInFlight = false;
  }
}

// ─── Bulk initial sync ──────────────────────────────────────

async function runInitialSync(): Promise<void> {
  if (!listId) return;

  broadcastSyncStatus({ status: 'syncing' });

  try {
    const filter = getSyncFilter();
    const allTasks = listTasks();
    const existingMappings = new Set(getAllMappings().map((m) => m.taskId));

    const tasksToSync = allTasks.filter(
      (task) =>
        taskMatchesFilter(task, filter) &&
        !isTerminal(task.status) &&
        !existingMappings.has(task.id),
    );

    // Batch create
    for (let i = 0; i < tasksToSync.length; i += BATCH_SIZE) {
      const batch = tasksToSync.slice(i, i + BATCH_SIZE);
      const batchPayload = batch.map((task) => ({
        listId: listId!,
        ...buildReminderPayload(task),
      }));

      try {
        const results = (await runHelper('--batch-create', batchPayload, FETCH_ALL_TIMEOUT_MS)) as Array<{
          reminderId: string;
          externalId?: string;
        }>;

        for (let j = 0; j < results.length; j++) {
          insertMapping(batch[j].id, results[j].reminderId, results[j].externalId);
        }
      } catch (e) {
        console.warn(`[reminders-sync] batch create failed at offset ${i}:`, e);
      }

      if (i + BATCH_SIZE < tasksToSync.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    // Also pull any existing completions
    await pullChanges();

    broadcastSyncStatus({ status: 'idle' });
    console.info(`[reminders-sync] initial sync complete: ${tasksToSync.length} tasks synced`);
  } catch (e) {
    console.error('[reminders-sync] initial sync failed:', e);
    broadcastSyncStatus({
      status: 'error',
      message: e instanceof Error ? e.message : 'Initial sync failed',
    });
  }
}

// ─── Watcher management ─────────────────────────────────────

function startWatcher(): void {
  const helperPath = getHelperPath();
  if (!existsSync(helperPath)) {
    console.warn('[reminders-sync] helper not found, skipping watcher');
    return;
  }

  watcherProcess = spawn(helperPath, ['--watch'], {
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  let buffer = '';

  watcherProcess.stdout?.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const event = JSON.parse(trimmed);
        if (event.event === 'store_changed') {
          schedulePull();
        }
      } catch {
        // Ignore malformed lines
      }
    }
  });

  watcherProcess.on('exit', (code) => {
    watcherProcess = null;

    if (getSetting(SETTING_KEY_REMINDERS_SYNC_ENABLED) !== 'true') return;

    watcherRestartAttempts++;
    const delay = Math.min(
      WATCHER_RESTART_BASE_MS * Math.pow(2, watcherRestartAttempts - 1),
      WATCHER_RESTART_MAX_MS,
    );

    console.warn(
      `[reminders-sync] watcher exited (code ${code}), restarting in ${delay}ms (attempt ${watcherRestartAttempts})`,
    );

    watcherRestartTimer = setTimeout(() => {
      watcherRestartTimer = null;
      startWatcher();
    }, delay);
  });

  watcherRestartAttempts = 0;
}

function stopWatcher(): void {
  if (watcherRestartTimer) {
    clearTimeout(watcherRestartTimer);
    watcherRestartTimer = null;
  }

  if (watcherProcess) {
    watcherProcess.removeAllListeners();
    watcherProcess.kill();
    watcherProcess = null;
  }
}

// ─── Debounced push handler ─────────────────────────────────

function onTaskChange(_event: import('./taskService').TaskChangeEvent): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void pushChanges();
  }, DEBOUNCE_MS);
}

// ─── Debounced pull handler ─────────────────────────────────

function schedulePull(): void {
  if (pullDebounceTimer) clearTimeout(pullDebounceTimer);
  pullDebounceTimer = setTimeout(() => {
    pullDebounceTimer = null;
    void pullChanges();
  }, PULL_DEBOUNCE_MS);
}

// ─── External trigger for pull (e.g., on window focus) ─────────

export function triggerRemindersPull(): void {
  if (getSettingWithDefault(SETTING_KEY_REMINDERS_SYNC_ENABLED) !== 'true') return;
  if (!listId) return;
  schedulePull();
}

// ─── Public API ─────────────────────────────────────────────

export async function initRemindersSync(): Promise<void> {
  stopRemindersSync();

  const enabled = getSettingWithDefault(SETTING_KEY_REMINDERS_SYNC_ENABLED);
  if (enabled !== 'true') return;

  // Check access
  try {
    const accessResult = (await runHelper('--check-access')) as { status: string };
    if (accessResult.status !== 'authorized') {
      console.info(`[reminders-sync] not authorized (${accessResult.status}), skipping init`);
      return;
    }
  } catch (e) {
    console.error('[reminders-sync] access check failed:', e);
    return;
  }

  // Ensure list exists
  try {
    const cachedListId = getSetting(SETTING_KEY_REMINDERS_LIST_ID);
    if (cachedListId) {
      listId = cachedListId;
    } else {
      const result = (await runHelper('--ensure-list', { name: 'Untask' })) as { listId: string };
      listId = result.listId;
      setSetting(SETTING_KEY_REMINDERS_LIST_ID, listId);
    }
  } catch (e) {
    console.error('[reminders-sync] ensure-list failed:', e);
    return;
  }

  // Subscribe to task changes
  unsubscribeTaskChange = subscribeTaskChanges(onTaskChange);

  // Start watcher
  startWatcher();

  // Start polling fallback
  pollInterval = setInterval(() => {
    void pullChanges();
  }, POLL_INTERVAL_MS);

  // Run initial sync
  void runInitialSync();

  console.info('[reminders-sync] started');
}

export function stopRemindersSync(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  if (pullDebounceTimer) {
    clearTimeout(pullDebounceTimer);
    pullDebounceTimer = null;
  }

  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }

  if (unsubscribeTaskChange) {
    unsubscribeTaskChange();
    unsubscribeTaskChange = null;
  }

  stopWatcher();

  if (pushCooldownTimer) {
    clearTimeout(pushCooldownTimer);
    pushCooldownTimer = null;
  }

  pushInFlight = false;
  pullInFlight = false;
  recentlyPulled.clear();
  listId = null;
}

export function toggleRemindersSync(enabled: boolean): void {
  setSetting(SETTING_KEY_REMINDERS_SYNC_ENABLED, String(enabled));
  if (enabled) {
    void initRemindersSync();
  } else {
    stopRemindersSync();
  }
}

export function setRemindersSyncFilter(filter: string): void {
  if (filter !== 'due_date_only' && filter !== 'today' && filter !== 'all') {
    throw new Error(`Invalid sync filter: ${filter}`);
  }
  setSetting(SETTING_KEY_REMINDERS_SYNC_FILTER, filter);

  // Re-trigger push to sync filter changes
  if (getSetting(SETTING_KEY_REMINDERS_SYNC_ENABLED) === 'true') {
    void pushChanges();
  }
}

export function setRemindersImportEnabled(enabled: boolean): void {
  setSetting(SETTING_KEY_REMINDERS_IMPORT_ENABLED, String(enabled));
}

export async function requestRemindersAccess(): Promise<{ granted: boolean }> {
  const result = (await runHelper('--request-access')) as { granted: boolean };
  return result;
}

export async function forceRemindersSync(): Promise<void> {
  if (!listId) {
    throw new Error('Reminders sync is not active');
  }
  await pushChanges();
  await pullChanges();
}

export async function pullRemindersOnly(): Promise<void> {
  if (!listId) {
    throw new Error('Reminders sync is not active');
  }
  await pullChanges();
}

export type RemindersStatusResult = {
  enabled: boolean;
  authorized: boolean;
  syncFilter: SyncFilter;
  importEnabled: boolean;
  lastSyncAt: string | null;
  syncedCount: number;
};

export async function getRemindersStatus(): Promise<RemindersStatusResult> {
  const enabled = getSettingWithDefault(SETTING_KEY_REMINDERS_SYNC_ENABLED) === 'true';

  let authorized = false;
  try {
    const helperPath = getHelperPath();
    if (existsSync(helperPath)) {
      const accessResult = (await runHelper('--check-access')) as { status: string };
      authorized = accessResult.status === 'authorized';
    }
  } catch {
    // If helper isn't available, leave as false
  }

  const syncFilter = getSyncFilter();
  const mappings = getAllMappings();

  let lastSyncAt: string | null = null;
  for (const m of mappings) {
    if (m.lastSyncedAt && (!lastSyncAt || m.lastSyncedAt > lastSyncAt)) {
      lastSyncAt = m.lastSyncedAt;
    }
  }

  return {
    enabled,
    authorized,
    syncFilter,
    importEnabled: isImportEnabled(),
    lastSyncAt,
    syncedCount: mappings.length,
  };
}
