import { and, desc, eq, gte, isNull, lte, like, lt, or, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from '../db';
import {
  aiJournal,
  aiJournalArchive,
  type AiJournal,
  type NewAiJournal,
} from '../db/schema';

const JOURNAL_RETENTION_DAYS = 90;
const JOURNAL_ARCHIVE_SWEEP_INTERVAL_MS = 15 * 60 * 1000;
let lastArchiveSweepAt = 0;

const retentionCutoffIso = (nowMs = Date.now()): string =>
  new Date(nowMs - JOURNAL_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

const archiveOldJournalEntries = (): number => {
  const db = getDb();
  const cutoff = retentionCutoffIso();
  const staleWhere = or(lt(aiJournal.createdAt, cutoff), isNull(aiJournal.createdAt));
  const staleEntries = db
    .select()
    .from(aiJournal)
    .where(staleWhere)
    .all();

  if (staleEntries.length === 0) {
    return 0;
  }

  const archivedAt = new Date().toISOString();
  db.transaction((tx): void => {
    for (const entry of staleEntries) {
      tx.insert(aiJournalArchive)
        .values({
          id: entry.id,
          content: entry.content,
          category: entry.category,
          createdAt: entry.createdAt ?? archivedAt,
          archivedAt,
        })
        .onConflictDoNothing()
        .run();
    }

    tx.delete(aiJournal).where(staleWhere).run();
  });

  return staleEntries.length;
};

const maybeArchiveJournal = (): void => {
  const now = Date.now();
  if (now - lastArchiveSweepAt < JOURNAL_ARCHIVE_SWEEP_INTERVAL_MS) {
    return;
  }

  archiveOldJournalEntries();
  lastArchiveSweepAt = now;
};

export const writeJournalEntrySchema = z.object({
  content: z.string().trim().min(1),
  category: z.enum(['pattern', 'progress', 'preference', 'summary']).default('summary'),
});

export const readJournalEntriesSchema = z.object({
  category: z.enum(['pattern', 'progress', 'preference', 'summary']).optional(),
  limit: z.number().int().min(1).max(50).default(10),
  days_back: z.number().int().min(1).max(90).optional(),
  daysBack: z.number().int().min(1).max(90).optional(),
}).transform((value) => ({
  category: value.category,
  limit: value.limit,
  days_back: value.days_back ?? value.daysBack ?? JOURNAL_RETENTION_DAYS,
}));

export function writeJournalEntry(
  input: z.infer<typeof writeJournalEntrySchema>,
): AiJournal {
  maybeArchiveJournal();
  const validated = writeJournalEntrySchema.parse(input);
  const db = getDb();

  const [created] = db
    .insert(aiJournal)
    .values(validated as NewAiJournal)
    .returning()
    .all();

  return created;
}

export function readJournalEntries(
  input?: Partial<z.input<typeof readJournalEntriesSchema>>,
): AiJournal[] {
  maybeArchiveJournal();
  const validated = readJournalEntriesSchema.parse({
    limit: input?.limit,
    category: input?.category,
    days_back: input?.days_back,
    daysBack: input?.daysBack,
  });
  const db = getDb();
  const whereClauses: SQL<unknown>[] = [];

  if (validated.category) {
    whereClauses.push(eq(aiJournal.category, validated.category));
  }

  if (typeof validated.days_back === 'number') {
    const since = new Date(Date.now() - validated.days_back * 24 * 60 * 60 * 1000);
    whereClauses.push(gte(aiJournal.createdAt, since.toISOString()));
  }

  const where =
    whereClauses.length === 0
      ? undefined
      : whereClauses.length === 1
        ? whereClauses[0]
        : and(...whereClauses);

  return db
    .select()
    .from(aiJournal)
    .where(where)
    .orderBy(desc(aiJournal.createdAt))
    .limit(validated.limit)
    .all();
}

export function searchJournalEntries(input: {
  query: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}): AiJournal[] {
  maybeArchiveJournal();
  const db = getDb();
  const limit = input.limit && input.limit > 0 ? Math.min(input.limit, 50) : 20;
  const whereClauses: SQL<unknown>[] = [];

  // Keyword search via LIKE (case-insensitive in SQLite by default for ASCII)
  const term = input.query.trim();
  if (term.length > 0) {
    whereClauses.push(like(aiJournal.content, `%${term}%`));
  }

  if (input.fromDate) {
    whereClauses.push(gte(aiJournal.createdAt, input.fromDate));
  }

  if (input.toDate) {
    whereClauses.push(lte(aiJournal.createdAt, input.toDate));
  }

  const where =
    whereClauses.length === 0
      ? undefined
      : whereClauses.length === 1
        ? whereClauses[0]
        : and(...whereClauses);

  const activeEntries = db
    .select()
    .from(aiJournal)
    .where(where)
    .orderBy(desc(aiJournal.createdAt))
    .limit(limit)
    .all();

  const cutoff = retentionCutoffIso();
  const includeArchive = Boolean(input.fromDate && input.fromDate < cutoff);
  if (!includeArchive) {
    return activeEntries;
  }

  const archiveWhereClauses: SQL<unknown>[] = [];
  if (term.length > 0) {
    archiveWhereClauses.push(like(aiJournalArchive.content, `%${term}%`));
  }
  if (input.fromDate) {
    archiveWhereClauses.push(gte(aiJournalArchive.createdAt, input.fromDate));
  }
  if (input.toDate) {
    archiveWhereClauses.push(lte(aiJournalArchive.createdAt, input.toDate));
  }

  const archiveWhere =
    archiveWhereClauses.length === 0
      ? undefined
      : archiveWhereClauses.length === 1
        ? archiveWhereClauses[0]
        : and(...archiveWhereClauses);

  const archiveEntries: AiJournal[] = db
    .select()
    .from(aiJournalArchive)
    .where(archiveWhere)
    .orderBy(desc(aiJournalArchive.createdAt))
    .limit(limit)
    .all()
    .map((entry) => ({
      id: entry.id,
      content: entry.content,
      category: entry.category,
      createdAt: entry.createdAt,
    }));

  return [...activeEntries, ...archiveEntries]
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    .slice(0, limit);
}
