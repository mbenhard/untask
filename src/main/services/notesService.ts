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
  const autoTitle =
    title ??
    new Date().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

  const [created] = db
    .insert(notes)
    .values({ title: autoTitle, content: '', status: 'active', updatedAt: now })
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

export function deleteNote(id: string): void {
  const db = getDb();
  db.delete(notes).where(eq(notes.id, id)).run();
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
    .orderBy(desc(notes.createdAt))
    .all();

  const active: Note[] = [];
  const archived: Note[] = [];
  for (const note of all) {
    if (note.status === 'archived') archived.push(note);
    else active.push(note);
  }

  return { active, archived };
}
