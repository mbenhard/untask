import { eq, asc, inArray, sql, and, isNull } from 'drizzle-orm';
import { statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

import { getDb } from '../db';
import { attachments, tasks, type Attachment } from '../db/schema';

const ATTACHMENTS_DIR_NAME = 'attachments';

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
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.ts': 'text/typescript',
  '.md': 'text/markdown',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

export function detectMimeType(filename: string): string | null {
  const ext = path.extname(filename).toLowerCase();
  return EXT_TO_MIME[ext] ?? null;
}

function getFileSize(storedName: string): number {
  const filePath = path.join(getAttachmentsDir(), storedName);
  if (!existsSync(filePath)) return 0;
  return statSync(filePath).size;
}

export function getAttachmentsByTaskId(taskId: string): Attachment[] {
  const db = getDb();
  const rows = db
    .select({ attachment: attachments })
    .from(attachments)
    .innerJoin(tasks, eq(attachments.taskId, tasks.id))
    .where(and(eq(attachments.taskId, taskId), isNull(tasks.deletedAt)))
    .orderBy(asc(attachments.createdAt))
    .all();
  return rows.map((row) => row.attachment);
}

export function getAttachmentById(id: string): Attachment | null {
  const db = getDb();
  const [row] = db
    .select()
    .from(attachments)
    .where(eq(attachments.id, id))
    .all();
  return row ?? null;
}

export type CreateAttachmentInput = {
  taskId: string;
  storedName: string;
  originalName: string;
  size?: number;
  mimeType?: string | null;
};

export function createAttachment(input: CreateAttachmentInput): Attachment {
  const db = getDb();
  const size = input.size ?? getFileSize(input.storedName);
  const mimeType = input.mimeType ?? detectMimeType(input.originalName);

  const [created] = db
    .insert(attachments)
    .values({
      taskId: input.taskId,
      storedName: input.storedName,
      originalName: input.originalName,
      size,
      mimeType,
    })
    .returning()
    .all();

  return created;
}

export function deleteAttachmentRecord(id: string): void {
  const db = getDb();
  db.delete(attachments).where(eq(attachments.id, id)).run();
}

export function getAttachmentCountsByTaskIds(
  taskIds: string[],
): Map<string, number> {
  if (taskIds.length === 0) return new Map();

  const db = getDb();
  const rows = db
    .select({
      taskId: attachments.taskId,
      count: sql<number>`count(*)`.as('count'),
    })
    .from(attachments)
    .innerJoin(tasks, eq(attachments.taskId, tasks.id))
    .where(and(inArray(attachments.taskId, taskIds), isNull(tasks.deletedAt)))
    .groupBy(attachments.taskId)
    .all();

  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.taskId, row.count);
  }
  return counts;
}

export function checkAttachmentFileExists(storedName: string): boolean {
  const filePath = path.join(getAttachmentsDir(), storedName);
  return existsSync(filePath);
}
