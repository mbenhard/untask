import { eq, and, desc, lt, isNull, isNotNull } from 'drizzle-orm';

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

/**
 * One-time migration: prepend stored titles into note content as a heading block,
 * then clear the title field. This allows titles to be derived purely from content.
 * Safe to call multiple times — only affects notes with non-empty titles.
 */
export function migrateNoteTitlesToContent(): void {
  const db = getDb();
  const withTitles = db
    .select()
    .from(notes)
    .where(and(
      // SQLite: title != '' AND title IS NOT NULL
      // drizzle-orm doesn't have a neq('') helper, so we use a raw filter
      isNull(notes.deletedAt),
    ))
    .all()
    .filter((n) => n.title.length > 0);

  for (const note of withTitles) {
    let newContent: string;

    try {
      const blocks = JSON.parse(note.content);
      if (Array.isArray(blocks)) {
        // Prepend the title as a heading block into the BlockNote JSON
        const titleBlock = {
          id: crypto.randomUUID(),
          type: 'heading',
          props: {
            textColor: 'default',
            backgroundColor: 'default',
            textAlignment: 'left',
            level: 1,
          },
          content: [{ type: 'text', text: note.title, styles: {} }],
          children: [],
        };
        newContent = JSON.stringify([titleBlock, ...blocks]);
      } else {
        // Non-array JSON — prepend as markdown heading
        newContent = `# ${note.title}\n\n${note.content}`;
      }
    } catch {
      // Legacy markdown or plain text — prepend as heading
      const content = note.content.trim();
      newContent = content ? `# ${note.title}\n\n${content}` : `# ${note.title}`;
    }

    db.update(notes)
      .set({ title: '', content: newContent })
      .where(eq(notes.id, note.id))
      .run();
  }
}

export function createNote(): Note {
  const db = getDb();
  const now = new Date().toISOString();

  const [created] = db
    .insert(notes)
    .values({ title: '', content: '', status: 'active', updatedAt: now })
    .returning()
    .all();
  return created;
}

export function getNote(id: string): Note | undefined {
  const db = getDb();
  const [note] = db
    .select()
    .from(notes)
    .where(and(eq(notes.id, id), isNull(notes.deletedAt)))
    .all();
  return note;
}

export function saveNote(id: string, content: string): Note | undefined {
  const db = getDb();
  const now = new Date().toISOString();

  const [updated] = db
    .update(notes)
    .set({ content, updatedAt: now })
    .where(and(eq(notes.id, id), isNull(notes.deletedAt)))
    .returning()
    .all();
  return updated;
}

export function archiveNote(id: string): Note | undefined {
  const db = getDb();
  const [updated] = db
    .update(notes)
    .set({ status: 'archived', updatedAt: new Date().toISOString() })
    .where(and(eq(notes.id, id), isNull(notes.deletedAt)))
    .returning()
    .all();
  return updated;
}

export function restoreNote(id: string): Note | undefined {
  const db = getDb();
  const [updated] = db
    .update(notes)
    .set({ status: 'active', updatedAt: new Date().toISOString() })
    .where(and(eq(notes.id, id), isNull(notes.deletedAt)))
    .returning()
    .all();
  return updated;
}

export function deleteNote(id: string): void {
  const db = getDb();
  db
    .update(notes)
    .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .where(and(eq(notes.id, id), isNull(notes.deletedAt)))
    .run();
}

export function restoreFromTrash(id: string): Note | undefined {
  const db = getDb();
  const [updated] = db
    .update(notes)
    .set({ deletedAt: null, updatedAt: new Date().toISOString() })
    .where(and(eq(notes.id, id), isNotNull(notes.deletedAt)))
    .returning()
    .all();
  return updated;
}

export function pinNote(id: string): Note | undefined {
  const db = getDb();
  const [updated] = db
    .update(notes)
    .set({ isPinned: true })
    .where(and(eq(notes.id, id), isNull(notes.deletedAt)))
    .returning()
    .all();
  return updated;
}

export function unpinNote(id: string): Note | undefined {
  const db = getDb();
  const [updated] = db
    .update(notes)
    .set({ isPinned: false })
    .where(and(eq(notes.id, id), isNull(notes.deletedAt)))
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
      title: '',
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
        isNull(notes.deletedAt),
        eq(notes.status, 'active'),
        eq(notes.content, ''),
        lt(notes.createdAt, cutoff),
      ),
    )
    .run();

  const all = db
    .select()
    .from(notes)
    .where(isNull(notes.deletedAt))
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

export function purgeOldSoftDeletedNotes(maxAgeDays = 30): number {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);

  const purged = db
    .delete(notes)
    .where(and(isNotNull(notes.deletedAt), lt(notes.deletedAt, cutoff.toISOString())))
    .returning({ id: notes.id })
    .all();

  return purged.length;
}
