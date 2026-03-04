/**
 * Post-SQL data migration: Extract image/file blocks from task bodies
 * into the new `attachments` table.
 *
 * Runs once after the 0013 SQL migration creates the table.
 * Idempotent: tracked via a settings key so it never runs twice.
 */
import { eq, isNotNull } from 'drizzle-orm';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

import { getDb } from './index';
import { tasks, attachments, settings } from './schema';

const MIGRATION_KEY = 'migration.attachments_extracted';
const ATTACHMENTS_DIR_NAME = 'attachments';

type BlockNoteBlock = {
  type?: string;
  props?: { url?: string; name?: string };
  children?: BlockNoteBlock[];
  content?: unknown[];
};

function getAttachmentsDir(): string {
  return path.join(app.getPath('userData'), ATTACHMENTS_DIR_NAME);
}

const EXT_TO_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.gz': 'application/gzip',
  '.tar': 'application/x-tar',
  '.7z': 'application/x-7z-compressed',
  '.rar': 'application/vnd.rar',
};

function detectMimeType(filename: string): string | null {
  const ext = path.extname(filename).toLowerCase();
  return EXT_TO_MIME[ext] ?? null;
}

function getFileSize(storedName: string): number {
  const filePath = path.join(getAttachmentsDir(), storedName);
  if (!existsSync(filePath)) return 0;
  try {
    return statSync(filePath).size;
  } catch {
    return 0;
  }
}

function isFileOrImageBlock(block: BlockNoteBlock): boolean {
  return block.type === 'image' || block.type === 'file';
}

function extractStoredName(url: string): string | null {
  if (!url.startsWith('untask-file://')) return null;
  return url.replace('untask-file://', '');
}

function isBodyEmpty(blocks: BlockNoteBlock[]): boolean {
  if (blocks.length === 0) return true;

  return blocks.every((block) => {
    // Paragraph with no content is empty
    if (block.type === 'paragraph') {
      const content = block.content;
      if (!content || !Array.isArray(content) || content.length === 0) return true;
      // Check if all inline content is empty text
      return content.every((item) => {
        if (!item || typeof item !== 'object') return false;
        const candidate = item as { type?: unknown; text?: unknown };
        return candidate.type === 'text'
          && (typeof candidate.text !== 'string' || candidate.text.trim() === '');
      });
    }
    return false;
  });
}

export function runAttachmentMigration(): void {
  const db = getDb();

  // Check if already run
  const [existing] = db
    .select()
    .from(settings)
    .where(eq(settings.key, MIGRATION_KEY))
    .all();

  if (existing) return;

  // Find all tasks with non-null body
  const tasksWithBody = db
    .select({ id: tasks.id, body: tasks.body })
    .from(tasks)
    .where(isNotNull(tasks.body))
    .all();

  let migratedCount = 0;
  let errorCount = 0;

  for (const task of tasksWithBody) {
    try {
      migrateTaskBody(db, task.id, task.body!);
      migratedCount++;
    } catch (err) {
      errorCount++;
      console.error(`[attachment-migration] Error migrating task ${task.id}:`, err);
    }
  }

  // Mark migration as complete
  db.insert(settings)
    .values({ key: MIGRATION_KEY, value: new Date().toISOString() })
    .run();

  if (migratedCount > 0 || errorCount > 0) {
    console.log(
      `[attachment-migration] Complete: ${migratedCount} tasks processed, ${errorCount} errors`,
    );
  }
}

function migrateTaskBody(
  db: ReturnType<typeof getDb>,
  taskId: string,
  body: string,
): void {
  let blocks: BlockNoteBlock[];
  try {
    blocks = JSON.parse(body);
  } catch {
    return; // Not valid JSON, skip
  }

  if (!Array.isArray(blocks)) return;

  const fileBlocks = blocks.filter(isFileOrImageBlock);
  if (fileBlocks.length === 0) return;

  // Run per-task in a transaction
  db.transaction((tx) => {
    // Create attachment records for each file/image block
    for (const block of fileBlocks) {
      const url = block.props?.url;
      if (!url) continue;

      const storedName = extractStoredName(url);
      if (!storedName) continue;

      // Check if this attachment already exists in the table (idempotency)
      const [existingAttachment] = tx
        .select({ id: attachments.id })
        .from(attachments)
        .where(eq(attachments.storedName, storedName))
        .all();

      if (existingAttachment) continue;

      const size = getFileSize(storedName);
      const mimeType = detectMimeType(storedName);

      // Original name is unrecoverable — use stored name
      const originalName = storedName;

      tx.insert(attachments)
        .values({
          taskId,
          storedName,
          originalName,
          size,
          mimeType,
        })
        .run();
    }

    // Remove file/image blocks from body
    const remainingBlocks = blocks.filter((b) => !isFileOrImageBlock(b));

    if (isBodyEmpty(remainingBlocks)) {
      tx.update(tasks)
        .set({ body: null })
        .where(eq(tasks.id, taskId))
        .run();
    } else {
      tx.update(tasks)
        .set({ body: JSON.stringify(remainingBlocks) })
        .where(eq(tasks.id, taskId))
        .run();
    }
  });
}
