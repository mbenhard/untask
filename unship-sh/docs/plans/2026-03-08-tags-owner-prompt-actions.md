# Enhanced Tags, Owner Flag & Prompt Actions — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add enhanced tag picker with colored dots, owner flag for user/AI differentiation, and split prompt button with Do/Plan/Discuss actions.

**Architecture:** Three independent features. Task 1 (tags) is pure frontend. Task 2 (owner) adds a field through Rust → Tauri → TypeScript → Svelte. Task 3 (prompt) is pure frontend.

**Tech Stack:** Rust (unship-core), Tauri commands, TypeScript, Svelte 5, Bits UI (popover), Tailwind CSS

---

### Task 1: Enhanced Tag Picker — Collect All Tags

**Files:**
- Create: `apps/desktop/src-tauri/src/commands.rs` (add `list_all_tags` command)
- Modify: `apps/desktop/src/lib/api.ts` (add `listAllTags` function)

**Step 1: Add Tauri command to collect all tags**

In `apps/desktop/src-tauri/src/commands.rs`, add a new command that lists tasks and collects unique tags with counts:

```rust
#[tauri::command]
pub fn list_all_tags(state: State<'_, AppState>) -> Result<Vec<TagInfo>, String> {
    let root = require_project(&state)?;
    let store = TaskStore::new(root).map_err(|e| e.to_string())?;
    let tasks = store.list(None).map_err(|e| e.to_string())?;

    let mut counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for task in &tasks {
        for tag in &task.tags {
            *counts.entry(tag.clone()).or_insert(0) += 1;
        }
    }

    let mut tags: Vec<TagInfo> = counts
        .into_iter()
        .map(|(name, count)| TagInfo { name, count })
        .collect();
    tags.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.name.cmp(&b.name)));
    Ok(tags)
}

#[derive(Serialize)]
pub struct TagInfo {
    pub name: String,
    pub count: usize,
}
```

Register in `main.rs` invoke handler list.

**Step 2: Add TypeScript API function**

In `apps/desktop/src/lib/api.ts`:

```typescript
export interface TagInfo {
  name: string;
  count: number;
}

export function listAllTags(): Promise<TagInfo[]> {
  return invoke("list_all_tags");
}
```

**Step 3: Verify it compiles**

Run: `cd apps/desktop && npx svelte-check --tsconfig ./tsconfig.json`
Expected: 0 errors

**Step 4: Commit**

```
feat: add list_all_tags Tauri command and API function
```

---

### Task 2: Enhanced Tag Picker — Popover UI Component

**Files:**
- Create: `apps/desktop/src/lib/components/TagPicker.svelte`
- Modify: `apps/desktop/src/lib/components/TaskModal.svelte` (replace inline tag input)

**Step 1: Create TagPicker component**

Create `apps/desktop/src/lib/components/TagPicker.svelte`. Uses Bits UI `Popover` for the dropdown. Props:

```typescript
{
  currentTags: string[];       // tags already on this task
  onToggle: (tag: string) => void;  // toggle a tag on/off
  onAdd: (tag: string) => void;     // add a brand new tag
}
```

Structure:
- Trigger button: `+ tag` (same style as current)
- Popover content:
  - `<input>` at top for filtering/new tag creation
  - List of all project tags (from `listAllTags()`) filtered by input
  - Each item shows: tag name, count, checkmark if currently on task
  - Click toggles the tag on/off (calls `onToggle`)
  - Enter on input with non-matching text creates new tag (calls `onAdd`)
  - Escape or outside click closes popover

Styling: Bits UI Popover with Tailwind matching design language — monochrome, dense, border/border-60, font-mono text-[10px].

**Step 2: Integrate into TaskModal**

In `TaskModal.svelte`, replace the inline `addingTag` input + `+ tag` button block (around lines 628-647) with `<TagPicker>`. Wire up:
- `currentTags={task.tags}`
- `onToggle={(tag) => { toggleTag(tag); }}`
- `onAdd={(tag) => { addNewTag(tag); }}`

Add `toggleTag` function that adds or removes the tag and calls `saveField({ tags: newTags })`.

Remove the `addingTag`, `tagDraft`, `addTag()`, `handleTagKeydown()` state and functions that are no longer needed.

**Step 3: Verify it compiles and test manually**

Run: `cd apps/desktop && npx svelte-check --tsconfig ./tsconfig.json`
Expected: 0 errors

Test: `pnpm tauri dev` — open a task modal, click `+ tag`, verify popover shows with existing tags, can filter, can add new, can toggle.

**Step 4: Commit**

```
feat: enhanced tag picker with project-wide suggestions popover
```

---

### Task 3: Tag Color Dots on Kanban Cards

**Files:**
- Create: `apps/desktop/src/lib/tagColor.ts`
- Modify: `apps/desktop/src/lib/components/Kanban.svelte` (card tag rendering)

**Step 1: Create deterministic tag color utility**

Create `apps/desktop/src/lib/tagColor.ts`:

```typescript
// Muted color palette for tag dots (hsl values, low saturation to stay monochrome-adjacent)
const TAG_COLORS = [
  "#6b7280", // gray
  "#8b5cf6", // violet
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#ec4899", // pink
  "#06b6d4", // cyan
];

export function tagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = ((hash << 5) - hash + tag.charCodeAt(i)) | 0;
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}
```

**Step 2: Add colored dots to kanban card tags**

In `Kanban.svelte`, around line 342-346, update the tag rendering from:

```svelte
<span class="rounded-[3px] font-mono text-[10px] text-muted-foreground/60">
  {tag}
</span>
```

To:

```svelte
<span class="flex items-center gap-1 font-mono text-[10px] text-muted-foreground/60">
  <span
    class="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
    style="background-color: {tagColor(tag)}"
  ></span>
  {tag}
</span>
```

Import `tagColor` from `$lib/tagColor`.

**Step 3: Also add colored dots to modal tag badges**

In `TaskModal.svelte`, update the tag buttons (around line 616-625) to include the same colored dot before the tag text.

**Step 4: Verify it compiles**

Run: `cd apps/desktop && npx svelte-check --tsconfig ./tsconfig.json`
Expected: 0 errors

**Step 5: Commit**

```
feat: deterministic colored dots for tags on kanban cards and modal
```

---

### Task 4: Owner Field — Rust Data Model

**Files:**
- Modify: `crates/unship-core/src/task.rs:9-36` (Task struct, TaskFrontmatter, From impl)
- Modify: `crates/unship-core/src/store.rs:20-28` (TaskUpdate struct)
- Modify: `crates/unship-core/src/store.rs:208-244` (update function)

**Step 1: Add `owner` field to Task struct**

In `crates/unship-core/src/task.rs`, add to Task struct after `confidence`:

```rust
#[serde(default, skip_serializing_if = "Option::is_none")]
pub owner: Option<String>,
```

Add same field to `TaskFrontmatter` struct:

```rust
#[serde(default)]
owner: Option<String>,
```

Add to `From<TaskFrontmatter>` impl:

```rust
owner: frontmatter.owner,
```

**Step 2: Add `owner` to TaskUpdate**

In `crates/unship-core/src/store.rs`, add to `TaskUpdate`:

```rust
pub owner: Option<Option<String>>,
```

In the `update()` method, add after the `prd` handling:

```rust
if let Some(owner) = updates.owner {
    task.owner = owner;
}
```

**Step 3: Verify Rust builds**

Run: `cargo build -p unship`
Expected: compiles successfully

**Step 4: Commit**

```
feat: add owner field to task data model
```

---

### Task 5: Owner Field — Tauri Bridge & TypeScript

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands.rs:28-63` (TaskDto, TaskUpdateDto, From impl)
- Modify: `apps/desktop/src/lib/api.ts:7-22` (TaskDto type)
- Modify: `apps/desktop/src/lib/api.ts:71-79` (TaskUpdateDto type)

**Step 1: Add `owner` to TaskDto**

In `commands.rs` TaskDto struct, add:

```rust
pub owner: Option<String>,
```

In `From<Task> for TaskDto`, add:

```rust
owner: task.owner,
```

In `TaskUpdateDto`, add:

```rust
#[serde(default, deserialize_with = "deserialize_double_option")]
pub owner: Option<Option<String>>,
```

In the existing `update_task` command, add to `TaskUpdate` construction:

```rust
owner: updates.owner,
```

**Step 2: Add `owner` to TypeScript types**

In `api.ts` TaskDto, add:

```typescript
owner: string | null;
```

In TaskUpdateDto, add:

```typescript
owner?: string | null;
```

**Step 3: Verify everything compiles**

Run: `cargo build -p unship && cd apps/desktop && npx svelte-check --tsconfig ./tsconfig.json`
Expected: both succeed

**Step 4: Commit**

```
feat: wire owner field through Tauri commands and TypeScript API
```

---

### Task 6: Owner Field — Desktop UI (Modal Toggle + Card Icon)

**Files:**
- Modify: `apps/desktop/src/lib/components/TaskModal.svelte` (add toggle in metadata row)
- Modify: `apps/desktop/src/lib/components/Kanban.svelte` (add icon on card)

**Step 1: Add owner toggle to TaskModal metadata row**

After the Tags section in the metadata row (around line 650), add:

```svelte
<!-- Owner -->
{#if !isUnindexed}
  <div class="flex items-center gap-1.5">
    <span class="shrink-0 select-none font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/70">Owner</span>
    <button
      type="button"
      class="inline-flex h-6 items-center gap-1 rounded-[4px] border border-border/60 px-2 font-mono text-[10px] leading-none text-muted-foreground transition-colors duration-[120ms] hover:border-border focus-visible:border-ring focus-visible:outline-none"
      class:border-foreground/30={task?.owner === "user"}
      class:text-foreground={task?.owner === "user"}
      onclick={() => {
        const newOwner = task?.owner === "user" ? null : "user";
        saveField({ owner: newOwner });
      }}
    >
      {#if task?.owner === "user"}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
        User
      {:else}
        AI
      {/if}
    </button>
  </div>
{/if}
```

**Step 2: Add owner icon to Kanban card**

In `Kanban.svelte`, in the bottom row (around line 391), add a user icon next to the priority dot when `task.owner === "user"`:

```svelte
{#if task.owner === "user"}
  <div class="pointer-events-none flex h-3.5 w-3.5 items-center justify-center rounded-full border border-border/50 bg-background/90 text-muted-foreground/60">
    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  </div>
{/if}
```

**Step 3: Verify it compiles**

Run: `cd apps/desktop && npx svelte-check --tsconfig ./tsconfig.json`
Expected: 0 errors

**Step 4: Commit**

```
feat: owner toggle in task modal and user icon on kanban cards
```

---

### Task 7: Owner Field — CLI Filter in `unship next`

**Files:**
- Modify: `crates/unship-core/src/next.rs:44-48` (filter out user-owned tasks)

**Step 1: Filter user-owned tasks from open_tasks**

In `next.rs`, modify the open_tasks filter (line 44-48) to also exclude user-owned tasks:

```rust
let mut open_tasks: Vec<Task> = all_tasks
    .iter()
    .filter(|task| !task_is_done(config, task))
    .filter(|task| task.owner.as_deref() != Some("user"))
    .cloned()
    .collect();
```

**Step 2: Verify Rust builds**

Run: `cargo build -p unship`
Expected: compiles

**Step 3: Test manually**

Create a task with `owner: user` in frontmatter, run `cargo run -p unship -- next --json`, verify it doesn't appear in open_tasks.

**Step 4: Commit**

```
feat: unship next filters out user-owned tasks
```

---

### Task 8: Split Prompt Button

**Files:**
- Create: `apps/desktop/src/lib/components/SplitButton.svelte`
- Modify: `apps/desktop/src/lib/components/TaskModal.svelte` (replace copy button)

**Step 1: Create SplitButton component**

Create `apps/desktop/src/lib/components/SplitButton.svelte`. Uses Bits UI `Popover` for the dropdown. Props:

```typescript
{
  actions: { id: string; label: string }[];
  defaultAction?: string;  // localStorage key for persistence
  onAction: (id: string) => void;
}
```

Structure:
- Left part: button with current action label — calls `onAction(currentAction)`
- Right part: small chevron button — opens Popover with action list
- Selected action persisted in localStorage under provided key
- Styling: matches existing button style (border, mono, 10px)

**Step 2: Update TaskModal prompt logic**

Replace the `copyAsPrompt()` function with `copyPrompt(mode: string)`:

```typescript
function copyPrompt(mode: string) {
  if (!task) return;
  const meta = [
    task.priority ? `Priority: ${task.priority}` : "",
    task.tags.length > 0 ? `Tags: ${task.tags.join(", ")}` : "",
  ].filter(Boolean).join(" | ");

  let prompt = "";
  if (mode === "do") {
    prompt = `Implement task #${task.id}: ${task.title}`;
  } else if (mode === "plan") {
    prompt = `Create an implementation plan for task #${task.id}: ${task.title}\nDo not implement — outline the approach, key decisions, affected files, and risks.`;
  } else if (mode === "discuss") {
    prompt = `Analyze task #${task.id}: ${task.title}\nExplore the problem space, surface questions, tradeoffs, and considerations before taking action.`;
  }
  if (task.body.trim()) prompt += `\n\n${task.body.trim()}`;
  if (meta) prompt += `\n\n${meta}`;

  navigator.clipboard.writeText(prompt);
  copyFeedback = true;
  setTimeout(() => { copyFeedback = false; }, 1200);
}
```

Replace the "Copy as prompt" button in the footer with:

```svelte
<SplitButton
  actions={[
    { id: "do", label: "Do" },
    { id: "plan", label: "Plan" },
    { id: "discuss", label: "Discuss" },
  ]}
  defaultAction="unship-prompt-mode"
  onAction={copyPrompt}
/>
```

(The `copyFeedback` state and checkmark icon should be handled inside `SplitButton` or via a callback.)

**Step 3: Verify it compiles**

Run: `cd apps/desktop && npx svelte-check --tsconfig ./tsconfig.json`
Expected: 0 errors

**Step 4: Commit**

```
feat: split prompt button with Do/Plan/Discuss actions
```

---

## Summary

| Task | Scope | Touches |
|------|-------|---------|
| 1. Tag API | Backend | Rust, Tauri, TS |
| 2. Tag Picker UI | Frontend | Svelte (new component + modal) |
| 3. Tag Color Dots | Frontend | TS utility + Kanban + Modal |
| 4. Owner — Rust | Backend | task.rs, store.rs |
| 5. Owner — Bridge | Full stack | commands.rs, api.ts |
| 6. Owner — UI | Frontend | Modal + Kanban |
| 7. Owner — CLI | Backend | next.rs |
| 8. Split Prompt | Frontend | New component + Modal |

Dependencies: Task 2 depends on Task 1. Task 5 depends on Task 4. Task 6 depends on Task 5. Task 7 depends on Task 4. All others are independent.

Parallelizable groups:
- **Group A**: Tasks 1 → 2 → 3 (tags)
- **Group B**: Tasks 4 → 5 → 6, and 4 → 7 (owner)
- **Group C**: Task 8 (prompt)

Groups A, B, and C are fully independent.
