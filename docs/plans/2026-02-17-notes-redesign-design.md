# Notes Redesign - Design Document

**Date:** 2026-02-17
**Status:** Approved

## Core Concept

Notes become a processing queue for raw capture. Instead of one permanent scratchpad, Notes is a flat list of capture documents. You create a new note when a call starts, dump everything in, then process it through AI chat when you're done. The AI has full access to the task system - it can create, update, assign, and modify tasks based on what it finds in the notes.

**Note lifecycle:**
```
Create → Capture (during call) → Process (via AI chat) → Auto-archive
```

**Primary use case:** Quick capture during meetings/client calls (stream of consciousness, mixed action items/decisions/context), then AI-assisted processing to extract value into the task system.

## What Changes From Today

- Multiple notes instead of one document
- Each note is a separate BlockNote document with a title
- "Process with AI" replaces the current blunt `/send` command
- Processed notes auto-archive out of the active list
- Archive is accessible but tucked away

## What Stays The Same

- BlockNote editor (works well for quick capture)
- Auto-save (2s debounce)
- The `/task` slash command for quick inline task creation
- Keyboard shortcut `Cmd+N` to get to Notes

## Notes List & Creation

The Notes view becomes a two-level layout: list → editor. When you open Notes (`Cmd+N`), you see a list of active notes - newest first. Tapping a note opens the editor.

### Creating a New Note

- Button at the top of the list, or `Cmd+Shift+N`
- Title auto-generates as date + time: "Feb 17, 14:30"
- User can rename inline ("Client A kickoff call") but doesn't have to
- Drops straight into the editor, cursor ready

### List Shows

- Title (or auto-generated timestamp)
- First line preview (truncated)
- Relative time ("2h ago", "yesterday")
- Subtle indicator if the note has been processed or not

### Archive

- Not a separate view - collapsed "Archived" section at the bottom of the list
- Expand to see old processed notes for reference
- Simple count badge: "12 archived"

## AI Processing Flow

"Process with AI" opens chat with the note as context - and the AI can act on the task system.

When the user is done capturing, they hit a "Process" button (or `/process` slash command). This:

1. Serializes the note to markdown
2. Opens the chat overlay with the note content injected as context
3. User directs the conversation naturally - no hardcoded prompt

### Example Interactions

- "Pull out all the action items"
- "Summarize the key decisions"
- "The stuff about the timeline - add that to the Client A project task"
- "Proofread this and clean it up"

### AI Task Capabilities During Processing

- Create new tasks → inbox
- Add subtasks to existing tasks
- Update task titles, descriptions, status
- Modify due dates or other task data
- AI matches against existing tasks by name/context - confirms before acting if ambiguous

### After Processing

- Note auto-archives when user is satisfied
- Triggered by explicit action or closing chat after processing
- Note keeps a small "processed" badge

## What We're NOT Building

- **No folders or tags** - flat list is enough for transient notes
- **No search** - archive is there if needed, but notes aren't a knowledge base
- **No templates** - fastest possible capture, just start typing
- **No collaboration/sharing** - personal capture tool
- **No inline AI processing** - chat is the AI interface
- **No rich linking** - notes don't link to clients/projects/tasks; AI figures out associations during processing
- **No note-to-note references** - each note is independent

### Future Possibilities (Not Now)

- Quick-capture from any view (global shortcut)
- Voice-to-note (dictation during calls)
- Auto-title from AI after processing

## Implementation

### Database

Rename `scratchpad` table → `notes`:
```
id        TEXT PRIMARY KEY  (uuid)
title     TEXT              (auto-generated or user-set)
content   TEXT              (BlockNote JSON)
status    TEXT              (active/archived)
createdAt TEXT
updatedAt TEXT
```

Migration moves existing scratchpad content into first note.

### Store

`scratchpadStore` → `notesStore`:
- `createNote()` - create new note, return id
- `loadNote(id)` - load specific note into editor
- `saveNote(id, content)` - auto-save scoped to note id
- `archiveNote(id)` - set status to archived
- `listNotes()` - return all notes grouped by status
- `deleteNote(id)` - permanent delete

### UI Components

- `NotesList` - flat list view with create button, active/archived sections
- `NoteEditor` - existing BlockNote editor scoped to a note ID
- Replace `/send` slash command with `/process` (opens chat with note context, no hardcoded prompt)
- Keep `/task` slash command as-is

### IPC

Replace `scratchpad:get` / `scratchpad:save` with:
- `notes:list`
- `notes:get`
- `notes:create`
- `notes:save`
- `notes:archive`
- `notes:delete`

### Chat Integration

- `sendToAI()` sends note content as context without a fixed prompt
- User directs the conversation naturally
- AI task tools (create, update, assign) available during processing

### Navigation

- `Cmd+N` opens Notes list
- `Cmd+Shift+N` creates a new note and opens editor
- Internal view state: `'scratchpad'` renamed to `'notes'`
