import {
  AnySQLiteColumn,
  sqliteTable,
  text,
  integer,
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
      enum: ['inbox', 'active', 'in_progress', 'waiting', 'review', 'someday', 'cancelled', 'done'],
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
    recurrence: text('recurrence'),
    recurrenceSourceId: text('recurrence_source_id'),
    reminderOffset: text('reminder_offset').default('at_due'),
    order: integer('order').default(0),
    createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
    completedAt: text('completed_at'),
    cancelledAt: text('cancelled_at'),
    deletedAt: text('deleted_at'),
  },
  (table) => [
    index('tasks_parent_id_idx').on(table.parentId),
    index('tasks_status_idx').on(table.status),
    index('tasks_today_idx').on(table.today),
    index('tasks_due_date_idx').on(table.dueDate),
    index('tasks_deleted_at_idx').on(table.deletedAt),
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
    isPinned: integer('is_pinned', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at'),
    deletedAt: text('deleted_at'),
  },
  (table) => [
    index('notes_status_idx').on(table.status),
    index('notes_created_at_idx').on(table.createdAt),
    index('notes_deleted_at_idx').on(table.deletedAt),
  ],
);

// ─── chat_messages ──────────────────────────────────────────
export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    title: text('title').notNull().default('New Thread'),
    isAutoTitle: integer('is_auto_title', { mode: 'boolean' })
      .notNull()
      .default(true),
    createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
    archivedAt: text('archived_at'),
  },
  (table) => [
    index('conversations_updated_at_idx').on(table.updatedAt),
    index('conversations_archived_at_idx').on(table.archivedAt),
  ],
);

export const chatMessages = sqliteTable(
  'chat_messages',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    conversationId: text('conversation_id').references(
      () => conversations.id,
      { onDelete: 'cascade', onUpdate: 'cascade' },
    ),
    role: text('role', { enum: ['user', 'assistant'] }).notNull(),
    content: text('content').notNull(),
    toolCalls: text('tool_calls'),
    chips: text('chips'),
    createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    index('chat_messages_created_at_idx').on(table.createdAt),
    index('chat_messages_conversation_id_idx').on(table.conversationId),
    index('chat_messages_conversation_id_created_at_idx').on(
      table.conversationId,
      table.createdAt,
    ),
  ],
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
      enum: ['create', 'update', 'move', 'complete', 'cancel', 'delete'],
    }).notNull(),
    before: text('before'),
    after: text('after'),
    source: text('source', { enum: ['user', 'ai', 'undo'] }).notNull(),
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

// ─── reminders_mapping ─────────────────────────────────────
export const remindersMappings = sqliteTable(
  'reminders_mapping',
  {
    taskId: text('task_id').primaryKey(),
    reminderId: text('reminder_id').notNull(),
    externalId: text('external_id'),
    lastSyncedAt: text('last_synced_at'),
    createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    index('idx_reminders_mapping_reminder_id').on(table.reminderId),
    index('idx_reminders_mapping_external_id').on(table.externalId),
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

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;

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

export type RemindersMapping = typeof remindersMappings.$inferSelect;
export type NewRemindersMapping = typeof remindersMappings.$inferInsert;
