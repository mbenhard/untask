import { eq, and, desc, lt } from 'drizzle-orm';

import { getDb } from '../db';
import { notes, type Note } from '../db/schema';

type BlockNoteBlock = {
  type: string;
  content?: Array<{ type: string; text?: string }> | string;
  props?: Record<string, unknown>;
  children?: BlockNoteBlock[];
};

const blockContentToText = (content: BlockNoteBlock['content']): string => {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content
    .map((item) => (item.type === 'text' ? (item.text ?? '') : ''))
    .join('');
};

export const blockNoteToMarkdown = (raw: string): string => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }

  if (!Array.isArray(parsed)) return raw;

  const lines: string[] = [];

  const processBlock = (block: BlockNoteBlock): void => {
    const text = blockContentToText(block.content);

    switch (block.type) {
      case 'heading': {
        const level = typeof block.props?.level === 'number' ? block.props.level : 1;
        const prefix = '#'.repeat(Math.min(Math.max(level, 1), 6));
        lines.push(`${prefix} ${text}`);
        break;
      }
      case 'bulletListItem':
        lines.push(`- ${text}`);
        break;
      case 'numberedListItem':
        lines.push(`1. ${text}`);
        break;
      case 'checkListItem': {
        const checked = block.props?.checked === true;
        lines.push(`- ${checked ? '[x]' : '[ ]'} ${text}`);
        break;
      }
      case 'codeBlock': {
        const lang = typeof block.props?.language === 'string' ? block.props.language : '';
        lines.push(`\`\`\`${lang}`);
        lines.push(text);
        lines.push('```');
        break;
      }
      case 'image': {
        const url = typeof block.props?.url === 'string' ? block.props.url : '';
        const caption = typeof block.props?.caption === 'string' ? block.props.caption : '';
        const name = typeof block.props?.name === 'string' ? block.props.name : '';
        const label = caption || name || 'image';
        lines.push(`![${label}](${url})`);
        break;
      }
      case 'file': {
        const fileUrl = typeof block.props?.url === 'string' ? block.props.url : '';
        const fileName = typeof block.props?.name === 'string' ? block.props.name : 'file';
        lines.push(`[${fileName}](${fileUrl})`);
        break;
      }
      case 'paragraph':
      default:
        lines.push(text);
        break;
    }

    if (Array.isArray(block.children)) {
      block.children.forEach(processBlock);
    }
  };

  (parsed as BlockNoteBlock[]).forEach(processBlock);

  return lines.join('\n').trim();
};

const EMPTY_NOTE_TTL_MS = 60_000; // 1 minute

export function createNote(title?: string): Note {
  const db = getDb();
  const now = new Date().toISOString();

  const [created] = db
    .insert(notes)
    .values({ title: title ?? '', content: '', status: 'active', updatedAt: now })
    .returning()
    .all();
  return created;
}

export function getNote(id: string): Note | undefined {
  const db = getDb();
  const [note] = db
    .select()
    .from(notes)
    .where(eq(notes.id, id))
    .all();
  return note;
}

export function saveNote(
  id: string,
  content: string,
  title?: string,
): Note | undefined {
  const db = getDb();
  const now = new Date().toISOString();
  const set: Record<string, string> = { content, updatedAt: now };
  if (title !== undefined) set.title = title;

  const [updated] = db
    .update(notes)
    .set(set)
    .where(eq(notes.id, id))
    .returning()
    .all();
  return updated;
}

export function archiveNote(id: string): Note | undefined {
  const db = getDb();
  const [updated] = db
    .update(notes)
    .set({ status: 'archived', updatedAt: new Date().toISOString() })
    .where(eq(notes.id, id))
    .returning()
    .all();
  return updated;
}

export function restoreNote(id: string): Note | undefined {
  const db = getDb();
  const [updated] = db
    .update(notes)
    .set({ status: 'active', updatedAt: new Date().toISOString() })
    .where(eq(notes.id, id))
    .returning()
    .all();
  return updated;
}

export function deleteNote(id: string): void {
  const db = getDb();
  db.delete(notes).where(eq(notes.id, id)).run();
}

export function pinNote(id: string): Note | undefined {
  const db = getDb();
  const [updated] = db
    .update(notes)
    .set({ isPinned: true, updatedAt: new Date().toISOString() })
    .where(eq(notes.id, id))
    .returning()
    .all();
  return updated;
}

export function unpinNote(id: string): Note | undefined {
  const db = getDb();
  const [updated] = db
    .update(notes)
    .set({ isPinned: false, updatedAt: new Date().toISOString() })
    .where(eq(notes.id, id))
    .returning()
    .all();
  return updated;
}

export function duplicateNote(id: string): Note | undefined {
  const db = getDb();
  const original = getNote(id);
  if (!original) return undefined;
  const now = new Date().toISOString();
  const [created] = db
    .insert(notes)
    .values({
      title: original.title,
      content: original.content,
      status: 'active',
      isPinned: false,
      updatedAt: now,
    })
    .returning()
    .all();
  return created;
}

/**
 * Derive a display title for a note. When the stored title is empty,
 * extract the first non-empty text from BlockNote JSON content.
 * Used by the renderer (list) and AI tools so they see meaningful titles.
 */
export function getDisplayTitle(note: Note): string {
  if (note.title) return note.title;
  return deriveAutoTitle(note.content);
}

/**
 * Extract a display title from BlockNote JSON content.
 * Returns the text of the first non-empty text block, capped at 120 characters.
 */
export function deriveAutoTitle(content: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Legacy markdown — use first non-empty line
    const firstLine = content.split('\n').find((l) => l.trim());
    if (!firstLine) return '';
    const cleaned = firstLine.replace(/^#+\s*/, '').trim();
    return cleaned.length > 120 ? cleaned.slice(0, 120) + '…' : cleaned;
  }

  if (!Array.isArray(parsed)) return '';

  for (const block of parsed as BlockNoteBlock[]) {
    // Skip non-text blocks (image, file)
    if (block.type === 'image' || block.type === 'file') continue;
    const text = blockContentToText(block.content).trim();
    if (text) return text.length > 120 ? text.slice(0, 120) + '…' : text;
  }
  return '';
}

export function listNotes(): { active: Note[]; archived: Note[] } {
  const db = getDb();

  // Clean up empty ghost notes older than 1 minute
  const cutoff = new Date(Date.now() - EMPTY_NOTE_TTL_MS).toISOString();
  db.delete(notes)
    .where(
      and(
        eq(notes.status, 'active'),
        eq(notes.content, ''),
        lt(notes.createdAt, cutoff),
      ),
    )
    .run();

  const all = db
    .select()
    .from(notes)
    .orderBy(desc(notes.isPinned), desc(notes.updatedAt))
    .all();

  const active: Note[] = [];
  const archived: Note[] = [];
  for (const note of all) {
    if (note.status === 'archived') archived.push(note);
    else active.push(note);
  }

  return { active, archived };
}
