export const TASK_STATUS_VALUES = [
  'inbox',
  'active',
  'in_progress',
  'waiting',
  'done',
] as const;

export type TaskStatus = (typeof TASK_STATUS_VALUES)[number];

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
  // TODO(flusk-task-ux): Remove after assistant risk/cashflow signal replacements ship.
  dueType: 'hard' | 'soft' | null;
  // TODO(flusk-task-ux): Remove after assistant risk/cashflow signal replacements ship.
  effort: 'unknown' | 'tiny' | 'small' | 'medium' | 'deep' | null;
  // TODO(flusk-task-ux): Remove after assistant risk/cashflow signal replacements ship.
  invoiceStatus: 'none' | 'draft' | 'sent' | 'paid' | 'overdue' | null;
  // TODO(flusk-task-ux): Remove after assistant risk/cashflow signal replacements ship.
  valueAtRisk: number | null;
  // TODO(flusk-task-ux): Remove after assistant risk/cashflow signal replacements ship.
  lastClientTouchAt: string | null;
  recurrence: string | null;
  recurrenceSourceId: string | null;
  order: number | null;
  createdAt: string | null;
  completedAt: string | null;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls: string | null;
  chips: string | null;
  createdAt: string | null;
};

export type Note = {
  id: string;
  title: string;
  content: string;
  status: 'active' | 'archived';
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
