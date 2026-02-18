# Untask — Community Readiness Audit & Improvement Plan

**Date:** 2026-02-18
**Status:** Draft
**Goal:** Assess Untask's readiness for open-source community adoption and define a prioritized action plan to close gaps. This audit covers codebase quality, feature completeness, product experience, documentation, and release infrastructure.

**Context:** This document builds on the [Open Source Launch Design](./2026-02-17-open-source-launch-design.md) and [Technical Audit Roadmap](./2026-02-16-flusk-technical-audit-roadmap.md). Those documents identified pre-launch work; this one audits what was completed, what wasn't, and what new issues surfaced.

---

## 1. Executive Summary

Untask is a **feature-rich, well-engineered** local-first task manager. The architecture is sound, the code is clean, and the AI integration is genuinely novel. However, the app has gaps that will prevent community adoption if not addressed.

**What's strong:**
- Clean main/renderer/preload separation with typed IPC contracts
- 31K lines of source, 34 test files, strict TypeScript, Zod validation everywhere
- Sophisticated AI system: 4-layer memory, autonomy modes, knowledge extraction, proactive reminders
- GitHub repo has proper scaffolding: README, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, issue/PR templates, CI/CD
- Modern stack on latest versions (Electron 40, React 19, Zustand 5, Tailwind v4, Vite 5)

**What needs work:**
- Onboarding flow was designed (5 screens) but never implemented
- 5 monolith files concentrate complexity and hinder contribution
- Two-repo release workflow is fragile and contributor-hostile
- Notification system works but lacks polish (no snooze, no advance warning)
- No structured data export (CSV/JSON) beyond DB backup
- Dead dependency (`@extractus/article-extractor`) in bundle
- Transitional schema fields shipped but unused in UI

---

## 2. Codebase Health Assessment

### 2.1 Metrics

| Metric | Value | Assessment |
|--------|-------|------------|
| Total source lines | ~31,000 (incl. ~5K tests) | Lean for feature set |
| Runtime dependencies | 32 | Reasonable |
| Dev dependencies | 29 | Normal |
| Test files | 34 | Good coverage of critical paths |
| TypeScript strict mode | Yes, all 3 tsconfigs | Strong |
| ESLint | Configured with import plugin | Good |
| CI gates | typecheck + test on PR, build on tag | Solid |
| Duplication (jscpd) | 0.25% | Excellent |
| Circular deps (madge) | 1 (task components) | Minor |

### 2.2 Architecture Quality

**Main process** (11,834 LOC): Well-separated into domains — `ai/`, `services/`, `db/`, `window/`, `assistant/`. Each service has a clear single responsibility. Database schema is well-designed with proper FK constraints, composite indexes, and WAL mode.

**Renderer** (18,251 LOC): Zustand stores follow selector pattern correctly. Optimistic updates with rollback on all mutations. Components are well-organized by domain (tasks, chat, notes, settings, layout).

**IPC bridge** (350 LOC preload + 381 LOC types): Fully typed, domain-scoped channels (`task:*`, `chat:*`, `settings:*`). Zod validation on write payloads. No raw DB queries exposed to renderer.

**Verdict:** The architecture is production-quality. No fundamental rewrites needed.

### 2.3 Monolith Files (The Real Problem)

These 5 files concentrate too much complexity and will be the primary barrier to outside contributors:

| File | Lines | What's in it | Why it's a problem |
|------|-------|-------------|-------------------|
| `src/main/ipc.ts` | 1,303 | 73 IPC handlers | Every feature change touches this file. Merge conflicts guaranteed with multiple contributors. |
| `src/renderer/stores/chatStore.ts` | 1,537 | Messages, threads, models, streaming state, pending actions, error handling | A state machine disguised as a flat store. Cross-cutting concerns make it hard to reason about. |
| `src/renderer/components/settings/SettingsMemory.tsx` | 1,465 | Memory editor, journal viewer, event history, typography picker | 4 distinct features crammed into one component file. |
| `src/main/ai/chat.ts` | 1,294 | Stream orchestration, retry logic, error classification, auto-titling, tool execution | The most complex file in the codebase. Interleaves 5 concerns. |
| `src/main/ai/tools.ts` | 1,047 | 15+ tool definitions | Manageable now, but each new tool adds to the monolith. |

**Note:** The [Technical Audit Roadmap](./2026-02-16-flusk-technical-audit-roadmap.md) Phase 4-6 already identified these. Some progress was made (memory events table, centralized defaults), but the file splits were not executed.

### 2.4 Dead Code & Transitional Fields

| Item | Location | Action |
|------|----------|--------|
| `@extractus/article-extractor` | `package.json`, `vite.main.config.ts` external | Listed as dependency, marked external, **never imported**. Remove. |
| `dueType: 'hard' \| 'soft'` | `schema.ts`, task types | In schema and types but not exposed in UI. Remove or implement. |
| `effort` field | `schema.ts`, task types | Marked TODO(untask-task-ux). Remove or implement. |
| `toErrorMessage()` | `chat.ts` + renderer utils | Duplicated across process boundary. Extract to shared types or utility. |

### 2.5 Dependency Health

| Dependency | Version | Status | Notes |
|------------|---------|--------|-------|
| Electron | 40.4.1 | Current | Good |
| React | 19.2.4 | Current | Good |
| Zustand | 5.0.11 | Current | v5 migration complete, useShallow pattern adopted |
| Tailwind | 4.1.18 | Current | v4 native CSS engine |
| better-sqlite3 | 12.6.2 | Current | Native module, rebuild scripts in place |
| Drizzle ORM | 0.45.1 | Current | Good |
| BlockNote | 0.46.2 | Current | Heavy (~200KB) but justified for rich editor |
| Framer Motion | 12.34.0 | Current | Only used for subtle animations, could lazy-load |
| @fontsource/* | 5.2.x | Current | 6 fonts, ~1-2MB total for typography customization |
| Vercel AI SDK | 6.0.86 | Current | Multi-provider streaming |
| @typescript-eslint | 5.62.0 | **Outdated** | v5 is legacy; v8+ is current. Update when convenient. |
| eslint | 8.57.1 | **Outdated** | v9 (flat config) is current. Not urgent. |

---

## 3. Feature Completeness Audit

### 3.1 Features Present and Working

| Feature | Status | Quality |
|---------|--------|---------|
| Task CRUD with status lanes | Working | Production-ready |
| Drag-and-drop reordering | Working | Smooth |
| Rich text notes (BlockNote) | Working | Full-featured |
| Full-text search (FTS5) | Working | Fast |
| AI chat with multi-provider support | Working | Robust streaming, retry, error classification |
| AI tool execution (create/update/delete tasks, notes) | Working | Autonomy gating, undo support |
| 4-layer memory system (identity, memory, journal, archive) | Working | Editable, auditable, reversible |
| Knowledge extraction (background learning) | Working | Runs 60s post-conversation |
| Proactive reminders (due date notifications) | Working | Native macOS notifications, per-task cooldown |
| Weekly digest | Working | Monday auto-generation |
| Autonomy modes (auto/confirm) | Working | Risk classification, hard override for deletes |
| Chips/action cards in chat | Working | Multiple extraction formats, clickable |
| Chat vision support | Working | 4-image limit, drag-drop, auto-resize |
| Task recurrence engine | Working | daily/weekly/monthly/quarterly/yearly + custom |
| Clipboard quick capture | Working | Auto-detects URL vs text |
| File attachments | Working | 50MB limit, trash retention |
| Typography/font presets | Working | 3 presets, 6 fonts |
| Window dock modes | Working | normal/dock-only/menu-bar-only |
| Tray icon with today badge | Working | macOS native |
| Encrypted DB backup/export | Working | AES-256-GCM, passphrase optional |
| Keyboard shortcuts (25+) | Working | Customizable global shortcuts |
| Dark/light mode | Working | Dark default |
| Configurable task statuses | Working | Add/remove/rename lanes |

### 3.2 Features Designed But Not Implemented

| Feature | Design Doc | What Exists | What's Missing |
|---------|-----------|-------------|----------------|
| **Onboarding flow** | [Open Source Launch](./2026-02-17-open-source-launch-design.md) Section 2 | `app.bootstrap_completed` setting, `getBootstrapState()` IPC, "Restart onboarding" button | The 5-screen flow (welcome, name/AI toggle, provider setup, identity setup, ready). No component, no rendering, no conditional gate in App.tsx. |
| **Update notifier** | [Open Source Launch](./2026-02-17-open-source-launch-design.md) Section 7 | Nothing | GitHub Releases API check, in-app banner, version comparison |
| **Structured data export** | Not designed | DB-level backup export | CSV/JSON export of tasks and notes |

### 3.3 Features Working But Underpolished

| Feature | What Works | What's Missing |
|---------|-----------|----------------|
| **Notifications/reminders** | Due date detection, native Notification API, AI-generated reminder text, per-task cooldown | No snooze/dismiss. No advance warning (e.g., "due in 15 minutes"). No frequency settings. No persistent notification if app is closed at due time. No notification history. |
| **Backup system** | Full DB export with encryption, auto-backup, import/restore | No structured export (CSV/JSON). No per-item export. No iCal/TaskWarrior format. |
| **Error handling** | Error boundaries, Zod validation, IPC try-catch, stream error classification | No user-visible error codes. No error logging service. Some chat errors not surfaced clearly to UI. |

---

## 4. Product Experience Gaps

### 4.1 Onboarding (Critical)

**Impact:** High. Users launch the app, see an empty Today view, and have no idea that Cmd+K opens AI chat, that there are 25+ keyboard shortcuts, that memory layers exist, that typography is customizable, or that proactive reminders are available. The most powerful features are invisible.

**Current state:** The [Open Source Launch Design](./2026-02-17-open-source-launch-design.md) Section 2 specifies a 5-screen flow:
1. Welcome — bird mascot + "Get Started" button
2. Basics — name input + AI enable toggle
3. AI Provider Setup — provider selector + API key input + validation
4. Identity Setup — occupation, communication style, focus area
5. Ready — confirmation + "Open App"

**Infrastructure that exists:**
- `app.bootstrap_completed` setting key
- `SETTINGS_GET_BOOTSTRAP_STATE` IPC channel (returns `{ status: 'ready' }`)
- "Restart onboarding" button in Settings General (sets flag to false and reloads)

**What needs to be built:**
- `OnboardingFlow.tsx` component with 5 screens
- Conditional rendering gate in `App.tsx` (if `!bootstrap_completed` → show onboarding)
- `getBootstrapState()` handler to actually check the setting
- Provider validation IPC (test API call)
- Identity generation from onboarding answers
- `bootstrap_completed = true` on completion

### 4.2 Release Workflow (High)

**Impact:** High for contributors. The two-repo setup means:
- Contributors can't clone → start → PR in one workflow
- Maintainer manually copies files between repos (error-prone)
- Git history is split, making blame/bisect harder
- CI runs on the GitHub repo but development happens locally

**Current flow:**
1. Work in `~/Development/untitled/flusk/`
2. Clone `mbenhard/untask` to `/tmp/`
3. Manually copy changed files
4. Commit, push, tag → triggers CI

**Options:**

| Option | Effort | Risk | Benefit |
|--------|--------|------|---------|
| A: Script the copy | Low | Low | Reduces manual errors, still two repos |
| B: Git subtree push | Medium | Medium | One local repo, automatic sync to GitHub |
| C: Develop directly in GitHub repo | Medium | Low | Contributors can clone and PR normally |
| D: Monorepo on GitHub | High | High | Everything in one place, but exposes website/docs history |

**Recommendation:** Option C. Move primary development to the GitHub repo. Keep the local monorepo for the website but develop `flusk/` directly in `mbenhard/untask`. This is the standard open-source workflow that contributors expect.

### 4.3 Notification Polish (Medium)

**What works:** Due date → scheduled reminder → native notification → AI context message.

**What users expect from a task manager:**
- Advance warnings ("due in 15 minutes", "due in 1 hour")
- Snooze ("remind me in 10 minutes", "remind me tomorrow")
- Configurable reminder frequency (how many minutes before)
- Notification even if app is closed (requires a background daemon or launch-on-login)
- Persistent notification center entries

**Suggested improvements (ordered by effort/impact):**
1. **Advance warning** — add configurable offset (default: 15 min before). Low effort, high impact.
2. **Snooze via notification action** — Electron supports notification actions on macOS. Medium effort.
3. **Reminder frequency setting** — add to Settings. Low effort.
4. **Background mode** — if app is quit, no reminders fire. Document this limitation or add launch-at-login prompt.

---

## 5. Codebase Improvement Plan

### 5.1 Monolith File Decomposition

#### 5.1.1 Split `ipc.ts` (1,303 lines → ~6 files)

Already specified in [Technical Audit Roadmap](./2026-02-16-flusk-technical-audit-roadmap.md) Phase 4.

**Proposed structure:**
```
src/main/ipc/
├── index.ts              # registerAllHandlers() entry point
├── taskHandlers.ts       # task:* channels (~12 handlers)
├── chatHandlers.ts       # chat:* channels (~20 handlers)
├── notesHandlers.ts      # notes:* channels (~6 handlers)
├── settingsHandlers.ts   # settings:* channels (~15 handlers)
├── backupHandlers.ts     # backup:* channels (~8 handlers)
├── searchHandlers.ts     # search:* channels (~2 handlers)
├── attachmentHandlers.ts # attachment:* channels (~6 handlers)
└── appHandlers.ts        # app:* channels (~8 handlers)
```

**Shared helper** (from Phase 4):
```typescript
function registerHandle<TReq, TRes>(
  channel: string,
  schema: z.ZodType<TReq>,
  handler: (req: TReq) => Promise<TRes> | TRes
): void {
  ipcMain.handle(channel, async (_event, raw: unknown) => {
    const parsed = schema.parse(raw);
    return handler(parsed);
  });
}
```

**Risk:** Low. Pure organizational refactor. Each handler moves unchanged.

#### 5.1.2 Split `chatStore.ts` (1,537 lines → 3-4 files)

**Proposed structure:**
```
src/renderer/stores/chat/
├── index.ts              # Re-export combined store
├── chatMessageStore.ts   # Messages, streaming state, in-flight tracking
├── chatThreadStore.ts    # Conversations list, active thread, loading state
├── chatModelStore.ts     # Model selection, catalog, retention mode
└── chatActionStore.ts    # Pending actions, autonomy state, undo
```

**Approach:** Zustand v5 supports store composition via `useStore` with selectors. Each sub-store can be a standalone Zustand store, or they can remain slices of one store but defined in separate files.

**Risk:** Medium. Cross-store references (e.g., `send` uses thread state + model state + message state). Needs careful interface design at the boundaries.

#### 5.1.3 Split `SettingsMemory.tsx` (1,465 lines → 4 files)

```
src/renderer/components/settings/memory/
├── SettingsMemory.tsx       # Container with sub-tab navigation
├── IdentityEditor.tsx       # Identity document editor
├── MemoryEditor.tsx         # Memory sections editor with event history
├── JournalViewer.tsx        # Journal entries viewer
└── MemoryEventHistory.tsx   # Memory event list with undo
```

**Risk:** Low. These are visually distinct panels that don't share much state.

#### 5.1.4 Split `chat.ts` (1,294 lines → 3-4 files)

```
src/main/ai/chat/
├── index.ts              # Re-export startChatTurn, startProactiveTurn
├── orchestrator.ts       # Main turn orchestration, stream loop
├── errorClassifier.ts    # classifyChatError, retry evaluation
├── autoTitler.ts         # Conversation auto-titling logic
└── streamManager.ts      # Stream lifecycle, cancellation, timeout
```

**Risk:** Medium. The stream loop is tightly coupled to retry logic and error classification. Needs clean interface boundaries.

#### 5.1.5 Split `tools.ts` (1,047 lines → domain files)

Already specified in [Technical Audit Roadmap](./2026-02-16-flusk-technical-audit-roadmap.md) Phase 5.

```
src/main/ai/tools/
├── index.ts              # Registry assembly, createSdkTools()
├── taskTools.ts          # create_task, update_task, complete_task, delete_task, cancel_task, reopen_task
├── noteTools.ts          # create_note, update_note, delete_note
├── memoryTools.ts        # update_memory
└── uiTools.ts            # emit_chips
```

**Risk:** Low. Tools are already self-contained definitions.

### 5.2 Dead Code Removal

| Item | Action | Effort |
|------|--------|--------|
| `@extractus/article-extractor` | Remove from `package.json` and `vite.main.config.ts` external list | 5 min |
| `dueType` field | Remove from schema, types, and any references. Add migration. | 30 min |
| `effort` field | Decide: implement in UI or remove from schema. If removing, add migration. | 30 min |
| Duplicate `toErrorMessage()` | Extract to `src/types/errors.ts` shared utility | 15 min |

### 5.3 Schema Cleanup Migration

Create migration `0008`:
```sql
-- Remove unused columns
ALTER TABLE tasks DROP COLUMN due_type;
ALTER TABLE tasks DROP COLUMN effort;
```

Note: SQLite doesn't support `DROP COLUMN` before version 3.35.0. If the minimum SQLite version is older, this requires creating a new table, copying data, and renaming. Drizzle handles this with its migration generator.

---

## 6. Documentation & Repo Gaps

### 6.1 What Exists on GitHub (mbenhard/untask)

| File | Status | Quality |
|------|--------|---------|
| `README.md` | Present | Good — features, download, dev setup, Gatekeeper instructions |
| `CONTRIBUTING.md` | Present | Good — branch workflow, code style, architecture reference |
| `CODE_OF_CONDUCT.md` | Present | Standard Contributor Covenant v2.1 |
| `SECURITY.md` | Present | Good — reporting process, security design notes |
| `LICENSE` | Present | MIT |
| `.github/ISSUE_TEMPLATE/bug_report.md` | Present | Standard |
| `.github/ISSUE_TEMPLATE/feature_request.md` | Present | Standard |
| `.github/PULL_REQUEST_TEMPLATE.md` | Present | Standard |
| `.github/workflows/ci.yml` | Present | typecheck + test on PR |
| `.github/workflows/release.yml` | Present | build + draft release on tag |
| `.env.example` | Present | Good |

### 6.2 What's Missing

| Item | Impact | Effort |
|------|--------|--------|
| `CHANGELOG.md` | Medium — users and contributors want to know what changed between versions | Low — generate from git tags/commits |
| `docs/ARCHITECTURE.md` | Medium — referenced in CONTRIBUTING.md but may not exist on GitHub | Medium — document process boundaries, IPC design, store patterns |
| README screenshot/GIF | High — visual first impression matters enormously for open source | Low — record a 10-second demo |
| Roadmap (GitHub Projects or `ROADMAP.md`) | Medium — contributors need to know what's planned | Low |

### 6.3 What's Missing Locally (flusk/ directory)

The local `flusk/` directory has no README, CONTRIBUTING, or community files. These exist only on the GitHub repo. If contributors clone from GitHub, they get everything. But the local monorepo experience is disorienting. This reinforces the recommendation to consolidate development into the GitHub repo (Section 4.2).

---

## 7. Prioritized Action Plan

### Tier 1: Critical (blocks community adoption)

| # | Task | Effort | Impact | Dependencies |
|---|------|--------|--------|-------------|
| 1 | **Implement onboarding flow** (5 screens per [open-source-launch-design](./2026-02-17-open-source-launch-design.md) Section 2) | 2-3 days | Very high — users will never discover 70% of features without it | None |
| 2 | **Consolidate release workflow** — decide on Option A/B/C from Section 4.2 and implement | 1 day | High — contributor experience depends on this | None |
| 3 | **Split `ipc.ts`** into domain modules | 2-3 hours | High — most frequent merge conflict source | None |

### Tier 2: Important (improves quality significantly)

| # | Task | Effort | Impact | Dependencies |
|---|------|--------|--------|-------------|
| 4 | **Remove dead dependency** (`@extractus/article-extractor`) | 5 min | Low direct impact, but signals codebase hygiene | None |
| 5 | **Remove or implement transitional fields** (`dueType`, `effort`) | 1-2 hours | Medium — confuses contributors reading schema | Migration |
| 6 | **Split `chatStore.ts`** into sub-stores | 3-4 hours | Medium — second most complex file | None |
| 7 | **Split `SettingsMemory.tsx`** into sub-components | 2 hours | Medium — improves settings maintainability | None |
| 8 | **Add CHANGELOG.md** | 1 hour | Medium — version history for users | None |
| 9 | **Add README screenshot/GIF** | 30 min | High — visual first impression | App running |
| 10 | **Notification advance warning** — configurable offset before due time | 2-3 hours | Medium — most-requested notification improvement | None |

### Tier 3: Nice to Have (polish)

| # | Task | Effort | Impact | Dependencies |
|---|------|--------|--------|-------------|
| 11 | **Split `chat.ts`** into orchestrator/classifier/titler/stream | 3-4 hours | Medium — most complex file but rarely modified by contributors | None |
| 12 | **Split `tools.ts`** into domain tool files | 2 hours | Low-medium — manageable now but scales poorly | None |
| 13 | **Structured data export** (CSV/JSON tasks and notes) | 4-6 hours | Medium — "own your data" philosophy | IPC + UI |
| 14 | **Consolidate `toErrorMessage()`** into shared utility | 15 min | Low | None |
| 15 | **Update ESLint to v9** + `@typescript-eslint` to v8 | 2-3 hours | Low — hygiene, better rules | None |
| 16 | **Update notifier** (GitHub Releases API check) | 3-4 hours | Medium — users on old versions don't know | None |
| 17 | **Notification snooze** via Electron notification actions | 4-6 hours | Medium | Notification system |
| 18 | **Add `docs/ARCHITECTURE.md`** to GitHub repo | 2-3 hours | Medium — helps contributors understand the codebase | None |
| 19 | **Publish roadmap** (GitHub Projects board or ROADMAP.md) | 1 hour | Medium — signals project direction | None |

---

## 8. What We're NOT Doing (YAGNI)

Explicitly out of scope for this improvement cycle:

- **Tags/labels/projects system** — 8 status lanes + custom statuses is sufficient for MVP. Add only if community requests it.
- **Cloud sync** — local-first is a core principle, not a limitation.
- **Windows/Linux builds** — macOS only until demand justifies cross-platform CI.
- **Plugin/extension system** — premature. Codebase isn't stable enough.
- **Desktop-first redesign** — current minimal aesthetic is intentional and works.
- **Test coverage mandates** — current test coverage (~15%) covers critical paths. Don't chase metrics.
- **Full ipc.ts type rewrite** — the types work, the file just needs splitting.
- **Migrate away from BlockNote** — it's heavy but works well. Not worth the churn.

---

## 9. Success Criteria

This improvement cycle is complete when:

1. A new user can install Untask, complete onboarding, and understand the core features within 2 minutes
2. A contributor can clone the repo, run `pnpm install && pnpm start`, make a change, and open a PR without reading internal docs
3. No source file exceeds 800 lines (split all 1000+ line files)
4. `package.json` has zero unused dependencies
5. Schema has zero unused columns
6. README has a screenshot or demo GIF
7. CHANGELOG exists with at least the current version documented

---

## 10. Implementation Order

**Recommended sequence** (respects dependencies, front-loads highest impact):

```
Week 1: Foundation
  ├── #1  Implement onboarding flow
  ├── #3  Split ipc.ts
  ├── #4  Remove @extractus/article-extractor
  └── #5  Remove transitional schema fields

Week 2: Structure
  ├── #2  Consolidate release workflow
  ├── #6  Split chatStore.ts
  ├── #7  Split SettingsMemory.tsx
  └── #8  Add CHANGELOG.md

Week 3: Polish
  ├── #9  Add README screenshot
  ├── #10 Notification advance warning
  ├── #11 Split chat.ts
  ├── #12 Split tools.ts
  └── #13 Structured data export

Week 4: Documentation & Launch
  ├── #14-15 Minor cleanups
  ├── #16 Update notifier
  ├── #18 Architecture doc
  ├── #19 Publish roadmap
  └── Tag v0.2.0 as "community-ready" release
```

---

## Appendix A: Full Feature Inventory

For reference, the complete list of implemented features as discovered during audit:

**Core (no AI required):**
- Task CRUD with 8 configurable status lanes
- Drag-and-drop task reordering
- Task priority (none/low/medium/high)
- Due dates with overdue detection
- Task recurrence (daily, weekly, monthly, quarterly, yearly, weekday, day-specific, interval)
- Rich text notes (BlockNote editor)
- Full-text search across tasks and notes (FTS5)
- Task events audit trail with undo
- Clipboard quick-add via global shortcut (Cmd+Shift+Q)
- Encrypted database backup/export with auto-backup
- 25+ keyboard shortcuts (customizable global shortcuts)
- Tray icon with today task count badge
- Dark mode (default) + light mode
- Window dock modes (normal, dock-only, menu-bar-only)
- Window dismiss modes (persistent, quick-hide)
- Typography/font presets (3 presets, 6 fonts)
- File attachments (50MB limit, trash retention)
- File context menus (open, reveal in Finder, delete)

**AI Mode (opt-in, BYOK):**
- Multi-provider support (OpenRouter, OpenAI, Anthropic, Ollama)
- Chat panel with multi-threaded conversations
- AI task/note creation and modification via tool calls
- Autonomy modes (auto/confirm) with risk classification
- 4-layer memory system (identity, memory, journal, archive)
- Background knowledge extraction (runs 60s post-conversation)
- Proactive reminders via native macOS notifications
- Weekly digest auto-generation (Mondays)
- Chips/action cards with approval/reject/undo lifecycle
- Chat vision support (4 images, drag-drop, paste, auto-resize)
- Stream retry with exponential backoff and error classification
- Automatic conversation titling
- Curated model list with capability badges

## Appendix B: Files Exceeding 800 Lines

| File | Lines | Proposed Split |
|------|-------|---------------|
| `src/main/ipc.ts` | 1,303 | 8 domain handler files |
| `src/renderer/stores/chatStore.ts` | 1,537 | 3-4 sub-stores |
| `src/renderer/components/settings/SettingsMemory.tsx` | 1,465 | 4 sub-components |
| `src/main/ai/chat.ts` | 1,294 | 4 concern-based files |
| `src/main/ai/tools.ts` | 1,047 | 4 domain tool files |
| `src/renderer/stores/chatStore.test.ts` | 1,004 | Split with store |
| `src/renderer/components/settings/SettingsAI.tsx` | 787 | Borderline — split if adding features |

## Appendix C: GitHub Repo File Audit

Files confirmed present on `mbenhard/untask` as of 2026-02-18:

```
README.md                          ✓ (features, download, dev setup)
CONTRIBUTING.md                    ✓ (workflow, code style)
CODE_OF_CONDUCT.md                 ✓ (Contributor Covenant v2.1)
SECURITY.md                        ✓ (reporting, security design)
LICENSE                            ✓ (MIT)
.env.example                       ✓
.github/ISSUE_TEMPLATE/bug_report.md      ✓
.github/ISSUE_TEMPLATE/feature_request.md ✓
.github/PULL_REQUEST_TEMPLATE.md          ✓
.github/workflows/ci.yml                  ✓
.github/workflows/release.yml             ✓
CHANGELOG.md                       ✗ (missing)
docs/ARCHITECTURE.md               ? (referenced in CONTRIBUTING but not verified)
```
