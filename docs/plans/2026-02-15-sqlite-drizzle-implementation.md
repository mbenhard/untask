# SQLite + Drizzle ORM Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add persistent SQLite storage to the Flusk Electron app with Drizzle ORM, domain-first IPC handlers, and Zod-validated mutations.

**Architecture:** better-sqlite3 runs in the Electron main process with WAL mode. Drizzle ORM provides type-safe schema and query building. Services encapsulate business logic. IPC handlers expose domain operations to the renderer via the existing `window.flusk` bridge.

**Tech Stack:** better-sqlite3, drizzle-orm, drizzle-kit, zod

**Design doc:** `docs/plans/2026-02-15-sqlite-drizzle-design.md`

---

### Task 1: Install Dependencies and Configure Native Module Build

**Files:**
- Modify: `flusk/package.json`
- Modify: `flusk/vite.main.config.ts`
- Modify: `flusk/forge.config.ts`

**Step 1: Install production dependencies**

Run from `flusk/`:
```bash
npm install better-sqlite3 drizzle-orm zod
```

**Step 2: Install dev dependencies**

```bash
npm install -D drizzle-kit @types/better-sqlite3 electron-rebuild
```

**Step 3: Add rebuild and db scripts to package.json**

Add these scripts (keep all existing scripts):
```json
{
  "scripts": {
    "rebuild": "electron-rebuild -f -w better-sqlite3",
    "postinstall": "electron-rebuild -f -w better-sqlite3",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio"
  }
}
```

**Step 4: Externalize better-sqlite3 in vite.main.config.ts**

Replace the entire file content with:
```typescript
import { defineConfig } from 'vite';
import { viteAliases } from './vite.aliases';

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: viteAliases,
  },
  build: {
    rollupOptions: {
      external: ['better-sqlite3'],
    },
  },
});
```

**Step 5: Add AutoUnpackNatives plugin to forge.config.ts**

The `@electron-forge/plugin-auto-unpack-natives` is already a devDependency. Import and add it to the plugins array in `forge.config.ts`:
```typescript
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';

// Add to plugins array (before VitePlugin):
new AutoUnpackNativesPlugin({}),
```

**Step 6: Run rebuild and verify**

```bash
cd flusk && npm run rebuild
```
Expected: Completes without errors. No `NODE_MODULE_VERSION` mismatch.

**Step 7: Verify app starts**

```bash
cd flusk && npm start
```
Expected: App launches without native module errors.

**Step 8: Commit**

```bash
git add flusk/package.json flusk/package-lock.json flusk/vite.main.config.ts flusk/forge.config.ts
git commit -m "feat(db): install better-sqlite3, drizzle-orm, zod and configure native module build"
```

---

### Task 2: Define Drizzle Schema for All 6 Tables

**Files:**
- Create: `flusk/src/main/db/schema.ts`

**Step 1: Create the schema file**

Create `flusk/src/main/db/schema.ts` with all 6 tables, indexes, and exported types:

```typescript
import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

// ─── tasks ──────────────────────────────────────────────────
export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    parentId: text('parent_id'),
    title: text('title').notNull(),
    body: text('body'),
    status: text('status', {
      enum: ['inbox', 'active', 'in_progress', 'done'],
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

// ─── scratchpad ─────────────────────────────────────────────
export const scratchpad = sqliteTable('scratchpad', {
  id: text('id').primaryKey(),
  content: text('content').notNull().default(''),
  updatedAt: text('updated_at'),
});

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

// ─── settings ───────────────────────────────────────────────
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

// ─── Exported types ─────────────────────────────────────────
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

export type Scratchpad = typeof scratchpad.$inferSelect;

export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;

export type TaskEvent = typeof taskEvents.$inferSelect;
export type NewTaskEvent = typeof taskEvents.$inferInsert;

export type AiJournal = typeof aiJournal.$inferSelect;
export type NewAiJournal = typeof aiJournal.$inferInsert;

export type Setting = typeof settings.$inferSelect;
```

**Step 2: Verify TypeScript compiles**

```bash
cd flusk && npx tsc --noEmit -p tsconfig.main.json
```
Expected: No errors.

**Step 3: Commit**

```bash
git add flusk/src/main/db/schema.ts
git commit -m "feat(db): define Drizzle schema for all 6 tables with indexes and exported types"
```

---

### Task 3: Create Database Initialization Module

**Files:**
- Create: `flusk/src/main/db/index.ts`

**Step 1: Create the database initialization module**

Create `flusk/src/main/db/index.ts`:

```typescript
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { app } from 'electron';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import * as schema from './schema';

let _sqlite: Database.Database | null = null;
let _db: BetterSQLite3Database<typeof schema> | null = null;

export function getDbPath(): string {
  const userDataPath = app.getPath('userData');
  if (!existsSync(userDataPath)) {
    mkdirSync(userDataPath, { recursive: true });
  }
  return path.join(userDataPath, 'flusk.db');
}

export function initDatabase(): BetterSQLite3Database<typeof schema> {
  if (_db) return _db;

  const dbPath = getDbPath();
  _sqlite = new Database(dbPath);
  _sqlite.pragma('journal_mode = WAL');
  _sqlite.pragma('foreign_keys = ON');

  _db = drizzle({ client: _sqlite, schema });
  return _db;
}

export function getDb(): BetterSQLite3Database<typeof schema> {
  if (!_db) throw new Error('Database not initialized. Call initDatabase() first.');
  return _db;
}

export function closeDatabase(): void {
  if (_sqlite) {
    _sqlite.close();
    _sqlite = null;
    _db = null;
  }
}
```

**Step 2: Verify TypeScript compiles**

```bash
cd flusk && npx tsc --noEmit -p tsconfig.main.json
```
Expected: No errors.

**Step 3: Commit**

```bash
git add flusk/src/main/db/index.ts
git commit -m "feat(db): add database initialization singleton with WAL mode and foreign keys"
```

---

### Task 4: Set Up Drizzle Kit Migrations and Wire Into App Startup

**Files:**
- Create: `flusk/drizzle.config.ts`
- Create: `flusk/src/main/db/migrate.ts`
- Modify: `flusk/src/main/index.ts`
- Modify: `flusk/forge.config.ts` (extraResources for drizzle folder)

**Step 1: Create drizzle.config.ts**

Create `flusk/drizzle.config.ts` at the flusk project root:

```typescript
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/main/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: './dev.db',
  },
} satisfies Config;
```

**Step 2: Generate the initial migration**

```bash
cd flusk && npm run db:generate
```
Expected: Creates `flusk/drizzle/` folder with migration SQL files containing CREATE TABLE statements for all 6 tables.

**Step 3: Create the migration runner**

Create `flusk/src/main/db/migrate.ts`:

```typescript
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { app } from 'electron';
import path from 'node:path';

import { getDb } from './index';

export function runMigrations(): void {
  const db = getDb();
  const migrationsFolder = app.isPackaged
    ? path.join(process.resourcesPath, 'drizzle')
    : path.join(__dirname, '../../../drizzle');
  migrate(db, { migrationsFolder });
}
```

Note: The `__dirname` path traversal (`../../../drizzle`) accounts for the Vite build output location (`.vite/build/`) relative to the project root where `drizzle/` lives. Verify this path is correct by checking where `__dirname` resolves during dev. If needed, adjust to use `app.getAppPath()` instead:

```typescript
// Alternative if __dirname path is wrong:
const migrationsFolder = app.isPackaged
  ? path.join(process.resourcesPath, 'drizzle')
  : path.join(app.getAppPath(), 'drizzle');
```

**Step 4: Wire database init and migrations into app startup**

Modify `flusk/src/main/index.ts`:

Add imports at the top (after existing imports):
```typescript
import { initDatabase, closeDatabase } from './db';
import { runMigrations } from './db/migrate';
```

Update the `bootstrap` function to init DB before IPC registration:
```typescript
const bootstrap = (): void => {
  initDatabase();
  runMigrations();
  registerIpcHandlers();

  mainWindow = createMainWindow();
  setupTray(mainWindow);
  registerGlobalShortcuts(mainWindow);
};
```

Add closeDatabase to the `will-quit` handler:
```typescript
app.on('will-quit', () => {
  unregisterGlobalShortcuts();
  closeDatabase();
});
```

**Step 5: Add drizzle folder to packaged app resources**

In `flusk/forge.config.ts`, update `packagerConfig`:
```typescript
packagerConfig: {
  asar: true,
  extraResource: ['./drizzle'],
  extendInfo: {
    LSUIElement: true,
  },
},
```

**Step 6: Add dev.db and drizzle meta to .gitignore**

Check if `flusk/.gitignore` exists and add:
```
dev.db
```

The `drizzle/` folder with migration SQL files SHOULD be committed (they're needed for production). Only `dev.db` is ignored.

**Step 7: Verify TypeScript compiles**

```bash
cd flusk && npx tsc --noEmit -p tsconfig.main.json
```
Expected: No errors.

**Step 8: Start app and verify database creation**

```bash
cd flusk && npm start
```
Expected: App starts. Check `~/Library/Application Support/flusk/` (or `Flusk/`) for `flusk.db` file.

Verify the file exists:
```bash
ls -la ~/Library/Application\ Support/flusk/flusk.db
```

**Step 9: Commit**

```bash
git add flusk/drizzle.config.ts flusk/src/main/db/migrate.ts flusk/src/main/index.ts flusk/forge.config.ts flusk/drizzle/ flusk/.gitignore
git commit -m "feat(db): add Drizzle migrations, wire DB init into app startup, include migrations in package"
```

---

### Task 5: Create Service Layer (Task, Chat, Scratchpad, Settings Services)

**Files:**
- Create: `flusk/src/main/services/taskService.ts`
- Create: `flusk/src/main/services/chatService.ts`
- Create: `flusk/src/main/services/scratchpadService.ts`
- Create: `flusk/src/main/services/settingsService.ts`

**Step 1: Create taskService.ts**

```typescript
import { eq, asc, desc } from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from '../db';
import { tasks, taskEvents, type Task, type NewTask } from '../db/schema';

// ─── Validation schemas ─────────────────────────────────────
export const createTaskSchema = z.object({
  title: z.string().min(1),
  parentId: z.string().nullable().optional(),
  body: z.string().nullable().optional(),
  status: z.enum(['inbox', 'active', 'in_progress', 'done']).optional(),
  priority: z.enum(['none', 'low', 'medium', 'high']).optional(),
  today: z.boolean().optional(),
  client: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  dueType: z.enum(['hard', 'soft']).nullable().optional(),
  effort: z.enum(['unknown', 'tiny', 'small', 'medium', 'deep']).optional(),
  invoiceStatus: z.enum(['none', 'draft', 'sent', 'paid', 'overdue']).nullable().optional(),
  valueAtRisk: z.number().nullable().optional(),
  lastClientTouchAt: z.string().nullable().optional(),
  order: z.number().optional(),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  id: z.string(),
});

// ─── Service functions ──────────────────────────────────────
function logTaskEvent(
  taskId: string,
  action: 'create' | 'update' | 'move' | 'complete' | 'delete',
  source: 'user' | 'ai',
  before: Task | null,
  after: Task | null,
): void {
  const db = getDb();
  db.insert(taskEvents).values({
    taskId,
    action,
    source,
    before: before ? JSON.stringify(before) : null,
    after: after ? JSON.stringify(after) : null,
  }).run();
}

export function listTasks(filter?: {
  status?: string;
  parentId?: string | null;
  today?: boolean;
}): Task[] {
  const db = getDb();
  let query = db.select().from(tasks);

  if (filter?.status) {
    query = query.where(eq(tasks.status, filter.status)) as typeof query;
  }
  if (filter?.today !== undefined) {
    query = query.where(eq(tasks.today, filter.today)) as typeof query;
  }
  if (filter?.parentId !== undefined) {
    query = query.where(eq(tasks.parentId, filter.parentId)) as typeof query;
  }

  return query.orderBy(asc(tasks.order)).all();
}

export function createTask(
  input: z.infer<typeof createTaskSchema>,
  source: 'user' | 'ai' = 'user',
): Task {
  const validated = createTaskSchema.parse(input);
  const db = getDb();

  const [created] = db
    .insert(tasks)
    .values(validated as NewTask)
    .returning()
    .all();

  logTaskEvent(created.id, 'create', source, null, created);
  return created;
}

export function updateTask(
  input: z.infer<typeof updateTaskSchema>,
  source: 'user' | 'ai' = 'user',
): Task {
  const validated = updateTaskSchema.parse(input);
  const { id, ...updates } = validated;
  const db = getDb();

  const [before] = db.select().from(tasks).where(eq(tasks.id, id)).all();
  if (!before) throw new Error(`Task not found: ${id}`);

  const [updated] = db
    .update(tasks)
    .set(updates)
    .where(eq(tasks.id, id))
    .returning()
    .all();

  logTaskEvent(id, 'update', source, before, updated);
  return updated;
}

export function deleteTask(id: string, source: 'user' | 'ai' = 'user'): void {
  const db = getDb();

  const [before] = db.select().from(tasks).where(eq(tasks.id, id)).all();
  if (!before) throw new Error(`Task not found: ${id}`);

  db.delete(tasks).where(eq(tasks.id, id)).run();

  logTaskEvent(id, 'delete', source, before, null);
}

export function completeTask(id: string, source: 'user' | 'ai' = 'user'): Task {
  const db = getDb();

  const [before] = db.select().from(tasks).where(eq(tasks.id, id)).all();
  if (!before) throw new Error(`Task not found: ${id}`);

  const [updated] = db
    .update(tasks)
    .set({ status: 'done', completedAt: new Date().toISOString() })
    .where(eq(tasks.id, id))
    .returning()
    .all();

  logTaskEvent(id, 'complete', source, before, updated);
  return updated;
}

export function toggleToday(id: string, source: 'user' | 'ai' = 'user'): Task {
  const db = getDb();

  const [before] = db.select().from(tasks).where(eq(tasks.id, id)).all();
  if (!before) throw new Error(`Task not found: ${id}`);

  const [updated] = db
    .update(tasks)
    .set({ today: !before.today })
    .where(eq(tasks.id, id))
    .returning()
    .all();

  logTaskEvent(id, 'update', source, before, updated);
  return updated;
}

export function reorderTasks(
  orderedIds: string[],
  source: 'user' | 'ai' = 'user',
): void {
  const db = getDb();

  for (let i = 0; i < orderedIds.length; i++) {
    db.update(tasks)
      .set({ order: i })
      .where(eq(tasks.id, orderedIds[i]))
      .run();
  }
}
```

**Step 2: Create chatService.ts**

```typescript
import { desc } from 'drizzle-orm';

import { getDb } from '../db';
import { chatMessages, type ChatMessage, type NewChatMessage } from '../db/schema';

export function getChatHistory(): ChatMessage[] {
  const db = getDb();
  return db.select().from(chatMessages).orderBy(desc(chatMessages.createdAt)).all();
}

export function saveChatMessage(message: Omit<NewChatMessage, 'id' | 'createdAt'>): ChatMessage {
  const db = getDb();
  const [created] = db.insert(chatMessages).values(message).returning().all();
  return created;
}

export function clearChatHistory(): void {
  const db = getDb();
  db.delete(chatMessages).run();
}
```

**Step 3: Create scratchpadService.ts**

```typescript
import { eq } from 'drizzle-orm';

import { getDb } from '../db';
import { scratchpad, type Scratchpad } from '../db/schema';

const SCRATCHPAD_ID = 'main';

export function getScratchpad(): Scratchpad {
  const db = getDb();
  const [existing] = db.select().from(scratchpad).where(eq(scratchpad.id, SCRATCHPAD_ID)).all();

  if (existing) return existing;

  // Create default row on first access
  const [created] = db
    .insert(scratchpad)
    .values({ id: SCRATCHPAD_ID, content: '', updatedAt: new Date().toISOString() })
    .returning()
    .all();
  return created;
}

export function saveScratchpad(content: string): Scratchpad {
  const db = getDb();

  // Upsert: insert or update
  const [result] = db
    .insert(scratchpad)
    .values({ id: SCRATCHPAD_ID, content, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({
      target: scratchpad.id,
      set: { content, updatedAt: new Date().toISOString() },
    })
    .returning()
    .all();

  return result;
}
```

**Step 4: Create settingsService.ts**

```typescript
import { eq } from 'drizzle-orm';

import { getDb } from '../db';
import { settings, type Setting } from '../db/schema';

export function getSetting(key: string): string | null {
  const db = getDb();
  const [row] = db.select().from(settings).where(eq(settings.key, key)).all();
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): Setting {
  const db = getDb();
  const [result] = db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value },
    })
    .returning()
    .all();
  return result;
}

export function getAllSettings(): Setting[] {
  const db = getDb();
  return db.select().from(settings).all();
}
```

**Step 5: Verify TypeScript compiles**

```bash
cd flusk && npx tsc --noEmit -p tsconfig.main.json
```
Expected: No errors.

**Step 6: Commit**

```bash
git add flusk/src/main/services/
git commit -m "feat(db): add task, chat, scratchpad, and settings service layers with Zod validation"
```

---

### Task 6: Create Domain-First IPC Handlers

**Files:**
- Modify: `flusk/src/types/ipc.ts`
- Modify: `flusk/src/main/ipc.ts`

**Step 1: Add new IPC channel constants to types/ipc.ts**

Add these new channels to the existing `IPC_CHANNELS` constant (keep all existing channels):

```typescript
// Add to IPC_CHANNELS:
TASK_LIST: 'task:list',
TASK_CREATE: 'task:create',
TASK_UPDATE: 'task:update',
TASK_DELETE: 'task:delete',
TASK_REORDER: 'task:reorder',
TASK_COMPLETE: 'task:complete',
TASK_TOGGLE_TODAY: 'task:toggle-today',
CHAT_SEND: 'chat:send',
CHAT_HISTORY: 'chat:history',
CHAT_CLEAR: 'chat:clear',
SCRATCHPAD_GET: 'scratchpad:get',
SCRATCHPAD_SAVE: 'scratchpad:save',
SETTINGS_GET: 'settings:get',
SETTINGS_SET: 'settings:set',
SETTINGS_GET_ALL: 'settings:get-all',
```

**Step 2: Register new IPC handlers in ipc.ts**

Add imports for the service functions at the top of `flusk/src/main/ipc.ts`:

```typescript
import {
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  completeTask,
  toggleToday,
  reorderTasks,
} from './services/taskService';
import { getChatHistory, saveChatMessage, clearChatHistory } from './services/chatService';
import { getScratchpad, saveScratchpad } from './services/scratchpadService';
import { getSetting, setSetting, getAllSettings } from './services/settingsService';
```

Add these handler registrations inside `registerIpcHandlers()`, after the existing handlers:

```typescript
// ─── Task handlers ────────────────────────────────────────
ipcMain.handle(IPC_CHANNELS.TASK_LIST, (_event, filter?) => listTasks(filter));
ipcMain.handle(IPC_CHANNELS.TASK_CREATE, (_event, input) => createTask(input));
ipcMain.handle(IPC_CHANNELS.TASK_UPDATE, (_event, input) => updateTask(input));
ipcMain.handle(IPC_CHANNELS.TASK_DELETE, (_event, id: string) => deleteTask(id));
ipcMain.handle(IPC_CHANNELS.TASK_REORDER, (_event, ids: string[]) => reorderTasks(ids));
ipcMain.handle(IPC_CHANNELS.TASK_COMPLETE, (_event, id: string) => completeTask(id));
ipcMain.handle(IPC_CHANNELS.TASK_TOGGLE_TODAY, (_event, id: string) => toggleToday(id));

// ─── Chat handlers ───────────────────────────────────────
ipcMain.handle(IPC_CHANNELS.CHAT_SEND, (_event, message) => saveChatMessage(message));
ipcMain.handle(IPC_CHANNELS.CHAT_HISTORY, () => getChatHistory());
ipcMain.handle(IPC_CHANNELS.CHAT_CLEAR, () => clearChatHistory());

// ─── Scratchpad handlers ─────────────────────────────────
ipcMain.handle(IPC_CHANNELS.SCRATCHPAD_GET, () => getScratchpad());
ipcMain.handle(IPC_CHANNELS.SCRATCHPAD_SAVE, (_event, content: string) => saveScratchpad(content));

// ─── Settings handlers ───────────────────────────────────
ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (_event, key: string) => getSetting(key));
ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_event, key: string, value: string) => setSetting(key, value));
ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_ALL, () => getAllSettings());
```

**Step 3: Verify TypeScript compiles**

```bash
cd flusk && npx tsc --noEmit -p tsconfig.main.json
```
Expected: No errors.

**Step 4: Commit**

```bash
git add flusk/src/types/ipc.ts flusk/src/main/ipc.ts
git commit -m "feat(db): register domain-first IPC handlers for task, chat, scratchpad, and settings"
```

---

### Task 7: Extend Preload Bridge and Update Type Declarations

**Files:**
- Modify: `flusk/src/preload/index.ts`
- Modify: `flusk/src/types/preload.d.ts`
- Modify: `flusk/src/types/ipc.ts` (add payload type exports if needed)

**Step 1: Extend the preload API**

Add the new domain methods to `fluskApi` in `flusk/src/preload/index.ts`. Add these as nested objects alongside the existing flat methods:

```typescript
// Add after existing fluskApi properties:
tasks: {
  list: (filter?: { status?: string; parentId?: string | null; today?: boolean }) =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_LIST, filter),
  create: (input: Record<string, unknown>) =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_CREATE, input),
  update: (input: Record<string, unknown>) =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_UPDATE, input),
  delete: (id: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_DELETE, id),
  reorder: (ids: string[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_REORDER, ids),
  complete: (id: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_COMPLETE, id),
  toggleToday: (id: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_TOGGLE_TODAY, id),
},
chat: {
  send: (message: { role: string; content: string; toolCalls?: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.CHAT_SEND, message),
  history: () => ipcRenderer.invoke(IPC_CHANNELS.CHAT_HISTORY),
  clear: () => ipcRenderer.invoke(IPC_CHANNELS.CHAT_CLEAR),
},
scratchpad: {
  get: () => ipcRenderer.invoke(IPC_CHANNELS.SCRATCHPAD_GET),
  save: (content: string) => ipcRenderer.invoke(IPC_CHANNELS.SCRATCHPAD_SAVE, content),
},
settings: {
  get: (key: string) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, key),
  set: (key: string, value: string) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, key, value),
  getAll: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_ALL),
},
```

**Step 2: Update the FluskApi type declaration**

Update `flusk/src/types/preload.d.ts` to include the new nested types. Import the schema types and add them to the `FluskApi` type:

```typescript
import type { Task, ChatMessage, Scratchpad, Setting } from '../main/db/schema';
```

Add to FluskApi:
```typescript
tasks: {
  list: (filter?: { status?: string; parentId?: string | null; today?: boolean }) => Promise<Task[]>;
  create: (input: Record<string, unknown>) => Promise<Task>;
  update: (input: Record<string, unknown>) => Promise<Task>;
  delete: (id: string) => Promise<void>;
  reorder: (ids: string[]) => Promise<void>;
  complete: (id: string) => Promise<Task>;
  toggleToday: (id: string) => Promise<Task>;
};
chat: {
  send: (message: { role: string; content: string; toolCalls?: string }) => Promise<ChatMessage>;
  history: () => Promise<ChatMessage[]>;
  clear: () => Promise<void>;
};
scratchpad: {
  get: () => Promise<Scratchpad>;
  save: (content: string) => Promise<Scratchpad>;
};
settings: {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<Setting>;
  getAll: () => Promise<Setting[]>;
};
```

**Step 3: Verify TypeScript compiles across all configs**

```bash
cd flusk && npx tsc --noEmit -p tsconfig.main.json && npx tsc --noEmit -p tsconfig.preload.json && npx tsc --noEmit -p tsconfig.renderer.json
```
Expected: No errors on all three.

**Step 4: Commit**

```bash
git add flusk/src/preload/index.ts flusk/src/types/preload.d.ts flusk/src/types/ipc.ts
git commit -m "feat(db): extend window.flusk preload bridge with task, chat, scratchpad, and settings APIs"
```

---

### Task 8: Update Assistant Types to Use Drizzle Schema Types

**Files:**
- Modify: `flusk/src/types/assistant.ts`
- Modify: `flusk/src/main/assistant/contextCompiler.ts` (import path changes)

**Step 1: Replace data entity types in assistant.ts**

In `flusk/src/types/assistant.ts`:

- Remove `AssistantTaskStatus`, `AssistantTaskPriority`, `AssistantJournalCategory` type aliases
- Remove `AssistantTaskSnapshot` type (replaced by `Task` from schema)
- Remove `AssistantJournalEntry` type (replaced by `AiJournal` from schema)
- Add re-exports from schema:

```typescript
// At the top of assistant.ts:
export type { Task, AiJournal } from '../main/db/schema';
```

- Update `AssistantMemorySnapshot` to use the re-exported type:
```typescript
import type { AiJournal } from '../main/db/schema';

export type AssistantMemorySnapshot = {
  profile: string;
  patterns: string;
  journalEntries: AiJournal[];
};
```

- Update `AssistantLiveContext` to use `Task`:
```typescript
import type { Task } from '../main/db/schema';

export type AssistantLiveContext = {
  tasks: Task[];
  inboxCount: number;
  now?: string;
  timezone?: string;
};
```

- Keep ALL other types unchanged (kernel types, memory policy types, proactive trigger types, orchestration types)

**Step 2: Update contextCompiler.ts imports**

In `flusk/src/main/assistant/contextCompiler.ts`, update imports:

Replace:
```typescript
import type {
  AssistantLiveContext,
  AssistantMemorySnapshot,
  AssistantTaskPriority,
  AssistantTaskSnapshot,
  IdentityContextDebugSnapshot,
  IdentityContextSectionSnapshot,
} from '../../types/assistant';
```

With:
```typescript
import type { Task } from '../db/schema';
import type {
  AssistantLiveContext,
  AssistantMemorySnapshot,
  IdentityContextDebugSnapshot,
  IdentityContextSectionSnapshot,
} from '../../types/assistant';
```

Then update any internal references:
- `AssistantTaskSnapshot` → `Task`
- `AssistantTaskPriority` → `Task['priority']`

**Step 3: Update ipc.ts empty defaults**

In `flusk/src/main/ipc.ts`, update the empty defaults that reference assistant types. The `EMPTY_MEMORY` and `EMPTY_LIVE_CONTEXT` types should still work since `AssistantMemorySnapshot` and `AssistantLiveContext` are still exported (just updated internally).

**Step 4: Verify TypeScript compiles across all configs**

```bash
cd flusk && npx tsc --noEmit -p tsconfig.main.json && npx tsc --noEmit -p tsconfig.preload.json && npx tsc --noEmit -p tsconfig.renderer.json
```
Expected: No errors.

**Step 5: Start app to verify nothing is broken**

```bash
cd flusk && npm start
```
Expected: App starts normally.

**Step 6: Commit**

```bash
git add flusk/src/types/assistant.ts flusk/src/main/assistant/contextCompiler.ts flusk/src/main/ipc.ts
git commit -m "refactor(types): replace AssistantTaskSnapshot and AssistantJournalEntry with Drizzle schema types"
```

---

### Task 9: End-to-End Verification

**Step 1: Start app fresh**

Delete any existing database to test clean install:
```bash
rm -f ~/Library/Application\ Support/flusk/flusk.db
cd flusk && npm start
```
Expected: App creates new database, runs migrations, starts normally.

**Step 2: Verify database structure**

```bash
sqlite3 ~/Library/Application\ Support/flusk/flusk.db ".tables"
```
Expected output should include: `ai_journal`, `chat_messages`, `scratchpad`, `settings`, `task_events`, `tasks`

**Step 3: Verify tables have correct columns**

```bash
sqlite3 ~/Library/Application\ Support/flusk/flusk.db ".schema tasks"
```
Expected: Shows all 17 columns matching the schema.

**Step 4: Verify WAL mode**

```bash
sqlite3 ~/Library/Application\ Support/flusk/flusk.db "PRAGMA journal_mode;"
```
Expected: `wal`

**Step 5: Commit final state (if any cleanup needed)**

If all verifications pass, create a final summary commit if there were any fixups:
```bash
git add -A && git commit -m "feat(db): complete SQLite + Drizzle ORM implementation (Task 3)"
```

---

## Summary of All Files

### New Files (8)
| File | Purpose |
|------|---------|
| `flusk/src/main/db/schema.ts` | Drizzle schema for all 6 tables |
| `flusk/src/main/db/index.ts` | DB initialization singleton |
| `flusk/src/main/db/migrate.ts` | Migration runner |
| `flusk/src/main/services/taskService.ts` | Task CRUD + audit logging |
| `flusk/src/main/services/chatService.ts` | Chat message persistence |
| `flusk/src/main/services/scratchpadService.ts` | Scratchpad read/write |
| `flusk/src/main/services/settingsService.ts` | Settings key-value store |
| `flusk/drizzle.config.ts` | Drizzle Kit configuration |

### Modified Files (7)
| File | Change |
|------|--------|
| `flusk/package.json` | New deps + scripts |
| `flusk/vite.main.config.ts` | Externalize better-sqlite3 |
| `flusk/forge.config.ts` | AutoUnpackNatives + extraResource |
| `flusk/src/main/index.ts` | DB init + migrations in bootstrap |
| `flusk/src/main/ipc.ts` | New domain IPC handlers |
| `flusk/src/preload/index.ts` | Extended window.flusk API |
| `flusk/src/types/ipc.ts` | New channel constants |
| `flusk/src/types/preload.d.ts` | New FluskApi type members |
| `flusk/src/types/assistant.ts` | Use Drizzle types for Task/AiJournal |
| `flusk/src/main/assistant/contextCompiler.ts` | Updated imports |

### Generated (not hand-written)
| File | Purpose |
|------|---------|
| `flusk/drizzle/` | Migration SQL files (generated by drizzle-kit) |
