import { app, shell } from 'electron';
import { existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const ATTACHMENTS_DIR_NAME = 'attachments';
const TRASH_DIR_NAME = '.trash';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getAttachmentsDir(): string {
  return path.join(app.getPath('userData'), ATTACHMENTS_DIR_NAME);
}

function getTrashDir(): string {
  return path.join(getAttachmentsDir(), TRASH_DIR_NAME);
}

function ensureAttachmentsDir(): void {
  const dir = getAttachmentsDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function ensureTrashDir(): void {
  const dir = getTrashDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function resolveAttachmentPath(id: string): string {
  const basename = path.basename(id);
  return path.join(getAttachmentsDir(), basename);
}

export async function saveAttachment(request: {
  data: Uint8Array;
  filename: string;
}): Promise<string> {
  if (request.data.byteLength > MAX_FILE_SIZE) {
    throw new Error('File exceeds 50MB limit.');
  }

  ensureAttachmentsDir();

  const ext = path.extname(request.filename) || '';
  const uuid = randomUUID();
  const storedName = `${uuid}${ext}`;
  const filePath = path.join(getAttachmentsDir(), storedName);

  await writeFile(filePath, Buffer.from(request.data));

  return `untask-file://${storedName}`;
}

export async function openAttachment(request: { id: string }): Promise<void> {
  const filePath = resolveAttachmentPath(request.id);

  if (!existsSync(filePath)) {
    throw new Error('File not found — it may have been moved or deleted.');
  }

  await shell.openPath(filePath);
}

export function revealAttachment(request: { id: string }): void {
  const filePath = resolveAttachmentPath(request.id);

  if (!existsSync(filePath)) {
    throw new Error('File not found — it may have been moved or deleted.');
  }

  shell.showItemInFolder(filePath);
}

export async function deleteAttachment(request: { id: string }): Promise<void> {
  const filePath = resolveAttachmentPath(request.id);

  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}

export async function readAttachment(request: { id: string }): Promise<string> {
  const filePath = resolveAttachmentPath(request.id);

  if (!existsSync(filePath)) {
    throw new Error('File not found — it may have been moved or deleted.');
  }

  const data = await readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();

  let mime = 'application/octet-stream';
  if (ext === '.png') mime = 'image/png';
  else if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg';
  else if (ext === '.gif') mime = 'image/gif';
  else if (ext === '.webp') mime = 'image/webp';
  else if (ext === '.svg') mime = 'image/svg+xml';

  return `data:${mime};base64,${data.toString('base64')}`;
}

/**
 * Remove orphaned attachment files.
 * @param referencedIds Set of filenames (e.g. "uuid.png") currently referenced in task/note content
 */
export function cleanupOrphanedAttachments(referencedIds: Set<string>): void {
  const dir = getAttachmentsDir();
  if (!existsSync(dir)) return;

  const now = Date.now();
  ensureTrashDir();

  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name.startsWith('.')) continue; // skip hidden/.trash

    if (referencedIds.has(entry.name)) continue;

    const filePath = path.join(dir, entry.name);
    const stat = statSync(filePath);
    const age = now - stat.mtimeMs;

    // Grace period: never touch files younger than 7 days
    if (age < GRACE_PERIOD_MS) continue;

    // Soft delete: move to .trash
    const trashPath = path.join(getTrashDir(), entry.name);
    renameSync(filePath, trashPath);
  }

  // Purge old trash
  const trashDir = getTrashDir();
  if (!existsSync(trashDir)) return;

  const trashEntries = readdirSync(trashDir, { withFileTypes: true });

  for (const entry of trashEntries) {
    if (!entry.isFile()) continue;

    const filePath = path.join(trashDir, entry.name);
    const stat = statSync(filePath);
    const age = now - stat.mtimeMs;

    if (age >= TRASH_RETENTION_MS) {
      unlinkSync(filePath);
    }
  }
}
