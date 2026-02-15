// ─── Shared model types ─────────────────────────────────────
// Standalone type declarations matching the Drizzle schema.
// Safe to import from any process (main, preload, renderer).
// Keep in sync with src/main/db/schema.ts.

export type Task = {
  id: string;
  parentId: string | null;
  title: string;
  body: string | null;
  status: 'inbox' | 'active' | 'in_progress' | 'done' | null;
  priority: 'none' | 'low' | 'medium' | 'high' | null;
  today: boolean | null;
  client: string | null;
  dueDate: string | null;
  dueType: 'hard' | 'soft' | null;
  effort: 'unknown' | 'tiny' | 'small' | 'medium' | 'deep' | null;
  invoiceStatus: 'none' | 'draft' | 'sent' | 'paid' | 'overdue' | null;
  valueAtRisk: number | null;
  lastClientTouchAt: string | null;
  order: number | null;
  createdAt: string | null;
  completedAt: string | null;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls: string | null;
  createdAt: string | null;
};

export type Scratchpad = {
  id: string;
  content: string;
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
