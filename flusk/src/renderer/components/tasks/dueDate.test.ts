import { describe, expect, it } from 'vitest';

import { formatDueDateDisplay, parseDueDate, toISODate } from './dueDate';

describe('dueDate utils', () => {
  it('formats valid ISO dates as DD.MM.YY', () => {
    expect(formatDueDateDisplay('2026-02-05')).toBe('05.02.26');
    expect(formatDueDateDisplay('2026-02-05T12:00:00Z')).toBe('05.02.26');
  });

  it('falls back to original input for invalid date strings', () => {
    expect(formatDueDateDisplay('2026-02-31')).toBe('2026-02-31');
    expect(formatDueDateDisplay('not-a-date')).toBe('not-a-date');
  });

  it('parses valid due dates and rejects invalid values', () => {
    const parsed = parseDueDate('2026-08-09');
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(7);
    expect(parsed?.getDate()).toBe(9);

    const parsedWithTime = parseDueDate('2026-08-09T18:30:00Z');
    expect(parsedWithTime).toBeInstanceOf(Date);
    expect(parsedWithTime?.getFullYear()).toBe(2026);
    expect(parsedWithTime?.getMonth()).toBe(7);
    expect(parsedWithTime?.getDate()).toBe(9);

    expect(parseDueDate('2026-02-31')).toBeUndefined();
    expect(parseDueDate('invalid')).toBeUndefined();
    expect(parseDueDate(null)).toBeUndefined();
    expect(parseDueDate(undefined)).toBeUndefined();
  });

  it('serializes Date to ISO date', () => {
    const value = toISODate(new Date(2026, 10, 3));
    expect(value).toBe('2026-11-03');
  });
});
