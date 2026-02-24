/**
 * Due date parsing utilities.
 *
 * Supports two formats:
 * - Date-only: "2026-02-17"
 * - Date + time: "2026-02-17T14:30"
 */

export type ParsedDueDate = {
  /** Raw ISO date string (date-only or date+time) */
  raw: string;
  /** Millisecond timestamp */
  ms: number;
  /** Whether the dueDate includes a time component */
  hasTime: boolean;
  /** Date portion "YYYY-MM-DD" */
  dateStr: string;
  /** Time portion "HH:mm" or null if date-only */
  timeStr: string | null;
};

/**
 * Parse a dueDate string into its components.
 * Returns null if the value is empty or unparseable.
 */
export const parseDueDate = (value: string | null | undefined): ParsedDueDate | null => {
  if (!value) return null;

  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;

  const hasTime = value.includes('T');
  const dateStr = value.slice(0, 10);
  const timeStr = hasTime ? value.slice(11, 16) : null;

  return { raw: value, ms, hasTime, dateStr, timeStr };
};

/**
 * Resolve the effective target time in ms for a due date.
 * Date-only → 9 AM local. Date+time → exact time.
 * Returns null if the value is empty or unparseable.
 */
export const resolveDueDateTargetMs = (
  value: string | null | undefined,
): number | null => {
  const parsed = parseDueDate(value);
  if (!parsed) return null;
  return parsed.hasTime
    ? parsed.ms
    : new Date(parsed.dateStr + 'T09:00').getTime();
};

/**
 * Check if a dueDate is overdue relative to the given timestamp.
 * For date-only dueDates, overdue after 9 AM on the due date
 * (matching the notification trigger time).
 * For date+time dueDates, overdue after the exact time.
 *
 * NOTE: This logic is duplicated in renderer/components/tasks/dueDate.ts
 * due to Electron process boundary. Keep both in sync.
 */
export const isDueDateOverdue = (
  value: string | null | undefined,
  nowMs: number,
): boolean => {
  const targetMs = resolveDueDateTargetMs(value);
  if (targetMs === null) return false;
  return targetMs <= nowMs;
};

/**
 * Check if a dueDate falls within a time window.
 */
export const isDueDateWithinWindow = (
  value: string | null | undefined,
  fromMs: number,
  toMs: number,
): boolean => {
  const parsed = parseDueDate(value);
  if (!parsed) return false;
  return parsed.ms >= fromMs && parsed.ms <= toMs;
};

/**
 * Format a parsed dueDate for display.
 * Returns "Feb 17" for date-only, "Feb 17, 2:30 PM" for date+time.
 */
export const formatDueDateDisplay = (
  value: string | null | undefined,
): string | null => {
  const parsed = parseDueDate(value);
  if (!parsed) return null;

  const date = new Date(parsed.ms);
  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getDate();

  if (!parsed.hasTime) {
    return `${month} ${day}`;
  }

  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;

  return `${month} ${day}, ${displayHour}:${minutes} ${ampm}`;
};
