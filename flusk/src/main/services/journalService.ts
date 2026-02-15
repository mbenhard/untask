import { desc, eq } from 'drizzle-orm';
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
});

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
  });
  const db = getDb();

  return db
    .select()
    .from(aiJournal)
    .where(validated.category ? eq(aiJournal.category, validated.category) : undefined)
    .orderBy(desc(aiJournal.createdAt))
    .limit(validated.limit)
    .all();
}
