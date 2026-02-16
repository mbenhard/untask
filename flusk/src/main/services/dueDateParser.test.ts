import { describe, expect, it } from 'vitest';

import {
  formatDueDateDisplay,
  isDueDateOverdue,
  isDueDateWithinWindow,
  parseDueDate,
} from './dueDateParser';

describe('dueDateParser', () => {
  it('parses date-only due dates', () => {
    const parsed = parseDueDate('2026-02-17');

    expect(parsed).not.toBeNull();
    expect(parsed?.hasTime).toBe(false);
    expect(parsed?.dateStr).toBe('2026-02-17');
    expect(parsed?.timeStr).toBeNull();
  });

  it('parses date+time due dates', () => {
    const parsed = parseDueDate('2026-02-17T14:30');

    expect(parsed).not.toBeNull();
    expect(parsed?.hasTime).toBe(true);
    expect(parsed?.timeStr).toBe('14:30');
  });

  it('treats date-only as overdue after 9 AM on the due date', () => {
    // 9 AM local on 2026-02-17
    const nineAm = new Date('2026-02-17T09:00').getTime();
    const beforeNineAm = nineAm - 1;
    const afterNineAm = nineAm + 1;

    expect(isDueDateOverdue('2026-02-17', beforeNineAm)).toBe(false);
    expect(isDueDateOverdue('2026-02-17', nineAm)).toBe(true);
    expect(isDueDateOverdue('2026-02-17', afterNineAm)).toBe(true);
  });

  it('detects due dates within a window', () => {
    const from = Date.parse('2026-02-17T12:00:00.000Z');
    const to = Date.parse('2026-02-17T15:00:00.000Z');

    expect(isDueDateWithinWindow('2026-02-17T14:30', from, to)).toBe(true);
    expect(isDueDateWithinWindow('2026-02-17T18:30', from, to)).toBe(false);
  });

  it('formats date-only and date+time display values', () => {
    expect(formatDueDateDisplay('2026-02-17')).toBe('Feb 17');
    expect(formatDueDateDisplay('2026-02-17T14:30')).toContain('Feb 17');
  });
});
