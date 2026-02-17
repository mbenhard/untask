import {
  AnySQLiteColumn,
  sqliteTable,
  text,
  integer,
  real,
  index,
} from 'drizzle-orm/sqlite-core';

// ─── tasks ──────────────────────────────────────────────────
export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    parentId: text('parent_id').references(
      (): AnySQLiteColumn => tasks.id,
      { onDelete: 'set null', onUpdate: 'cascade' },
    ),
    title: text('title').notNull(),
    body: text('body'),
    status: text('status', {
      enum: ['inbox', 'active', 'in_progress', 'waiting', 'done'],
    }).default('inbox'),
    priority: text('priority', {
      enum: ['none', 'low', 'medium', 'high'],
    }).default('none'),
    today: integer('today', { mode: 'boolean' }).default(false),
    client: text('client'),
    dueDate: text('due_date'),
    dueType: text('due_type', { enum: ['hard', 'soft'] }),
    effort: text('effort', {
      enum: ['unknown', 'tiny', 'small', 'medium', 'deep'],
    }).default('unknown'),
    invoiceStatus: text('invoice_status', {
      enum: ['none', 'draft', 'sent', 'paid', 'overdue'],
    }),
    valueAtRisk: real('value_at_risk'),
    lastClientTouchAt: text('last_client_touch_at'),
    recurrence: text('recurrence'),
    recurrenceSourceId: text('recurrence_source_id'),
    order: integer('order').default(0),
    createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
    completedAt: text('completed_at'),
  },
  (table) => [
    index('tasks_parent_id_idx').on(table.parentId),
    index('tasks_status_idx').on(table.status),
    index('tasks_today_idx').on(table.today),
    index('tasks_due_date_idx').on(table.dueDate),
  ],
);

// ─── notes ──────────────────────────────────────────────────
export const notes = sqliteTable(
  'notes',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    title: text('title').notNull(),
    content: text('content').notNull().default(''),
    status: text('status', { enum: ['active', 'archived'] })
      .notNull()
      .default('active'),
    createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at'),
  },
  (table) => [
    index('notes_status_idx').on(table.status),
    index('notes_created_at_idx').on(table.createdAt),
  ],
);

// ─── chat_messages ──────────────────────────────────────────
export const chatMessages = sqliteTable(
  'chat_messages',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    role: text('role', { enum: ['user', 'assistant'] }).notNull(),
    content: text('content').notNull(),
    toolCalls: text('tool_calls'),
    chips: text('chips'),
    createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  },
  (table) => [index('chat_messages_created_at_idx').on(table.createdAt)],
);

// ─── task_events ────────────────────────────────────────────
export const taskEvents = sqliteTable(
  'task_events',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    taskId: text('task_id').notNull(),
    action: text('action', {
      enum: ['create', 'update', 'move', 'complete', 'delete'],
    }).notNull(),
    before: text('before'),
    after: text('after'),
    source: text('source', { enum: ['user', 'ai'] }).notNull(),
    createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    index('task_events_task_id_idx').on(table.taskId),
    index('task_events_created_at_idx').on(table.createdAt),
  ],
);

// ─── ai_journal ─────────────────────────────────────────────
export const aiJournal = sqliteTable(
  'ai_journal',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    content: text('content').notNull(),
    category: text('category', {
      enum: ['pattern', 'progress', 'preference', 'summary'],
    }).notNull(),
    createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  },
  (table) => [index('ai_journal_created_at_idx').on(table.createdAt)],
);

// ─── ai_journal_archive ─────────────────────────────────────
export const aiJournalArchive = sqliteTable(
  'ai_journal_archive',
  {
    id: text('id').primaryKey(),
    content: text('content').notNull(),
    category: text('category', {
      enum: ['pattern', 'progress', 'preference', 'summary'],
    }).notNull(),
    createdAt: text('created_at').notNull(),
    archivedAt: text('archived_at').$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    index('ai_journal_archive_created_at_idx').on(table.createdAt),
    index('ai_journal_archive_archived_at_idx').on(table.archivedAt),
  ],
);

// ─── settings ───────────────────────────────────────────────
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

// ─── memory_events ──────────────────────────────────────────
export const memoryEvents = sqliteTable(
  'memory_events',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    layer: text('layer', { enum: ['soul', 'profile', 'patterns', 'identity', 'memory'] }).notNull(),
    before: text('before').notNull(),
    after: text('after').notNull(),
    source: text('source', { enum: ['user', 'ai', 'system'] }).notNull(),
    createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    index('memory_events_layer_idx').on(table.layer),
    index('memory_events_created_at_idx').on(table.createdAt),
  ],
);

// ─── Exported types ─────────────────────────────────────────
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;

export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;

export type TaskEvent = typeof taskEvents.$inferSelect;
export type NewTaskEvent = typeof taskEvents.$inferInsert;

export type AiJournal = typeof aiJournal.$inferSelect;
export type NewAiJournal = typeof aiJournal.$inferInsert;
export type AiJournalArchive = typeof aiJournalArchive.$inferSelect;
export type NewAiJournalArchive = typeof aiJournalArchive.$inferInsert;

export type Setting = typeof settings.$inferSelect;
export type MemoryEvent = typeof memoryEvents.$inferSelect;
export type NewMemoryEvent = typeof memoryEvents.$inferInsert;
