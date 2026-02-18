/**
 * Recurrence engine — parses human-readable recurrence rules and calculates
 * the next occurrence date. Used by completeTask() to auto-create the next
 * instance of a recurring task.
 */

// ─── Types ──────────────────────────────────────────────────

export type RecurrenceResult = {
  nextDate: string; // ISO date string "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm"
};

// ─── Day name mapping ───────────────────────────────────────

const DAY_NAMES: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

// ─── Helpers ────────────────────────────────────────────────

const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const addMonths = (date: Date, months: number): Date => {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
};

const nextWeekday = (from: Date, targetDay: number): Date => {
  const current = from.getDay();
  const daysUntil = (targetDay - current + 7) % 7 || 7;
  return addDays(from, daysUntil);
};

const formatDate = (date: Date, includeTime: boolean): string => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');

  if (!includeTime) return `${yyyy}-${mm}-${dd}`;

  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
};

// ─── Parser ─────────────────────────────────────────────────

/**
 * Calculate the next occurrence from a human-readable recurrence rule.
 *
 * Supported formats:
 * - "daily"
 * - "weekly"
 * - "monthly"
 * - "quarterly"
 * - "yearly" / "annually"
 * - "every monday" / "every tuesday" etc.
 * - "every 2 weeks" / "every 3 days" / "every 2 months"
 * - "every weekday" / "every workday"
 *
 * @param rule - Human-readable recurrence string
 * @param fromDate - The reference date (typically the completed task's dueDate or now)
 * @returns The next occurrence, or null if the rule is unrecognized
 */
export const calculateNextOccurrence = (
  rule: string,
  fromDate: string,
): RecurrenceResult | null => {
  const normalized = rule.trim().toLowerCase();
  if (!normalized) return null;

  const hasTime = fromDate.includes('T');
  const from = new Date(fromDate);
  if (Number.isNaN(from.getTime())) return null;

  // ─── Simple keywords ──────────────────────────────────
  if (normalized === 'daily') {
    return { nextDate: formatDate(addDays(from, 1), hasTime) };
  }

  if (normalized === 'weekly') {
    return { nextDate: formatDate(addDays(from, 7), hasTime) };
  }

  if (normalized === 'monthly') {
    return { nextDate: formatDate(addMonths(from, 1), hasTime) };
  }

  if (normalized === 'quarterly') {
    return { nextDate: formatDate(addMonths(from, 3), hasTime) };
  }

  if (normalized === 'yearly' || normalized === 'annually') {
    return { nextDate: formatDate(addMonths(from, 12), hasTime) };
  }

  // ─── "every <day>" ────────────────────────────────────
  const everyDayMatch = normalized.match(/^every\s+(\w+)$/);
  if (everyDayMatch) {
    const dayName = everyDayMatch[1];

    if (dayName === 'weekday' || dayName === 'workday') {
      let next = addDays(from, 1);
      while (next.getDay() === 0 || next.getDay() === 6) {
        next = addDays(next, 1);
      }
      return { nextDate: formatDate(next, hasTime) };
    }

    const targetDay = DAY_NAMES[dayName];
    if (targetDay !== undefined) {
      return { nextDate: formatDate(nextWeekday(from, targetDay), hasTime) };
    }
  }

  // ─── "every N <unit>" ─────────────────────────────────
  const everyNMatch = normalized.match(/^every\s+(\d+)\s+(\w+)$/);
  if (everyNMatch) {
    const n = parseInt(everyNMatch[1], 10);
    const unit = everyNMatch[2];

    if (unit === 'day' || unit === 'days') {
      return { nextDate: formatDate(addDays(from, n), hasTime) };
    }

    if (unit === 'week' || unit === 'weeks') {
      return { nextDate: formatDate(addDays(from, n * 7), hasTime) };
    }

    if (unit === 'month' || unit === 'months') {
      return { nextDate: formatDate(addMonths(from, n), hasTime) };
    }
  }

  // Unrecognized rule
  return null;
};
