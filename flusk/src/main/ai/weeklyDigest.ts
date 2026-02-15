import type { AiJournal } from '../db/schema';
import { readJournalEntries, writeJournalEntry } from '../services/journalService';
import { getSetting, setSetting } from '../services/settingsService';

export const WEEKLY_DIGEST_LAST_GENERATED_AT_KEY =
  'ai_weekly_digest_last_generated_at';

type WeeklyDigestStatus =
  | 'generated'
  | 'skipped_not_monday'
  | 'skipped_already_generated_this_week';

export type WeeklyDigestResult = {
  status: WeeklyDigestStatus;
  createdEntryId?: string;
  summary?: string;
};

const startOfMondayWeek = (date: Date): Date => {
  const local = new Date(date);
  const day = local.getDay();
  const dayOffset = day === 0 ? -6 : 1 - day;
  local.setHours(0, 0, 0, 0);
  local.setDate(local.getDate() + dayOffset);
  return local;
};

const isMonday = (date: Date): boolean => date.getDay() === 1;

const isSameMondayWeek = (left: Date, right: Date): boolean =>
  startOfMondayWeek(left).getTime() === startOfMondayWeek(right).getTime();

const isCurrentWeekDigest = (value: string | null, now: Date): boolean => {
  if (!value) {
    return false;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return isSameMondayWeek(parsed, now);
};

const formatWeekWindow = (now: Date): string => {
  const weekStart = startOfMondayWeek(now);
  const previousWeekStart = new Date(weekStart);
  previousWeekStart.setDate(previousWeekStart.getDate() - 7);
  const previousWeekEnd = new Date(weekStart);
  previousWeekEnd.setDate(previousWeekEnd.getDate() - 1);

  return `${previousWeekStart.toISOString().slice(0, 10)} to ${previousWeekEnd.toISOString().slice(0, 10)}`;
};

const categoryCounts = (entries: AiJournal[]): Record<AiJournal['category'], number> => ({
  pattern: entries.filter((entry) => entry.category === 'pattern').length,
  progress: entries.filter((entry) => entry.category === 'progress').length,
  preference: entries.filter((entry) => entry.category === 'preference').length,
  summary: entries.filter((entry) => entry.category === 'summary').length,
});

const buildWeeklySummary = (entries: AiJournal[], now: Date): string => {
  const counts = categoryCounts(entries);
  const highlights = entries
    .filter((entry) => entry.category !== 'summary')
    .slice(0, 5)
    .map((entry) => `- [${entry.category}] ${entry.content.trim()}`);

  const lines = [
    `Weekly memory digest (${formatWeekWindow(now)})`,
    '',
    `Journal activity totals: progress ${counts.progress}, pattern ${counts.pattern}, preference ${counts.preference}.`,
    '',
    'Top highlights:',
    ...(highlights.length > 0 ? highlights : ['- No qualifying highlights captured in the past 7 days.']),
  ];

  return lines.join('\n');
};

export const checkAndGenerateWeeklyDigest = (
  options?: { now?: Date; force?: boolean },
): WeeklyDigestResult => {
  const now = options?.now ?? new Date();
  const force = options?.force === true;

  if (!force && !isMonday(now)) {
    return { status: 'skipped_not_monday' };
  }

  const lastGeneratedAt = getSetting(WEEKLY_DIGEST_LAST_GENERATED_AT_KEY);
  if (!force && isCurrentWeekDigest(lastGeneratedAt, now)) {
    return { status: 'skipped_already_generated_this_week' };
  }

  const entries = readJournalEntries({
    limit: 50,
    days_back: 7,
  });
  const summary = buildWeeklySummary(entries, now);
  const digestEntry = writeJournalEntry({
    category: 'summary',
    content: summary,
  });
  setSetting(WEEKLY_DIGEST_LAST_GENERATED_AT_KEY, now.toISOString());

  return {
    status: 'generated',
    createdEntryId: digestEntry.id,
    summary,
  };
};
