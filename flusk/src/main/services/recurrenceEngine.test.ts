import { describe, expect, it } from 'vitest';

import { calculateNextOccurrence } from './recurrenceEngine';

describe('recurrenceEngine', () => {
  it('calculates simple monthly recurrence', () => {
    const result = calculateNextOccurrence('monthly', '2026-02-17');
    expect(result?.nextDate).toBe('2026-03-17');
  });

  it('preserves time component for timed recurrences', () => {
    const result = calculateNextOccurrence('weekly', '2026-02-17T14:30');
    expect(result?.nextDate).toBe('2026-02-24T14:30');
  });

  it('supports weekday aliases', () => {
    const result = calculateNextOccurrence('every mon', '2026-02-17'); // Tuesday
    expect(result?.nextDate).toBe('2026-02-23');
  });

  it('returns null for unknown recurrence rules', () => {
    expect(calculateNextOccurrence('whenever', '2026-02-17')).toBeNull();
  });
});
