import { and, desc, eq, gte, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from '../db';
import { aiJournal, type AiJournal, type NewAiJournal } from '../db/schema';

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
  days_back: value.days_back ?? value.daysBack,
}));

export function writeJournalEntry(
  input: z.infer<typeof writeJournalEntrySchema>,
): AiJournal {
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
  input?: Partial<z.infer<typeof readJournalEntriesSchema>>,
): AiJournal[] {
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
