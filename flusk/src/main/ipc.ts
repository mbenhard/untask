import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import { z } from 'zod';
import {
  type ChatModelCatalogResult,
  type ChatKernelOrchestrationRequestPayload,
  type ChatKernelOrchestrationResultPayload,
  type ChatKernelStatusResultPayload,

  type ChatHistoryRequest,
  type ChatListThreadsRequest,
  type ChatListThreadsResult,
  type ChatCreateThreadRequest,
  type ChatCreateThreadResult,
  type ChatArchiveThreadRequest,
  type ChatDeleteThreadRequest,
  type ChatRetentionResult,
  type ChatSendRequest,
  type ChatSendResult,
  type ChatSelectedModelResult,
  type ChatSetModelRequest,
  type ChatSetRetentionRequest,
  type ChatUndoRequest,
  type ChatUndoResult,
  type ChatAutonomyModeResult,
  type ChatSetAutonomyModeRequest,
  type ChatResolvePendingActionRequest,
  type ChatResolvePendingActionResponse,
  type ChatListPendingActionsResponse,
  IPC_CHANNELS,
  type IdentityContextSnapshotRequest,
  type IdentityContextSnapshotResult,
  type MemoryPromotionConfirmRequestPayload,
  type MemoryPromotionConfirmResultPayload,
  type MemoryPromotionEvaluationRequestPayload,
  type MemoryPromotionEvaluationResultPayload,
  type SettingsBootstrapState,
  type SettingsMemoryStatePayload,
  type SettingsMemoryHistoryRequestPayload,
  type SettingsMemoryHistoryResultPayload,
  type SettingsMemoryUpdateRequestPayload,
  type SettingsUndoMemoryEventRequestPayload,
  type SettingsUndoMemoryEventResultPayload,
  type SettingsReadJournalRequestPayload,
  type SettingsReadJournalResultPayload,
  type TaskDeleteRequestPayload,
  type TaskCompleteRequestPayload,
  type SearchQueryRequest,
  type SearchQueryResponse,
  type BackupListResponse,
  type BackupMetadataPayload,
  type BackupExportRequest,
  type BackupExportDialogRequest,
  type BackupExportDialogResponse,
  type BackupImportRequest,
  type BackupImportDialogRequest,
  type BackupImportDialogResponse,
  type WindowDismissModeResult,
} from '../types/ipc';
import type { MemoryLayer } from '../types/assistant';
import { buildCanonicalRuntimeContext } from './ai/contextBuilder';
import { buildSystemPrompt } from './ai/systemPrompt';
import { closeDatabase, initDatabase } from './db';
import { runMigrations } from './db/migrate';
import { getIdentity, getMemory, setIdentity, setMemory } from './ai/memory';
import {
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  completeTask,
  cancelTask,
  reopenTask,
  toggleToday,
  reorderTasks,
  undoLastAiTaskEvent,
  undoTaskEvent,
  getTaskStatusConfig,
  setTaskStatusConfig,
} from './services/taskService';
import {
  archiveConversation,
  createConversation,
  clearChatHistory,
  deleteConversation,
  ensureConversation,
  getConversationMessages,
  getChatRetentionMode,
  listConversations,
  setChatRetentionMode,
} from './services/chatService';
import { readJournalEntries } from './services/journalService';
import { listMemoryEvents, undoMemoryEvents } from './services/memoryService';
import {
  createNote,
  getNote,
  saveNote,
  archiveNote,
  deleteNote,
  listNotes,
} from './services/notesService';
import {
  createBackup,
  exportBackup,
  importBackup,
  listBackups,
} from './services/backupService';
import { initChatSearchFts, initSearchFts, searchTasks } from './services/searchService';
import { getSetting, setSetting, getAllSettings } from './services/settingsService';
import { cancelActiveChatTurns, startChatTurn } from './ai/chat';

import { getModels, getSelectedModelId, setSelectedModelId } from './ai/models';
import {
  getAutonomyMode,
  setAutonomyMode,
  loadPendingActions,
  requeuePendingAction,
  removePendingAction,
  getPendingAction,
} from './ai/autonomy';
import { executeToolCall } from './ai/tools';
import { refreshTodayBadge } from './tray';
import {
  requestHideFromRenderer,
  onEscapeLayerExit,
  getWindowDismissMode,
  setWindowDismissMode,
} from './window/summonController';
import { windowDismissModeSchema } from './window/dismissMode';

const settingsMemoryUpdateSchema = z
  .object({
    identity: z.string().optional(),
    memory: z.string().optional(),
  })
  .refine(
    (value) =>
      value.identity !== undefined ||
      value.memory !== undefined,
    {
      message: 'At least one memory field must be provided.',
    },
  );

const settingsReadJournalSchema = z.object({
  category: z.enum(['pattern', 'progress', 'preference', 'summary']).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  days_back: z.number().int().min(1).max(90).optional(),
  daysBack: z.number().int().min(1).max(90).optional(),
});

const resolvePendingActionSchema = z.object({
  actionId: z.string().min(1),
  decision: z.enum(['approve', 'reject']),
});

const taskDeleteRequestSchema = z.union([
  z.string().min(1),
  z.object({
    id: z.string().min(1),
    cascade: z.boolean().optional(),
  }),
]);

const taskCompleteRequestSchema = z.union([
  z.string().min(1),
  z.object({
    id: z.string().min(1),
    completeChildren: z.boolean().optional(),
  }),
]);

const chatSendSchema = z.object({
  content: z.string(),
  modelId: z.string().nullable().optional(),
  conversationId: z.string().min(1).optional(),
  images: z.array(z.string().min(1)).optional(),
  noteContext: z
    .object({
      noteId: z.string().min(1),
      title: z.string().min(1),
      markdown: z.string().min(1),
    })
    .optional(),
});
const chatHistoryRequestSchema = z.object({
  conversationId: z.string().min(1),
});
const chatListThreadsSchema = z.object({
  includeArchived: z.boolean().optional(),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).max(10_000).optional(),
});
const chatCreateThreadSchema = z.object({
  title: z.string().min(1).max(120).optional(),
});
const chatThreadMutationSchema = z.object({
  conversationId: z.string().min(1),
});

const noteIdSchema = z.string().min(1);
const noteTitleSchema = z.string().max(200).optional();
const noteSaveSchema = z.object({
  id: z.string().min(1),
  content: z.string(),
  title: z.string().max(200).optional(),
});

const memoryHistoryRequestSchema = z.object({
  layer: z.enum(['soul', 'profile', 'patterns', 'identity', 'memory']).optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

const undoMemoryEventRequestSchema = z.object({
  eventId: z.string().min(1).optional(),
  steps: z.number().int().min(1).max(20).optional(),
});

const launchAtLoginSchema = z.boolean();
const backupExportRequestSchema = z.object({
  destination: z.string().min(1),
  passphrase: z.string().optional(),
});
const backupImportRequestSchema = z.object({
  source: z.string().min(1),
  passphrase: z.string().optional(),
});
const backupDialogRequestSchema = z.object({
  passphrase: z.string().optional(),
});

const getMemoryState = (): SettingsMemoryStatePayload => ({
  identity: getIdentity(),
  memory: getMemory(),
});

const backupTimestamp = (): string => new Date().toISOString().replace(/[:.]/g, '-');
const BACKUP_JOB_TIMEOUT_MS = 120_000;

const withTimeout = async <T>(
  task: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> => {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([task, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

const notifyBackupRestored = (): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue;
    }

    window.webContents.send(IPC_CHANNELS.APP_BACKUP_RESTORED);
  }
};

const reinitializeDatabase = (): void => {
  initDatabase();
  runMigrations();
  initSearchFts();
  initChatSearchFts();
  refreshTodayBadge();
};

const restoreBackupAndReloadRuntime = async (request: BackupImportRequest): Promise<void> => {
  closeDatabase();

  try {
    await importBackup(request.source, request.passphrase);
  } catch (error) {
    // Keep runtime usable if restore attempt fails.
    reinitializeDatabase();
    throw error;
  }

  reinitializeDatabase();
  notifyBackupRestored();
};

export const registerIpcHandlers = (): void => {
  if (ipcMain.listenerCount(IPC_CHANNELS.SETTINGS_GET_BOOTSTRAP_STATE) > 0) {
    return;
  }

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET_BOOTSTRAP_STATE,
    (): SettingsBootstrapState => ({
      status: 'ready',
    }),
  );

  // ─── App/window lifecycle handlers ─────────────────────
  ipcMain.handle(IPC_CHANNELS.APP_REQUEST_HIDE, () => {
    requestHideFromRenderer();
  });

  ipcMain.handle(IPC_CHANNELS.APP_ESCAPE_LAYER_EXIT, () => {
    onEscapeLayerExit();
  });

  ipcMain.handle(IPC_CHANNELS.APP_GET_LAUNCH_AT_LOGIN, () => {
    const stored = getSetting('app.launchAtLogin');
    const enabled = stored === 'true';
    const supported =
      process.platform === 'win32' || (process.platform === 'darwin' && app.isPackaged);
    return { enabled, applied: supported };
  });

  ipcMain.handle(IPC_CHANNELS.APP_SET_LAUNCH_AT_LOGIN, (_event, enabledInput: unknown) => {
    const enabled = launchAtLoginSchema.parse(enabledInput);
    setSetting('app.launchAtLogin', String(enabled));
    const supported =
      process.platform === 'win32' || (process.platform === 'darwin' && app.isPackaged);

    if (!supported) {
      return {
        enabled,
        applied: false,
        error: 'Launch at login is unavailable in this runtime.',
      };
    }

    try {
      app.setLoginItemSettings({ openAtLogin: enabled });
      return { enabled, applied: true };
    } catch (error) {
      return {
        enabled,
        applied: false,
        error: error instanceof Error ? error.message : 'Failed to apply login item setting',
      };
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.APP_GET_WINDOW_DISMISS_MODE,
    (): WindowDismissModeResult => {
      return { mode: getWindowDismissMode() };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.APP_SET_WINDOW_DISMISS_MODE,
    (_event, modeInput: unknown): WindowDismissModeResult => {
      const mode = windowDismissModeSchema.parse(modeInput);
      return { mode: setWindowDismissMode(mode) };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET_IDENTITY_CONTEXT_SNAPSHOT,
    async (
      _event,
      request?: IdentityContextSnapshotRequest,
    ): Promise<IdentityContextSnapshotResult> => {
      const { liveContext } = buildCanonicalRuntimeContext();
      const result = buildSystemPrompt({
        userMessage: request?.request ?? '',
        liveContext: request?.liveContext
          ? { ...liveContext, ...request.liveContext }
          : liveContext,
      });
      return result.contextSnapshot;
    },
  );

  // Memory promotion removed — AI decides directly via tools.
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_EVALUATE_MEMORY_PROMOTION,
    (
      _event,
      _request: MemoryPromotionEvaluationRequestPayload,
    ): MemoryPromotionEvaluationResultPayload => ({
      action: 'journal_only',
      proposedLayer: 'identity',
      proposedEntry: '',
      confidence: 0,
      requiresConfirmation: false,
      reasons: [],
      impactSignals: [],
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_CONFIRM_MEMORY_PROMOTION,
    (
      _event,
      _request: MemoryPromotionConfirmRequestPayload,
    ): MemoryPromotionConfirmResultPayload => ({
      resolved: false,
      decision: {
        action: 'journal_only',
        proposedLayer: 'identity',
        proposedEntry: '',
        confidence: 0,
        requiresConfirmation: false,
        reasons: [],
        impactSignals: [],
      },
    }),
  );

  // Identity kernel status — always ready (identity is in DB now).
  ipcMain.handle(
    IPC_CHANNELS.CHAT_GET_KERNEL_STATUS,
    async (): Promise<ChatKernelStatusResultPayload> => ({
      ready: true,
      diagnostics: [],
    }),
  );

  // Orchestration endpoint — returns system prompt snapshot.
  ipcMain.handle(
    IPC_CHANNELS.CHAT_ORCHESTRATE_WITH_KERNEL,
    async (
      _event,
      request: ChatKernelOrchestrationRequestPayload,
    ): Promise<ChatKernelOrchestrationResultPayload> => {
      const { liveContext } = buildCanonicalRuntimeContext();
      const result = buildSystemPrompt({
        userMessage: request.userMessage,
        liveContext: request.liveContext
          ? { ...liveContext, ...request.liveContext }
          : liveContext,
      });
      return {
        ok: true,
        kernelStatus: { ready: true, diagnostics: [] },
        context: result.contextSnapshot,
      };
    },
  );

  // ─── Task handlers ────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.TASK_LIST, (_event, filter?) => {
    try { return listTasks(filter); }
    catch (e) { console.error('[ipc] TASK_LIST:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.TASK_CREATE, (_event, input) => {
    try { const result = createTask(input); refreshTodayBadge(); return result; }
    catch (e) { console.error('[ipc] TASK_CREATE:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.TASK_UPDATE, (_event, input) => {
    try { const result = updateTask(input); refreshTodayBadge(); return result; }
    catch (e) { console.error('[ipc] TASK_UPDATE:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.TASK_DELETE, (_event, request: TaskDeleteRequestPayload) => {
    try {
      const validated = taskDeleteRequestSchema.parse(request);
      const payload = typeof validated === 'string' ? { id: validated } : validated;
      deleteTask(payload.id, 'user', { cascade: payload.cascade === true });
      refreshTodayBadge();
    }
    catch (e) { console.error('[ipc] TASK_DELETE:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.TASK_REORDER, (_event, ids: string[]) => {
    try { reorderTasks(ids); }
    catch (e) { console.error('[ipc] TASK_REORDER:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.TASK_COMPLETE, (_event, request: TaskCompleteRequestPayload) => {
    try {
      const validated = taskCompleteRequestSchema.parse(request);
      const payload = typeof validated === 'string' ? { id: validated } : validated;
      const { completed } = completeTask(payload.id, 'user', {
        completeChildren: payload.completeChildren === true,
      });
      refreshTodayBadge();
      return completed;
    }
    catch (e) { console.error('[ipc] TASK_COMPLETE:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.TASK_TOGGLE_TODAY, (_event, id: string) => {
    try { const result = toggleToday(id); refreshTodayBadge(); return result; }
    catch (e) { console.error('[ipc] TASK_TOGGLE_TODAY:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.TASK_CANCEL, (_event, id: string) => {
    try { const result = cancelTask(id, 'user'); refreshTodayBadge(); return result; }
    catch (e) { console.error('[ipc] TASK_CANCEL:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.TASK_REOPEN, (_event, id: string) => {
    try { const result = reopenTask(id, 'user'); refreshTodayBadge(); return result; }
    catch (e) { console.error('[ipc] TASK_REOPEN:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.TASK_GET_STATUSES, () => {
    try { return getTaskStatusConfig(); }
    catch (e) { console.error('[ipc] TASK_GET_STATUSES:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.TASK_SET_STATUSES, (_event, config) => {
    try { return setTaskStatusConfig(config); }
    catch (e) { console.error('[ipc] TASK_SET_STATUSES:', e); throw e; }
  });

  ipcMain.handle(IPC_CHANNELS.CHAT_CANCEL, () => {
    try { cancelActiveChatTurns(); }
    catch (e) { console.error('[ipc] CHAT_CANCEL:', e); throw e; }
  });

  // ─── Chat handlers ───────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.CHAT_SEND,
    async (event, message: ChatSendRequest): Promise<ChatSendResult> => {
    try {
      const parsedMessage = chatSendSchema.parse(message ?? {});
      const content = parsedMessage.content.trim();
      if (content.length === 0) {
        throw new Error('Chat content cannot be empty.');
      }

      const images = Array.isArray(parsedMessage.images) ? parsedMessage.images.filter(
        (img): img is string => typeof img === 'string' && img.length > 0,
      ) : undefined;

      return startChatTurn({
        content,
        conversationId: parsedMessage.conversationId,
        modelId: parsedMessage.modelId,
        images: images?.length ? images : undefined,
        noteContext: parsedMessage.noteContext,
        emit: (streamEvent): void => {
          if (event.sender.isDestroyed()) {
            return;
          }

          event.sender.send(IPC_CHANNELS.CHAT_STREAM_EVENT, streamEvent);
        },
      });
    }
    catch (e) { console.error('[ipc] CHAT_SEND:', e); throw e; }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAT_HISTORY,
    (_event, request: ChatHistoryRequest) => {
      try {
        const parsed = chatHistoryRequestSchema.parse(request ?? {});
        const conversation = ensureConversation(parsed.conversationId);
        return getConversationMessages(conversation.id);
      }
      catch (e) { console.error('[ipc] CHAT_HISTORY:', e); throw e; }
    },
  );
  ipcMain.handle(IPC_CHANNELS.CHAT_CLEAR, () => {
    try {
      cancelActiveChatTurns();
      clearChatHistory();
    }
    catch (e) { console.error('[ipc] CHAT_CLEAR:', e); throw e; }
  });
  ipcMain.handle(
    IPC_CHANNELS.CHAT_LIST_THREADS,
    (_event, request?: ChatListThreadsRequest): ChatListThreadsResult => {
      try {
        const parsed = chatListThreadsSchema.parse(request ?? {});
        return listConversations(parsed);
      }
      catch (e) { console.error('[ipc] CHAT_LIST_THREADS:', e); throw e; }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.CHAT_CREATE_THREAD,
    (_event, request?: ChatCreateThreadRequest): ChatCreateThreadResult => {
      try {
        const parsed = chatCreateThreadSchema.parse(request ?? {});
        const created = createConversation({
          title: parsed.title,
          isAutoTitle: !parsed.title,
        });
        const listed = listConversations({ includeArchived: true, limit: 1, offset: 0 });
        const conversation =
          listed.conversations.find((entry) => entry.id === created.id) ??
          {
            id: created.id,
            title: created.title,
            isAutoTitle: created.isAutoTitle ?? true,
            createdAt: created.createdAt,
            updatedAt: created.updatedAt,
            archivedAt: created.archivedAt,
            messageCount: 0,
          };
        return { conversation };
      }
      catch (e) { console.error('[ipc] CHAT_CREATE_THREAD:', e); throw e; }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.CHAT_ARCHIVE_THREAD,
    (_event, request: ChatArchiveThreadRequest): void => {
      try {
        const parsed = chatThreadMutationSchema.parse(request ?? {});
        archiveConversation(parsed.conversationId);
      }
      catch (e) { console.error('[ipc] CHAT_ARCHIVE_THREAD:', e); throw e; }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.CHAT_DELETE_THREAD,
    (_event, request: ChatDeleteThreadRequest): void => {
      try {
        const parsed = chatThreadMutationSchema.parse(request ?? {});
        deleteConversation(parsed.conversationId);
      }
      catch (e) { console.error('[ipc] CHAT_DELETE_THREAD:', e); throw e; }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.CHAT_GET_MODELS,
    (): ChatModelCatalogResult => {
      try {
        const selectedModelId = getSelectedModelId();

        return getModels().map((model) => ({
          id: model.id,
          label: model.label,
          inputCostPerMillion: model.inputCostPerMillion,
          outputCostPerMillion: model.outputCostPerMillion,
          defaultSelected: model.defaultSelected,
          selected: model.id === selectedModelId,
        }));
      }
      catch (e) { console.error('[ipc] CHAT_GET_MODELS:', e); throw e; }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.CHAT_GET_SELECTED_MODEL,
    (): ChatSelectedModelResult => {
      try {
        return { modelId: getSelectedModelId() };
      }
      catch (e) { console.error('[ipc] CHAT_GET_SELECTED_MODEL:', e); throw e; }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.CHAT_SET_SELECTED_MODEL,
    (_event, request: ChatSetModelRequest): ChatSelectedModelResult => {
      try {
        if (!request || typeof request.modelId !== 'string') {
          throw new Error('Invalid model selection payload.');
        }

        return { modelId: setSelectedModelId(request.modelId) };
      }
      catch (e) { console.error('[ipc] CHAT_SET_SELECTED_MODEL:', e); throw e; }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.CHAT_UNDO_LAST_ACTION,
    (_event, request?: ChatUndoRequest): ChatUndoResult => {
      try {
        const result = request?.taskEventId
          ? undoTaskEvent(request.taskEventId, 'user')
          : undoLastAiTaskEvent('user');

        if (!result) {
          return {
            ok: true,
            undone: false,
            message: 'No AI action available to undo.',
          };
        }

        return {
          ok: true,
          undone: result.undone,
          message: result.undone
            ? 'Undid AI action successfully.'
            : (result.reason ?? 'No changes were made by undo.'),
          targetTaskId: result.targetTaskId,
          originalEventId: result.originalEventId,
          undoEventId: result.undoEventId,
        };
      }
      catch (e) { console.error('[ipc] CHAT_UNDO_LAST_ACTION:', e); throw e; }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.CHAT_GET_RETENTION_MODE,
    (): ChatRetentionResult => {
      try {
        return { mode: getChatRetentionMode() };
      }
      catch (e) { console.error('[ipc] CHAT_GET_RETENTION_MODE:', e); throw e; }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.CHAT_SET_RETENTION_MODE,
    (_event, request: ChatSetRetentionRequest): ChatRetentionResult => {
      try {
        if (
          !request ||
          (request.mode !== 'session' &&
            request.mode !== '30d' &&
            request.mode !== 'forever')
        ) {
          throw new Error('Invalid chat retention mode payload.');
        }

        return { mode: setChatRetentionMode(request.mode) };
      }
      catch (e) { console.error('[ipc] CHAT_SET_RETENTION_MODE:', e); throw e; }
    },
  );
  // ─── Autonomy handlers ────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.CHAT_GET_AUTONOMY_MODE,
    (): ChatAutonomyModeResult => {
      try {
        return { mode: getAutonomyMode() };
      }
      catch (e) { console.error('[ipc] CHAT_GET_AUTONOMY_MODE:', e); throw e; }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.CHAT_SET_AUTONOMY_MODE,
    (_event, request: ChatSetAutonomyModeRequest): ChatAutonomyModeResult => {
      try {
        if (
          !request ||
          (request.mode !== 'auto' &&
            request.mode !== 'confirm')
        ) {
          throw new Error('Invalid autonomy mode payload.');
        }
        return { mode: setAutonomyMode(request.mode) };
      }
      catch (e) { console.error('[ipc] CHAT_SET_AUTONOMY_MODE:', e); throw e; }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.CHAT_LIST_PENDING_ACTIONS,
    (): ChatListPendingActionsResponse => {
      try {
        return { actions: loadPendingActions() };
      }
      catch (e) { console.error('[ipc] CHAT_LIST_PENDING_ACTIONS:', e); throw e; }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.CHAT_RESOLVE_PENDING_ACTION,
    async (_event, request: ChatResolvePendingActionRequest): Promise<ChatResolvePendingActionResponse> => {
      try {
        const validatedRequest = resolvePendingActionSchema.parse(request ?? {});

        const pending = getPendingAction(validatedRequest.actionId);
        if (!pending) {
          return {
            ok: false,
            actionId: validatedRequest.actionId,
            lifecycle: 'rejected',
            message: 'Pending action not found (may have already been resolved).',
          };
        }

        if (validatedRequest.decision === 'reject') {
          removePendingAction(validatedRequest.actionId);
          return {
            ok: true,
            actionId: validatedRequest.actionId,
            lifecycle: 'rejected',
            message: 'Action rejected. No changes were made.',
          };
        }

        // Approve: execute the stored tool payload with autonomy bypass
        removePendingAction(validatedRequest.actionId);

        let result;
        try {
          result = await executeToolCall(
            { name: pending.toolName, input: pending.input },
            {
              toolCallId: `autonomy-approve-${validatedRequest.actionId}`,
              autonomyBypass: true,
            },
          );
        } catch (execError) {
          // Restore pending action on execution failure
          requeuePendingAction(pending);
          throw execError;
        }

        if (result.ok) {
          return {
            ok: true,
            actionId: validatedRequest.actionId,
            lifecycle: 'executed',
            message: result.output.message,
            taskEventId: result.output.actionCard?.taskEventId,
            actionCard: result.output.actionCard,
          };
        }

        // Execution returned an error — restore pending action for retry
        requeuePendingAction(pending);

        return {
          ok: false,
          actionId: validatedRequest.actionId,
          lifecycle: 'pending',
          message: result.error.message,
        };
      }
      catch (e) { console.error('[ipc] CHAT_RESOLVE_PENDING_ACTION:', e); throw e; }
    },
  );

  // ─── Notes handlers ─────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.NOTES_LIST, () => {
    try { return listNotes(); }
    catch (e) { console.error('[ipc] NOTES_LIST:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.NOTES_GET, (_event, idInput: string) => {
    try {
      const id = noteIdSchema.parse(idInput);
      return getNote(id);
    }
    catch (e) { console.error('[ipc] NOTES_GET:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.NOTES_CREATE, (_event, titleInput?: string) => {
    try {
      const title = noteTitleSchema.parse(titleInput);
      return createNote(title);
    }
    catch (e) { console.error('[ipc] NOTES_CREATE:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.NOTES_SAVE, (_event, idInput: string, contentInput: string, titleInput?: string) => {
    try {
      const validated = noteSaveSchema.parse({
        id: idInput,
        content: contentInput,
        title: titleInput,
      });
      return saveNote(validated.id, validated.content, validated.title);
    }
    catch (e) { console.error('[ipc] NOTES_SAVE:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.NOTES_ARCHIVE, (_event, idInput: string) => {
    try {
      const id = noteIdSchema.parse(idInput);
      return archiveNote(id);
    }
    catch (e) { console.error('[ipc] NOTES_ARCHIVE:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.NOTES_DELETE, (_event, idInput: string) => {
    try {
      const id = noteIdSchema.parse(idInput);
      return deleteNote(id);
    }
    catch (e) { console.error('[ipc] NOTES_DELETE:', e); throw e; }
  });

  // ─── Backup handlers ─────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.BACKUP_LIST,
    async (): Promise<BackupListResponse> => {
      try {
        return {
          backups: await withTimeout(
            listBackups(),
            BACKUP_JOB_TIMEOUT_MS,
            'Backup listing',
          ),
        };
      }
      catch (e) { console.error('[ipc] BACKUP_LIST:', e); throw e; }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.BACKUP_CREATE,
    async (): Promise<BackupMetadataPayload> => {
      try {
        return await withTimeout(
          createBackup(),
          BACKUP_JOB_TIMEOUT_MS,
          'Backup creation',
        );
      }
      catch (e) { console.error('[ipc] BACKUP_CREATE:', e); throw e; }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.BACKUP_EXPORT,
    async (_event, request: BackupExportRequest): Promise<void> => {
      try {
        const validated = backupExportRequestSchema.parse(request ?? {});
        await withTimeout(
          exportBackup(validated.destination, validated.passphrase),
          BACKUP_JOB_TIMEOUT_MS,
          'Backup export',
        );
      }
      catch (e) { console.error('[ipc] BACKUP_EXPORT:', e); throw e; }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.BACKUP_IMPORT,
    async (_event, request: BackupImportRequest): Promise<void> => {
      try {
        const validated = backupImportRequestSchema.parse(request ?? {});
        await withTimeout(
          restoreBackupAndReloadRuntime(validated),
          BACKUP_JOB_TIMEOUT_MS,
          'Backup import',
        );
      }
      catch (e) { console.error('[ipc] BACKUP_IMPORT:', e); throw e; }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.BACKUP_EXPORT_DIALOG,
    async (
      event,
      request?: BackupExportDialogRequest,
    ): Promise<BackupExportDialogResponse> => {
      try {
        const validated = backupDialogRequestSchema.parse(request ?? {});
        const extension = validated.passphrase?.trim() ? 'taskdb.enc' : 'taskdb';
        const defaultPath = path.join(
          app.getPath('documents'),
          `flusk-backup-${backupTimestamp()}.${extension}`,
        );
        const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
        const dialogOptions = {
          title: 'Export Flusk backup',
          defaultPath,
          filters: [
            { name: 'Flusk Backup', extensions: ['taskdb', 'enc', 'db'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        };
        const result = owner
          ? await dialog.showSaveDialog(owner, dialogOptions)
          : await dialog.showSaveDialog(dialogOptions);

        if (result.canceled || !result.filePath) {
          return { canceled: true };
        }

        await withTimeout(
          exportBackup(result.filePath, validated.passphrase?.trim() || undefined),
          BACKUP_JOB_TIMEOUT_MS,
          'Backup export',
        );
        return { canceled: false, destination: result.filePath };
      }
      catch (e) { console.error('[ipc] BACKUP_EXPORT_DIALOG:', e); throw e; }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.BACKUP_IMPORT_DIALOG,
    async (
      event,
      request?: BackupImportDialogRequest,
    ): Promise<BackupImportDialogResponse> => {
      try {
        const validated = backupDialogRequestSchema.parse(request ?? {});
        const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
        const dialogOptions = {
          title: 'Import Flusk backup',
          properties: ['openFile' as const],
          filters: [
            { name: 'Flusk Backup', extensions: ['taskdb', 'enc', 'db'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        };
        const result = owner
          ? await dialog.showOpenDialog(owner, dialogOptions)
          : await dialog.showOpenDialog(dialogOptions);

        const source = result.filePaths[0];
        if (result.canceled || !source) {
          return { canceled: true, restored: false };
        }

        await withTimeout(
          restoreBackupAndReloadRuntime({
            source,
            passphrase: validated.passphrase?.trim() || undefined,
          }),
          BACKUP_JOB_TIMEOUT_MS,
          'Backup import',
        );
        return { canceled: false, source, restored: true };
      }
      catch (e) { console.error('[ipc] BACKUP_IMPORT_DIALOG:', e); throw e; }
    },
  );

  // ─── Search handlers ─────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.SEARCH_QUERY,
    (_event, request: SearchQueryRequest): SearchQueryResponse => {
      try {
        return searchTasks({
          query: request.query,
          limit: request.limit,
        });
      }
      catch (e) { console.error('[ipc] SEARCH_QUERY:', e); throw e; }
    },
  );

  // ─── Settings handlers ───────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (_event, key: string) => {
    try { return getSetting(key); }
    catch (e) { console.error('[ipc] SETTINGS_GET:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_event, key: string, value: string) => {
    try { return setSetting(key, value); }
    catch (e) { console.error('[ipc] SETTINGS_SET:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_ALL, () => {
    try { return getAllSettings(); }
    catch (e) { console.error('[ipc] SETTINGS_GET_ALL:', e); throw e; }
  });
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET_MEMORY_STATE,
    (): SettingsMemoryStatePayload => {
      try { return getMemoryState(); }
      catch (e) { console.error('[ipc] SETTINGS_GET_MEMORY_STATE:', e); throw e; }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_UPDATE_MEMORY_STATE,
    (_event, payload: SettingsMemoryUpdateRequestPayload): SettingsMemoryStatePayload => {
      try {
        const validated = settingsMemoryUpdateSchema.parse(payload ?? {});

        if (validated.identity !== undefined) {
          setIdentity(validated.identity);
        }
        if (validated.memory !== undefined) {
          setMemory(validated.memory);
        }

        return getMemoryState();
      }
      catch (e) { console.error('[ipc] SETTINGS_UPDATE_MEMORY_STATE:', e); throw e; }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET_MEMORY_HISTORY,
    (
      _event,
      payload?: SettingsMemoryHistoryRequestPayload,
    ): SettingsMemoryHistoryResultPayload => {
      try {
        const validated = memoryHistoryRequestSchema.parse(payload ?? {});
        return {
          events: listMemoryEvents({
            layer: validated.layer as MemoryLayer | undefined,
            limit: validated.limit,
          }),
        };
      }
      catch (e) { console.error('[ipc] SETTINGS_GET_MEMORY_HISTORY:', e); throw e; }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_UNDO_MEMORY_EVENT,
    (
      _event,
      payload?: SettingsUndoMemoryEventRequestPayload,
    ): SettingsUndoMemoryEventResultPayload => {
      try {
        const validated = undoMemoryEventRequestSchema.parse(payload ?? {});
        const result = undoMemoryEvents({
          eventId: validated.eventId,
          steps: validated.steps,
          source: 'user',
        });
        return {
          state: getMemoryState(),
          revertedEventIds: result.revertedEventIds,
        };
      }
      catch (e) { console.error('[ipc] SETTINGS_UNDO_MEMORY_EVENT:', e); throw e; }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_READ_JOURNAL,
    (_event, payload?: SettingsReadJournalRequestPayload): SettingsReadJournalResultPayload => {
      try {
        const validated = settingsReadJournalSchema.parse(payload ?? {});

        return {
          entries: readJournalEntries({
            category: validated.category,
            limit: validated.limit,
            days_back: validated.days_back,
            daysBack: validated.daysBack,
          }),
        };
      }
      catch (e) { console.error('[ipc] SETTINGS_READ_JOURNAL:', e); throw e; }
    },
  );
};
