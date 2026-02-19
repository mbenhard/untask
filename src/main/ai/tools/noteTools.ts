import { z } from 'zod';

import { getNote, saveNote, listNotes, blockNoteToMarkdown } from '../../services/notesService';
import type { ToolRegistryEntry, ToolExecutionContext, ToolExecutionEnvelope } from './types';
import { successResult, normalizeForSummary } from './helpers';

// ─── Schemas ────────────────────────────────────────────────────

export const listNotesToolInputSchema = z.object({});

export const readNoteToolInputSchema = z.object({
  noteId: z.string().optional().describe('ID of the note to read. If omitted, reads the most recent active note.'),
});

export const editNoteToolInputSchema = z.object({
  action: z.enum(['append', 'replace', 'rewrite']).describe('Type of edit. Append to add to the end, replace to change a specific target string, rewrite to clear and set entirely new content.'),
  noteId: z.string().optional().describe('ID of the note to edit. If omitted, edits the most recent active note.'),
  content: z.string().optional().describe('The content to append or rewrite. Required if action is append or rewrite.'),
  target: z.string().optional().describe('The exact string to replace. Required if action is replace.'),
  replacement: z.string().optional().describe('The text to replace the target with. Required if action is replace.'),
});

// ─── Helpers ────────────────────────────────────────────────────

const resolveNoteId = (noteId?: string, activeNoteId?: string): string => {
  if (noteId) return noteId;
  if (activeNoteId) return activeNoteId;
  const { active } = listNotes();
  if (active.length === 0) throw new Error('No active notes found.');
  return active[0].id;
};

// ─── Tool definitions ───────────────────────────────────────────

export const listNotesTool = {
  name: 'list_notes',
  description: 'List all notes. Returns active notes and archived notes. Use when the user asks to see their notes or when you need to find a specific note.',
  schema: listNotesToolInputSchema,
  execute: async (): Promise<ToolExecutionEnvelope> => {
    const { active, archived } = listNotes();

    const formatNote = (note: { id: string; title: string; updatedAt: string | null }) => ({
      id: note.id,
      title: note.title,
      updatedAt: note.updatedAt,
    });

    return {
      status: 'success' as const,
      message: `Found ${active.length} active note${active.length === 1 ? '' : 's'} and ${archived.length} archived.`,
      data: {
        active: active.map(formatNote),
        archived: archived.map(formatNote),
      },
    };
  },
} satisfies ToolRegistryEntry<'list_notes', typeof listNotesToolInputSchema>;

export const readNoteTool = {
  name: 'read_note',
  description: 'Read a specific note by ID. If noteId is omitted, reads the most recent active note. Use before editing to understand current context. If note content is attached in the system prompt, use it directly — do not call read_note.',
  schema: readNoteToolInputSchema,
  execute: async (input: { noteId?: string }, context: ToolExecutionContext): Promise<ToolExecutionEnvelope> => {
    const id = resolveNoteId(input.noteId, context.activeNoteId);
    const note = getNote(id);
    if (!note) throw new Error(`Note ${id} not found.`);
    const markdown = blockNoteToMarkdown(note.content);
    const hasContent = markdown.trim().length > 0;

    return {
      status: 'success',
      message: hasContent
        ? `Loaded note "${note.title}" (${markdown.length} chars).`
        : `Note "${note.title}" is currently empty.`,
      data: { note: { ...note, content: markdown } },
    };
  },
} satisfies ToolRegistryEntry<'read_note', typeof readNoteToolInputSchema>;

export const editNoteTool = {
  name: 'edit_note',
  description: 'Edit a note. If noteId is omitted, edits the most recent active note. Use action=append to add text, action=replace to update one specific section, and action=rewrite to replace the full document.',
  schema: editNoteToolInputSchema,
  execute: async (input: z.infer<typeof editNoteToolInputSchema>, context: ToolExecutionContext): Promise<ToolExecutionEnvelope> => {
    const id = resolveNoteId(input.noteId, context.activeNoteId);
    const current = getNote(id);
    if (!current) throw new Error(`Note ${id} not found.`);
    const beforeContent = current.content;

    if (input.action === 'append') {
      if (!input.content) throw new Error('Content is required for append action.');
      const separator =
        beforeContent.length === 0 || beforeContent.endsWith('\n') ? '' : '\n\n';
      const nextContent = `${beforeContent}${separator}${input.content}`;
      const saved = saveNote(id, nextContent);

      return successResult(
        context,
        'edit_note',
        'Note appended',
        `Added ${input.content.length} characters to "${current.title}".`,
        {
          before: beforeContent,
          after: nextContent,
          note: saved,
        },
        { viewIntent: 'notes' },
      );
    }

    if (input.action === 'replace') {
      if (!input.target || typeof input.replacement !== 'string') throw new Error('Target and replacement are required for replace action.');
      const startIndex = beforeContent.indexOf(input.target);
      if (startIndex === -1) {
        throw new Error('Note replace target was not found.');
      }

      const nextContent = `${beforeContent.slice(0, startIndex)}${input.replacement}${beforeContent.slice(
        startIndex + input.target.length,
      )}`;
      const saved = saveNote(id, nextContent);

      return successResult(
        context,
        'edit_note',
        'Note section replaced',
        [
          `Updated one section in "${current.title}".`,
          `Before: "${normalizeForSummary(input.target, 72)}"`,
          `After: "${normalizeForSummary(input.replacement, 72)}"`,
        ].join(' '),
        {
          before: beforeContent,
          after: nextContent,
          diff: {
            before: input.target,
            after: input.replacement,
            startIndex,
          },
          note: saved,
        },
        { viewIntent: 'notes' },
      );
    }

    if (!input.content) throw new Error('Content is required for rewrite action.');
    const nextContent = input.content;
    const saved = saveNote(id, nextContent);

    return successResult(
      context,
      'edit_note',
      'Note rewritten',
      `Replaced full note "${current.title}" (${beforeContent.length} -> ${nextContent.length} chars).`,
      {
        before: beforeContent,
        after: nextContent,
        note: saved,
      },
      { viewIntent: 'notes' },
    );
  },
} satisfies ToolRegistryEntry<'edit_note', typeof editNoteToolInputSchema>;
