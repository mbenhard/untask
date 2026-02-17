import { describe, expect, it } from 'vitest';

import { formatDueDateDisplay, parseDueDate, parseDueTime, toISODateTime } from './dueDate';

describe('TaskDueDatePicker helpers', () => {
  it('parseDueDate returns a Date for valid ISO date', () => {
    const date = parseDueDate('2026-02-20');
    expect(date).toBeInstanceOf(Date);
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(1); // 0-indexed
    expect(date?.getDate()).toBe(20);
  });

  it('parseDueDate returns undefined for null/invalid', () => {
    expect(parseDueDate(null)).toBeUndefined();
    expect(parseDueDate('')).toBeUndefined();
    expect(parseDueDate('not-a-date')).toBeUndefined();
  });

  it('parseDueTime extracts HH:MM from ISO datetime', () => {
    expect(parseDueTime('2026-02-20T13:45')).toBe('13:45');
    expect(parseDueTime('2026-02-20')).toBeNull();
    expect(parseDueTime(null)).toBeNull();
  });

  it('toISODateTime combines date and optional time', () => {
    const date = new Date(2026, 1, 20);
    expect(toISODateTime(date, null)).toBe('2026-02-20');
    expect(toISODateTime(date, '13:45')).toBe('2026-02-20T13:45');
  });

  it('formatDueDateDisplay formats correctly', () => {
    expect(formatDueDateDisplay('2026-02-20')).toBe('20.02.26');
    expect(formatDueDateDisplay('2026-02-20T13:45')).toBe('20.02.26 13:45');
  });
});
