// ─── Predefined status palette ──────────────────────────────
// Curated set of statuses users can toggle on/off and reorder.

export const PREDEFINED_STATUSES = [
  { id: 'inbox',       label: 'Inbox',       defaultEnabled: true,  locked: true,  terminal: false },
  { id: 'active',      label: 'Backlog',     defaultEnabled: true,  locked: false, terminal: false },
  { id: 'in_progress', label: 'In Progress', defaultEnabled: true,  locked: false, terminal: false },
  { id: 'waiting',     label: 'On Hold',     defaultEnabled: true,  locked: false, terminal: false },
  { id: 'review',      label: 'Review',      defaultEnabled: false, locked: false, terminal: false },
  { id: 'someday',     label: 'Someday',     defaultEnabled: false, locked: false, terminal: false },
  { id: 'cancelled',   label: 'Cancelled',   defaultEnabled: false, locked: false, terminal: true  },
  { id: 'done',        label: 'Done',        defaultEnabled: true,  locked: true,  terminal: true  },
] as const;

export type PredefinedStatusId = (typeof PREDEFINED_STATUSES)[number]['id'];

export const TASK_STATUS_VALUES = [
  'inbox', 'active', 'in_progress', 'waiting', 'review', 'someday', 'cancelled', 'done',
] as const;

export type TaskStatus = (typeof TASK_STATUS_VALUES)[number];

// ─── Task status config (stored in settings table) ──────────
export type TaskStatusConfig = {
  enabled: PredefinedStatusId[];
  order: PredefinedStatusId[];  // view order, excludes inbox (always separate)
};

// ─── Status helpers ─────────────────────────────────────────

const statusMap = new Map(PREDEFINED_STATUSES.map((s) => [s.id, s]));

export function getStatusDef(id: PredefinedStatusId) {
  const statusDef = statusMap.get(id);
  if (!statusDef) {
    throw new Error(`Unknown task status id: ${id}`);
  }
  return statusDef;
}

export function getStatusLabel(id: PredefinedStatusId): string {
  return statusMap.get(id)?.label ?? id;
}

export function isTerminalStatus(id: PredefinedStatusId): boolean {
  return statusMap.get(id)?.terminal ?? false;
}

export const TERMINAL_STATUSES: PredefinedStatusId[] =
  PREDEFINED_STATUSES.filter((s) => s.terminal).map((s) => s.id);

export function getDefaultStatusConfig(): TaskStatusConfig {
  const enabled = PREDEFINED_STATUSES.filter((s) => s.defaultEnabled).map((s) => s.id);
  const order = PREDEFINED_STATUSES
    .filter((s) => s.defaultEnabled && s.id !== 'inbox')
    .map((s) => s.id);
  return { enabled, order };
}

// ─── Shared model types ─────────────────────────────────────
// Standalone type declarations matching the Drizzle schema.
// Safe to import from any process (main, preload, renderer).
// Keep in sync with src/main/db/schema.ts.

export type Task = {
  id: string;
  parentId: string | null;
  title: string;
  body: string | null;
  status: TaskStatus | null;
  priority: 'none' | 'low' | 'medium' | 'high' | null;
  today: boolean | null;
  client: string | null;
  dueDate: string | null;
  // TODO(untask-task-ux): Remove after assistant risk/cashflow signal replacements ship.
  dueType: 'hard' | 'soft' | null;
  // TODO(untask-task-ux): Remove after assistant risk/cashflow signal replacements ship.
  effort: 'unknown' | 'tiny' | 'small' | 'medium' | 'deep' | null;
  recurrence: string | null;
  recurrenceSourceId: string | null;
  reminderOffset: string | null;
  order: number | null;
  createdAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
};

export type ChatMessage = {
  id: string;
  conversationId: string | null;
  role: 'user' | 'assistant';
  content: string;
  toolCalls: string | null;
  chips: string | null;
  createdAt: string | null;
};

export type Conversation = {
  id: string;
  title: string;
  isAutoTitle: boolean | null;
  createdAt: string | null;
  updatedAt: string | null;
  archivedAt: string | null;
};

export type Note = {
  id: string;
  title: string;
  content: string;
  status: 'active' | 'archived';
  isPinned: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type Setting = {
  key: string;
  value: string;
};

export type AiJournal = {
  id: string;
  content: string;
  category: 'pattern' | 'progress' | 'preference' | 'summary';
  createdAt: string | null;
};
