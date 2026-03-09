# Task Attachment Improvements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show attachment thumbnail as card header in kanban, support CMD+V paste during quick-add card creation, and handle edge cases around attachment UX.

**Architecture:** Extend the Kanban card to fetch and display the first image attachment as a header thumbnail via the existing `get_attachment_data_url` Tauri command. Extend the quick-add textarea to intercept paste events and buffer clipboard images until the task is created, then flush them as attachments. No backend changes needed — all existing Tauri commands suffice.

**Tech Stack:** Svelte 5, Tauri IPC (`invoke`), Tailwind CSS, existing `api.ts` wrappers

---

## Feature 1: Attachment Thumbnail as Card Header

### Summary

When a task has image attachments, display the first image as a small header image above the title in the kanban card. This gives visual richness without breaking the compact, monochrome design language.

### Key Decisions

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| Which attachment to show? | First attachment where `mime_type` starts with `image/` | Simple, predictable. User controls order by adding images first. |
| How to fetch? | `getAttachmentDataUrl(taskId, filename)` | Already exists. Returns base64 data URL. |
| When to fetch? | Lazily on mount, cached per task ID + filename | Avoid fetching thumbnails for off-screen cards. Cache avoids re-fetching on column reorder. |
| Image sizing? | Full card width, fixed max-height ~80px, `object-cover` | Keeps cards compact per design language. Covers width, crops height. |
| Loading state? | Render card without image first, fade image in when loaded | No layout shift — reserve fixed height via aspect-ratio container. |
| Non-image attachments? | Skip — only show thumbnail for `image/*` MIME types | PDFs, text files don't have meaningful thumbnails. |
| Performance concern? | Base64 data URLs for many cards could be heavy | Acceptable for now — cards are lazily rendered in scroll. Future: generate actual thumbnails on the backend. |

### Task 1: Create `CardThumbnail.svelte` component

**Files:**
- Create: `apps/desktop/src/lib/components/CardThumbnail.svelte`

**Step 1: Write the component**

```svelte
<script lang="ts">
  import { getAttachmentDataUrl } from "$lib/api";

  let {
    taskId,
    filename,
  }: {
    taskId: number;
    filename: string;
  } = $props();

  let src = $state<string | null>(null);
  let error = $state(false);

  $effect(() => {
    let cancelled = false;
    src = null;
    error = false;

    getAttachmentDataUrl(taskId, filename)
      .then((url) => {
        if (!cancelled) src = url;
      })
      .catch(() => {
        if (!cancelled) error = true;
      });

    return () => { cancelled = true; };
  });
</script>

{#if src}
  <img
    {src}
    alt=""
    class="h-[72px] w-full rounded-t-[5px] border-b border-border/40 object-cover"
    draggable="false"
  />
{:else if !error}
  <!-- Reserve space while loading -->
  <div class="h-[72px] w-full rounded-t-[5px] border-b border-border/40 bg-accent/30 animate-pulse"></div>
{/if}
```

Design notes:
- `h-[72px]` keeps thumbnails compact (design language: density over airiness).
- `rounded-t-[5px]` matches `rounded-[6px]` of the card minus 1px border.
- `border-b border-border/40` — border as structural separator (design language: borders over fills).
- `object-cover` — crops cleanly for any aspect ratio.
- On error, silently disappear — no broken image icon.
- `animate-pulse` on loading skeleton — restrained, monochrome.

**Step 2: Commit**

```bash
git add apps/desktop/src/lib/components/CardThumbnail.svelte
git commit -m "feat: add CardThumbnail component for kanban card headers"
```

### Task 2: Integrate CardThumbnail into Kanban cards

**Files:**
- Modify: `apps/desktop/src/lib/components/Kanban.svelte`

**Step 1: Import CardThumbnail and add helper**

At the top of `<script>`, add:
```typescript
import CardThumbnail from "$lib/components/CardThumbnail.svelte";
```

Add a helper function:
```typescript
function firstImageAttachment(task: TaskDto): string | null {
  const img = task.attachments?.find((a) => a.mime_type.startsWith("image/"));
  return img?.filename ?? null;
}
```

**Step 2: Add thumbnail to card template**

In the card `<div>` (the one with class `kanban-card group relative ...`), insert *before* the `<!-- Row 1: title -->` comment:

```svelte
<!-- Thumbnail header -->
{#if task.id != null}
  {@const thumb = firstImageAttachment(task)}
  {#if thumb}
    <div class="-mx-2.5 -mt-2 mb-1.5">
      <CardThumbnail taskId={task.id} filename={thumb} />
    </div>
  {/if}
{/if}
```

The negative margins (`-mx-2.5 -mt-2`) pull the image to the card edges, canceling the card's `px-2.5 py-2` padding so the image goes edge-to-edge. `mb-1.5` provides spacing before the title.

**Step 3: Commit**

```bash
git add apps/desktop/src/lib/components/Kanban.svelte
git commit -m "feat: show first image attachment as kanban card header"
```

### Task 3: Manual QA

- Create a task, attach a PNG image → verify thumbnail appears as card header.
- Attach a PDF first, then an image → verify only the image shows as thumbnail.
- Task with no attachments → verify card renders as before (no empty space).
- Task with only non-image attachments → verify no thumbnail shown.
- Drag a card with thumbnail → verify drag still works normally.
- Scroll a column with many thumbnail cards → verify no visible lag.

---

## Feature 2: CMD+V Paste During Quick-Add

### Summary

When the user is typing a task title in the quick-add textarea, allow them to paste an image from clipboard via CMD+V. The image gets buffered in memory and attached after the task is created.

### Key Decisions

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| When to attach? | After `addTask()` returns the new task ID | Can't attach to a task that doesn't exist yet. |
| Where to buffer? | Component-level `$state` array of `{data, filename, mimeType}` | Simple, cleared on submit/cancel. |
| Visual indicator? | Small image count badge next to the textarea | User needs to know paste was captured. Show attachment count, not full previews — keeps it compact. |
| What if task creation fails? | Discard buffered images, show error | Don't leave orphaned state. |
| Text paste? | Let it pass through to textarea normally | Only intercept when `clipboardData.files` has image items. |
| Multiple pastes? | Accumulate in buffer | User might paste several screenshots. |
| Max buffer size? | 25 MB total (matches attachment limit) | Prevent memory issues. |
| Cancel (Escape)? | Clear buffer along with title | Clean slate. |

### Task 4: Add paste buffer state to Kanban

**Files:**
- Modify: `apps/desktop/src/lib/components/Kanban.svelte`

**Step 1: Add state and paste handler**

Add to the quick-add state section:
```typescript
// ── Quick-add paste buffer ───────────────────────────────────────
type PastedImage = { data: number[]; filename: string; mimeType: string };
let quickAddPastedImages = $state<PastedImage[]>([]);
```

Add a paste handler function:
```typescript
async function handleQuickAddPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (!item.type.startsWith("image/")) continue;

    e.preventDefault();
    const file = item.getAsFile();
    if (!file) continue;

    const buffer = await file.arrayBuffer();
    const data = Array.from(new Uint8Array(buffer));

    // Check total buffer size (25 MB limit)
    const totalSize = quickAddPastedImages.reduce((sum, img) => sum + img.data.length, 0) + data.length;
    if (totalSize > 25 * 1024 * 1024) continue;

    const ext = item.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
    const filename = `paste-${Date.now()}.${ext}`;
    quickAddPastedImages = [...quickAddPastedImages, { data, filename, mimeType: item.type }];
    break; // One image per paste event
  }
}
```

**Step 2: Update `startQuickAdd` to clear buffer**

```typescript
function startQuickAdd(columnId: string) {
  addingInColumn = columnId;
  quickAddTitle = "";
  quickAddError = null;
  quickAddErrorFlash = false;
  quickAddPastedImages = [];
}
```

**Step 3: Update `submitQuickAdd` to flush buffer after task creation**

Replace `submitQuickAdd`:
```typescript
async function submitQuickAdd(columnId: string) {
  const title = quickAddTitle.trim();
  if (!title) return;
  try {
    const task = await addTask(title, columnId);
    // Flush buffered paste images as attachments
    if (task.id != null && quickAddPastedImages.length > 0) {
      for (const img of quickAddPastedImages) {
        try {
          await attachFileBytes(task.id, img.data, img.filename, img.mimeType);
        } catch {
          // Silently skip failed attachments — task was already created
        }
      }
    }
    quickAddTitle = "";
    quickAddError = null;
    quickAddPastedImages = [];
    addingInColumn = null;
    onTasksChanged();
  } catch {
    quickAddError = "Failed to create task";
    quickAddErrorFlash = true;
    setTimeout(() => { quickAddErrorFlash = false; }, 800);
    setTimeout(() => { quickAddError = null; }, 3000);
  }
}
```

Add the import at the top:
```typescript
import { addTask, updateTask, attachFileBytes, type ColumnDto, type TaskDto } from "$lib/api";
```

**Step 4: Update Escape handler to clear buffer**

In `handleQuickAddKeydown`, the Escape branch already sets `addingInColumn = null`. Also clear the buffer:
```typescript
function handleQuickAddKeydown(e: KeyboardEvent, columnId: string) {
  if (e.key === "Enter") {
    e.preventDefault();
    submitQuickAdd(columnId);
  } else if (e.key === "Escape") {
    addingInColumn = null;
    quickAddPastedImages = [];
  }
}
```

**Step 5: Commit**

```bash
git add apps/desktop/src/lib/components/Kanban.svelte
git commit -m "feat: buffer pasted images during quick-add for post-creation attachment"
```

### Task 5: Add paste handler and visual indicator to quick-add textareas

**Files:**
- Modify: `apps/desktop/src/lib/components/Kanban.svelte`

**Step 1: Add `onpaste` to both quick-add textareas**

Both textareas (empty column version at ~line 436 and non-empty column version at ~line 469) need:
```
onpaste={handleQuickAddPaste}
```

Add it alongside the existing `onkeydown`, `onblur`, `oninput` handlers.

**Step 2: Add visual indicator after textarea**

After each textarea (inside the same wrapper `<div>`), add the paste indicator:
```svelte
{#if quickAddPastedImages.length > 0}
  <div class="mt-1 flex items-center gap-1 font-mono text-[9px] text-muted-foreground/50">
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
    </svg>
    {quickAddPastedImages.length} image{quickAddPastedImages.length > 1 ? "s" : ""} pasted
  </div>
{/if}
```

This reuses the same attachment icon and style already used in the card's attachment count indicator — consistent visual language.

**Step 3: Update blur handler**

The `onblur` on both textareas currently does:
```
onblur={() => { if (quickAddTitle.trim()) submitQuickAdd(col.id); else addingInColumn = null; }}
```

Update the else branch to also clear the buffer:
```
onblur={() => { if (quickAddTitle.trim()) submitQuickAdd(col.id); else { addingInColumn = null; quickAddPastedImages = []; } }}
```

**Step 4: Commit**

```bash
git add apps/desktop/src/lib/components/Kanban.svelte
git commit -m "feat: wire paste handler and image indicator to quick-add textareas"
```

### Task 6: Manual QA for paste during quick-add

- Click "+ Add task" in a column, paste a screenshot → verify "1 image pasted" indicator appears.
- Type a title, paste another image → verify "2 images pasted" shown.
- Press Enter → verify task is created AND both images appear as attachments (open modal to verify).
- Paste text (not an image) → verify it goes into the title normally.
- Press Escape after pasting → verify buffer is cleared, no orphaned data.
- Click outside (blur) without title → verify buffer is cleared.
- Click outside with a title → verify task is created with attachments.

---

## Feature 3: Edge Cases & Uncovered Flows

### Summary

Additional edge cases and UX gaps to address.

### Edge Case Analysis

| Edge Case | Current Behavior | Proposed Fix | Priority |
|-----------|-----------------|-------------|----------|
| **Card thumbnail for deleted-on-disk attachment** | `getAttachmentDataUrl` would error | `CardThumbnail` already handles error by hiding — OK as-is | None (handled) |
| **Very large images as thumbnails** | Full base64 data URL loaded (could be 5-10MB per card) | Future: generate small thumbnails on backend. For now, acceptable — images are capped at 25MB and cards are lazy | Low — defer |
| **Card thumbnail cache invalidation** | Thumbnail refetches on every mount | Add a simple module-level `Map<string, string>` cache keyed by `{taskId}:{filename}` | Medium |
| **Quick-add paste buffer memory pressure** | Buffer holds raw bytes in JS memory (up to 25MB) | Already capped at 25MB total. Acceptable for short-lived buffer. | None (handled) |
| **Task deleted while quick-add paste in progress** | N/A — quick-add creates a new task | Not an issue | None |
| **Drag-and-drop files onto quick-add textarea** | Not handled — files would be ignored | Could support, but complicates the UX. Defer. | Low — defer |
| **SVG attachments as thumbnails** | `image/svg+xml` starts with `image/` — would try to show | SVGs render fine in `<img>` tags. OK as-is | None (handled) |
| **Animated GIFs as thumbnails** | Would display as static first frame in `<img>` tag with `object-cover` | Acceptable — full GIF visible in modal preview | None (handled) |
| **Multiple quick-add textareas open** | Only one can be open at a time (single `addingInColumn` state) | Not an issue — buffer is global to the single active quick-add | None (handled) |

### Task 7: Add thumbnail cache to CardThumbnail

**Files:**
- Modify: `apps/desktop/src/lib/components/CardThumbnail.svelte`

**Step 1: Add module-level cache**

Add before the component's `$props()`:
```typescript
const thumbnailCache = new Map<string, string>();
```

Update the `$effect`:
```typescript
$effect(() => {
  let cancelled = false;
  error = false;

  const cacheKey = `${taskId}:${filename}`;
  const cached = thumbnailCache.get(cacheKey);
  if (cached) {
    src = cached;
    return;
  }

  src = null;

  getAttachmentDataUrl(taskId, filename)
    .then((url) => {
      if (!cancelled) {
        thumbnailCache.set(cacheKey, url);
        src = url;
      }
    })
    .catch(() => {
      if (!cancelled) error = true;
    });

  return () => { cancelled = true; };
});
```

**Step 2: Commit**

```bash
git add apps/desktop/src/lib/components/CardThumbnail.svelte
git commit -m "perf: cache thumbnail data URLs to avoid repeated IPC calls"
```

---

## Deferred Items

These are intentionally out of scope for this plan:

1. **Backend thumbnail generation** — Generating smaller thumbnails (e.g. 200px wide JPEG) at attachment time would significantly reduce data transferred for kanban views. This is a separate task involving Rust `image` crate integration.

2. **Drag-and-drop files onto quick-add** — Supporting file drops on the quick-add textarea. Lower priority since CMD+V is the primary quick flow.

3. **Reorder attachments** — Currently attachments are ordered by creation time. No reorder UI exists. Would be useful if thumbnail-as-header matters to users.

4. **Lazy/virtual scroll for thumbnail cards** — If columns grow very large with many thumbnail cards, consider intersection observer to only load visible thumbnails. Current approach is acceptable for typical column sizes.

---

## File Change Summary

| File | Action | What Changes |
|------|--------|-------------|
| `apps/desktop/src/lib/components/CardThumbnail.svelte` | **Create** | New component: async thumbnail loader with cache |
| `apps/desktop/src/lib/components/Kanban.svelte` | **Modify** | Import CardThumbnail, add `firstImageAttachment` helper, add thumbnail to card template, add paste buffer state/handler, wire paste to textareas, add paste indicator |

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Base64 data URLs cause memory pressure with many image cards | Medium | Thumbnail cache prevents duplicate loads. Backend thumbnail generation deferred as follow-up. |
| Paste event handling conflicts with text paste | Low | Only intercept when `clipboardData.items` contains `image/*`. Text pastes pass through. |
| Layout shift when thumbnail loads | Low | Fixed `h-[72px]` container with loading skeleton prevents CLS. |
| Quick-add submit feels slow when flushing many images | Low | Attachments flush sequentially after task creation. Could parallelize but serial is simpler and attachment count is typically 1-2. |
