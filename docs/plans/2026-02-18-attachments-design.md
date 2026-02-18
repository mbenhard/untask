# Attachments in Tasks & Notes

**Date:** 2026-02-18
**Status:** Approved (revised after review)

## Summary

Add inline file attachments (images, PDFs, any file) to tasks and notes. Files are stored on disk, referenced via custom protocol URL in BlockNote's native Image/File blocks. Tasks get a paperclip button in the metadata row; notes use slash commands and paste only. AI assistant sees attached images when discussing tasks.

## Decisions

| Decision | Choice |
|----------|--------|
| Attachment location | Inline in BlockNote editor (not a separate section) |
| File storage | Files on disk at `attachments/` dir, referenced by `untask-file://` protocol |
| Task upload UX | Paperclip button in metadata segment row + paste + drag-drop |
| Notes upload UX | No extra button — slash menu (`/image`, `/file`) + paste + drag-drop |
| Drag-and-drop | Supported everywhere (task body, note editor) |
| AI integration | Pass attached images to vision-capable models in task context |
| Upload integration | BlockNote's built-in `uploadFile` config (single handler for all entry methods) |
| Max file size | 50MB per file |

## 1. File Storage & Protocol

All attachments live on disk:

```
~/Library/Application Support/Untask/attachments/<uuid>.<ext>
```

When a file is attached (paste, drop, or file picker), the main process:
1. Generates a UUID filename, preserving the original extension (original filename preserved only in BlockNote's File block `name` prop, not on disk)
2. Copies/writes the file data to the attachments directory
3. Returns a custom URL: `untask-file://<uuid>.png`

### Custom Protocol Registration

Electron requires a specific initialization order for custom protocols:

1. **Before `app.whenReady()`** — call `protocol.registerSchemesAsPrivileged()` to declare `untask-file` as a privileged scheme:
   ```typescript
   protocol.registerSchemesAsPrivileged([
     { scheme: 'untask-file', privileges: { standard: false, secure: true, supportFetchAPI: true, corsEnabled: false } }
   ]);
   ```
   This must run at the top level of the main process entry point (not inside any callback).

2. **Inside `app.whenReady()`** — register the protocol handler via `protocol.handle()`:
   ```typescript
   protocol.handle('untask-file', (request) => {
     const filePath = resolveAttachmentPath(request.url);
     return net.fetch(`file://${filePath}`);
   });
   ```

3. **CSP** — whitelist `untask-file:` in the renderer's Content Security Policy `img-src` directive.

4. **Packaged app** — verify that serving files from `~/Library/Application Support/` works with the Electron Fuses config (`OnlyLoadAppFromAsar`). This should be fine since the protocol handler reads from an absolute filesystem path, not from the ASAR.

### IPC Channels

| Channel | Input | Output | Purpose |
|---------|-------|--------|---------|
| `attachment:save` | `{ data: Uint8Array, filename: string }` | `untask-file://` URL | Save file to disk |
| `attachment:open` | `{ id: string }` | void | Open in system default app |
| `attachment:reveal` | `{ id: string }` | void | Reveal in Finder |
| `attachment:delete` | `{ id: string }` | void | Delete from disk |

**Important:** The renderer is sandboxed (`sandbox: true`, `nodeIntegration: false`), so `Buffer` is unavailable. The IPC accepts `Uint8Array` from the renderer; the main process handler converts to `Buffer` internally. Both paste and drag-drop go through BlockNote's `uploadFile` callback, which provides a `File` object — read via `file.arrayBuffer()` and wrap in `Uint8Array`.

**File size limit:** Reject files larger than 50MB with a user-facing error message. Check size before saving.

**Error handling for `attachment:open` / `attachment:reveal`:** If the file was deleted externally, show a notification: "File not found — it may have been moved or deleted."

### Backup Compatibility

Existing backup system copies `~/Library/Application Support/Untask/`. Attachments folder is inside that — local backups automatically include all attachments.

**Note:** If the attachments directory grows large, the backup export/import flow (which currently operates on the database file) would need to be extended to bundle attachments. For MVP, document this as a known limitation.

### Orphan Cleanup

On app startup, scan all task bodies and note contents for `untask-file://` references. Files in the attachments directory not referenced anywhere are candidates for cleanup.

**Safety guards to prevent data loss:**
- **Grace period:** Never delete files created within the last 7 days, even if unreferenced. This protects against: app crashes before the 2s editor debounce saves, undo operations that temporarily remove references, and bugs in the scanning logic.
- **Soft delete:** Move orphaned files (older than 7 days) to `attachments/.trash/` instead of deleting immediately. Files in `.trash/` are permanently deleted after 30 days.
- The `.trash/` directory is excluded from the reference scan.

## 2. BlockNote Integration

### `uploadFile` Config (Single Integration Point)

Instead of separate paste/drop handlers, use BlockNote's built-in `uploadFile` configuration. This single function handles all file entry methods — paste, drag-drop, and slash menu — uniformly:

```typescript
const editor = useCreateBlockNote({
  uploadFile: async (file: File) => {
    // Enforce size limit
    if (file.size > 50 * 1024 * 1024) {
      throw new Error('File exceeds 50MB limit');
    }

    const arrayBuffer = await file.arrayBuffer();
    const url = await window.flusk.attachments.save({
      data: new Uint8Array(arrayBuffer),
      filename: file.name,
    });
    return url; // untask-file://uuid.ext
  },
});
```

BlockNote automatically:
- Detects file type and creates the appropriate block (Image for images, File for others)
- Inserts the block at the cursor position
- Shows upload progress indicators

No custom `handlePaste` or `handleDrop` overrides needed.

### Slash Menu Filter

Replace the `getTextOnlySlashMenuItems` filter on subtasks. Instead of removing it entirely (which would expose Video and Audio blocks that we don't support), replace with a filter that keeps Image and File but still removes Video and Audio:

```typescript
const getAttachmentSlashMenuItems = (editor) =>
  getDefaultReactSlashMenuItems(editor).filter(
    (item) => item.title !== 'Video' && item.title !== 'Audio'
  );
```

Apply this filter to all tasks (including subtasks) instead of the current text-only filter.

### Block Interactions

BlockNote's built-in block toolbar already provides delete. We extend with:
- **"Open"** — calls `attachment:open` IPC → opens in system default app
- **"Reveal in Finder"** — calls `attachment:reveal` IPC

No custom block types — native Image and File blocks with custom URL scheme.

## 3. Task UX — Paperclip & Attachment Count

New **AttachmentSegment** in TaskBody's metadata row (alongside due date, priority, recurrence, status, client, subtasks):

- **No attachments:** Paperclip icon, muted, labeled "Attach". Click → native file picker (`dialog.showOpenDialog`, multiSelections: true).
- **Has attachments:** Paperclip icon + count badge (e.g. "3"). Click → file picker to add more.

### Attachment Count Performance

Count is derived by scanning the task's BlockNote JSON for image/file blocks. To avoid re-parsing on every render:

- Compute the count via a `useMemo` hook keyed on `task.body` string value
- The parser runs only when the body content actually changes
- Since `TaskBody` only renders when expanded, the cost is minimal (one task at a time, not the entire list)
- The count badge in the collapsed `TaskItem` row reads from the same memoized value, passed as a prop

### File Picker Flow

1. Click paperclip → `dialog.showOpenDialog()` via IPC (with `multiSelections: true`)
2. User selects file(s)
3. Each file read via `FileReader.readAsArrayBuffer()`, sent via `attachment:save`
4. Image/file blocks appended to end of task body via the editor API
5. If task had no body (`null`), a new BlockNote document is created with just the attachment blocks

### Paste/Drop on Collapsed Task

Pasting or dropping a file while a task row is selected but not expanded → auto-expands the task body and inserts there.

### Visual Weight

Attachment segment stays subtle — same style as other metadata segments. No thumbnails in the task row. Expand the task to see images/files inline in the editor.

## 4. Notes UX

Notes already have the full BlockNote slash menu (Image, File blocks available). No extra UI button needed — notes are an editor-first experience where slash commands and paste feel natural.

Same backend: the `uploadFile` config on the editor handles paste/drop/slash → save to disk → insert block with `untask-file://` URL.

## 5. AI Integration

When building AI context for a task in chat:

### Injection Point

The **renderer** extracts image URLs when sending a chat message that references a task. This follows the existing pattern where `ChatInput.tsx` sends images as data URLs via the `images` field of the chat send payload:

1. When the user sends a chat message, check if there's a focused/referenced task
2. Parse the task's BlockNote body JSON for image blocks
3. For each image block, resolve the `untask-file://` URL to a file path via a new IPC call (`attachment:read` → returns base64 data URL)
4. Append the data URLs to the existing `images[]` array in the chat send payload
5. The main process `chat.ts` handles them identically to pasted chat images — no changes needed downstream

### Constraints

- **Images only** — PDFs and other files are excluded from AI context
- **Vision models only** — for non-vision models, skip images and append note: "(This task has N image attachments — use a vision-capable model to see them)"
- **File size guard:** Resize images larger than 2048px on any side before passing to AI. Extract existing resize logic from `ChatInput.tsx` to a shared utility (`src/renderer/utils/imageResize.ts`) used by both chat input and task context injection.

## Implementation Scope

### New files
- `src/main/attachments.ts` — attachment service (save, delete, read, list, cleanup)
- `src/main/protocol.ts` — `untask-file://` protocol registration (both `registerSchemesAsPrivileged` and `protocol.handle`)
- `src/renderer/utils/imageResize.ts` — shared image resize utility (extracted from ChatInput)

### Modified files
- `src/main/index.ts` — import protocol registration (before `app.whenReady()`)
- `src/main/ipc.ts` — register `attachment:*` IPC handlers
- `src/preload/index.ts` — expose `window.flusk.attachments.*` API
- `src/types/ipc.ts` — attachment IPC types
- `src/types/preload.d.ts` — attachment preload types
- `src/renderer/components/editor/BlockEditor.tsx` — add `uploadFile` config to `useCreateBlockNote`
- `src/renderer/components/tasks/TaskBody.tsx` — add AttachmentSegment, replace slash menu filter
- `src/renderer/components/tasks/TaskItem.tsx` — handle paste/drop on collapsed task, pass attachment count
- `src/renderer/components/layout/ChatInput.tsx` — extract resize logic to shared utility, attach task images to chat payload
- `src/main/ai/chat.ts` — no changes needed (images arrive via existing `images[]` field)

### No changes needed
- `src/main/db/schema.ts` — attachments are files on disk, not DB rows
- `src/renderer/components/notes/NoteEditor.tsx` — `uploadFile` on BlockEditor handles everything
