# SQLite Database with Drizzle ORM — Design

**Task:** 3 (Implement SQLite Database with Drizzle ORM)
**Date:** 2026-02-15
**Status:** Approved

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| SQLite driver | better-sqlite3 | Fastest, battle-tested, standard for Electron |
| ORM | Drizzle ORM | Type-safe, lightweight, great SQLite support |
| Type strategy | Drizzle schema = source of truth | Replace data types (Task, AiJournal) with Drizzle inferred types. Keep composite view types (MemorySnapshot, LiveContext) and kernel-specific types. |
| IPC namespace | Extend `window.flusk` | One unified API for renderer |
| IPC style | Domain-first channels | `task:*`, `chat:*`, `scratchpad:*`, `settings:*` — no raw DB access |

## 1. Dependencies & Native Module Setup

**Production:** `better-sqlite3`, `drizzle-orm`
**Dev:** `drizzle-kit`, `@types/better-sqlite3`

**Native module compilation:**
- Add `electron-rebuild` as dev dependency
- Add `postinstall` script: `electron-rebuild -f -w better-sqlite3`
- Externalize `better-sqlite3` in `vite.main.config.ts` (Rollup external)
- Ensure `forge.config.ts` includes `better-sqlite3` native `.node` binaries in the ASAR package

**Verification:** App starts without `NODE_MODULE_VERSION` mismatch; `:memory:` DB works in main process.

## 2. Database Schema

**File:** `src/main/db/schema.ts`

### 6 Tables

#### tasks (17 fields)
| Field | Type | Notes |
|-------|------|-------|
| id | text PK | UUID via `crypto.randomUUID()` |
| parentId | text | Self-reference for subtasks |
| title | text NOT NULL | |
| body | text | |
| status | text enum | inbox, active, in_progress, done (default: inbox) |
| priority | text enum | none, low, medium, high (default: none) |
| today | integer boolean | default: false |
| client | text | |
| dueDate | text | ISO date string |
| dueType | text enum | hard, soft |
| effort | text enum | unknown, tiny, small, medium, deep (default: unknown) |
| invoiceStatus | text enum | none, draft, sent, paid, overdue |
| valueAtRisk | real | |
| lastClientTouchAt | text | ISO timestamp |
| order | integer | default: 0 |
| createdAt | text | Auto ISO timestamp |
| completedAt | text | Set on completion |

#### scratchpad
| Field | Type | Notes |
|-------|------|-------|
| id | text PK | Single-row usage |
| content | text NOT NULL | default: '' |
| updatedAt | text | ISO timestamp |

#### chat_messages
| Field | Type | Notes |
|-------|------|-------|
| id | text PK | UUID |
| role | text enum | user, assistant |
| content | text NOT NULL | |
| toolCalls | text | JSON nullable |
| createdAt | text | ISO timestamp |

#### task_events (audit log)
| Field | Type | Notes |
|-------|------|-------|
| id | text PK | UUID |
| taskId | text NOT NULL | FK → tasks.id |
| action | text enum | create, update, move, complete, delete |
| before | text | JSON snapshot nullable |
| after | text | JSON snapshot nullable |
| source | text enum | user, ai |
| createdAt | text | ISO timestamp |

#### ai_journal
| Field | Type | Notes |
|-------|------|-------|
| id | text PK | UUID |
| content | text NOT NULL | |
| category | text enum | pattern, progress, preference, summary |
| createdAt | text | ISO timestamp |

#### settings
| Field | Type | Notes |
|-------|------|-------|
| key | text PK | |
| value | text NOT NULL | JSON stringified |

### Indexes
- `tasks(parent_id)`, `tasks(status)`, `tasks(today)`, `tasks(due_date)`
- `task_events(task_id)`, `task_events(created_at)`
- `chat_messages(created_at)`
- `ai_journal(created_at)`

### Exported Types
Each table exports `$inferSelect` and `$inferInsert` types:
```typescript
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
// ... etc for all tables
```

## 3. Database Initialization

**File:** `src/main/db/index.ts`

**Location:** `~/Library/Application Support/Flusk/flusk.db` via `app.getPath('userData')`

**Singleton pattern:**
- `initDatabase()` — Creates connection, sets pragmas
- `getDb()` — Returns existing connection (throws if not initialized)
- `closeDatabase()` — Clean shutdown

**Pragmas:**
- `journal_mode = WAL` (concurrent read performance)
- `foreign_keys = ON`

## 4. Migrations

**File:** `src/main/db/migrate.ts`
**Config:** `drizzle.config.ts` at project root

**Strategy:**
- `drizzle-kit generate` creates SQL migration files in `./drizzle/`
- `runMigrations()` executes on app start after DB init
- Dev: reads from `./drizzle/`
- Packaged: reads from `process.resourcesPath/drizzle/`
- `drizzle/` added to electron-builder `extraResources`

**Startup sequence:**
```
app.whenReady() → initDatabase() → runMigrations() → createWindow()
```

**Shutdown:** `app.on('before-quit')` → `closeDatabase()`

**Scripts:**
```json
{
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:studio": "drizzle-kit studio"
}
```

## 5. IPC Handlers

**New channels:**

| Domain | Channel | Direction |
|--------|---------|-----------|
| Tasks | `task:list` | query |
| Tasks | `task:create` | mutation |
| Tasks | `task:update` | mutation |
| Tasks | `task:delete` | mutation |
| Tasks | `task:reorder` | mutation |
| Tasks | `task:complete` | mutation |
| Tasks | `task:toggle-today` | mutation |
| Chat | `chat:send` | mutation |
| Chat | `chat:history` | query |
| Chat | `chat:clear` | mutation |
| Scratchpad | `scratchpad:get` | query |
| Scratchpad | `scratchpad:save` | mutation |
| Settings | `settings:get` | query |
| Settings | `settings:set` | mutation |
| Settings | `settings:getAll` | query |

**Service layer:** `src/main/services/`
- `taskService.ts` — CRUD + reorder + complete + toggle-today
- `chatService.ts` — Message persistence
- `scratchpadService.ts` — Single-row read/write
- `settingsService.ts` — Key-value CRUD

**Validation:** Zod schemas for all write payloads.

**Audit:** Every task mutation writes `task_events` with before/after snapshots.

**Preload:** `window.flusk` extended with nested domain methods:
```typescript
window.flusk.tasks.list(filter?)
window.flusk.tasks.create(data)
window.flusk.tasks.update(id, data)
window.flusk.tasks.delete(id)
window.flusk.tasks.reorder(ids)
window.flusk.tasks.complete(id)
window.flusk.tasks.toggleToday(id)
window.flusk.chat.send(message)
window.flusk.chat.history()
window.flusk.chat.clear()
window.flusk.scratchpad.get()
window.flusk.scratchpad.save(content)
window.flusk.settings.get(key)
window.flusk.settings.set(key, value)
window.flusk.settings.getAll()
```

## 6. Type Migration

**Replace** `AssistantTaskSnapshot` → `Task` (from Drizzle schema)
**Replace** `AssistantJournalEntry` → `AiJournal` (from Drizzle schema)
**Keep** `AssistantMemorySnapshot` as composite view type (loads from settings keys + ai_journal rows)
**Keep** `AssistantLiveContext` as view type (populated from task queries at runtime)
**Keep** all kernel-specific types (compilation, orchestration, memory policy, proactive triggers) in `types/assistant.ts`
**Update** kernel imports — `AssistantTaskSnapshot` references become `Task`, `AssistantJournalEntry` becomes `AiJournal`

Kernel remains a pure function layer — receives data via parameters, no direct DB access.

## Out of Scope

- `backup:export/import/list` IPC channels (separate task)
- AI chat orchestration / LLM integration (Task 7)
- Zustand state management in renderer (separate task)

## Implementation Order

Follows TaskMaster subtasks 3.1 → 3.6:

1. **3.1** Install better-sqlite3, configure electron-rebuild
2. **3.2** Define tasks table schema with all 17 fields
3. **3.3** Define remaining 5 table schemas + indexes
4. **3.4** Create DB initialization (Application Support path, singleton, pragmas)
5. **3.5** Set up drizzle-kit migrations, auto-run on app start
6. **3.6** Create domain-first IPC handlers + preload bridge + type migration

## Files Created/Modified

### New Files
- `src/main/db/schema.ts` — All table definitions
- `src/main/db/index.ts` — DB initialization singleton
- `src/main/db/migrate.ts` — Migration runner
- `src/main/services/taskService.ts` — Task CRUD
- `src/main/services/chatService.ts` — Chat persistence
- `src/main/services/scratchpadService.ts` — Scratchpad CRUD
- `src/main/services/settingsService.ts` — Settings CRUD
- `drizzle.config.ts` — Drizzle Kit config
- `drizzle/` — Generated migration files

### Modified Files
- `package.json` — New dependencies + scripts
- `vite.main.config.ts` — Externalize better-sqlite3
- `src/main/index.ts` — DB init + migrations in startup
- `src/main/ipc.ts` — Register new IPC handlers
- `src/preload/index.ts` — Extend window.flusk API
- `src/types/assistant.ts` — Replace snapshot types with Drizzle re-exports
- `src/types/ipc.ts` — New channel definitions
- `src/types/preload.d.ts` — Updated window.flusk type
- `forge.config.ts` — Include drizzle/ in extraResources
