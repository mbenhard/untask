import { describe, expect, it } from 'vitest';

import {
  resolveDateSelection,
  resolvePrecisionChange,
} from './TaskDueDatePicker';

const DATE = new Date(2026, 1, 20);

describe('TaskDueDatePicker logic', () => {
  it('closes and clears when date selection is removed', () => {
    expect(
      resolveDateSelection({
        date: undefined,
        precision: 'date',
        currentTime: null,
      }),
    ).toEqual({
      nextDueDate: null,
      closePopover: true,
      focusTimeInput: false,
    });
  });

  it('uses date-only precision and closes popover after selection', () => {
    expect(
      resolveDateSelection({
        date: DATE,
        precision: 'date',
        currentTime: '13:45',
      }),
    ).toEqual({
      nextDueDate: '2026-02-20',
      closePopover: true,
      focusTimeInput: false,
    });
  });

  it('keeps popover open in date-time precision and focuses time input', () => {
    expect(
      resolveDateSelection({
        date: DATE,
        precision: 'date-time',
        currentTime: null,
      }),
    ).toEqual({
      nextDueDate: '2026-02-20',
      closePopover: false,
      focusTimeInput: true,
    });

    expect(
      resolveDateSelection({
        date: DATE,
        precision: 'date-time',
        currentTime: '13:45',
      }),
    ).toEqual({
      nextDueDate: '2026-02-20T13:45',
      closePopover: false,
      focusTimeInput: true,
    });
  });

  it('drops existing time when switching to date-only precision', () => {
    expect(
      resolvePrecisionChange({
        precision: 'date',
        selectedDate: DATE,
        currentTime: '08:30',
      }),
    ).toEqual({
      nextDueDate: '2026-02-20',
      focusTimeInput: false,
    });
  });

  it('focuses time input when switching to date-time precision', () => {
    expect(
      resolvePrecisionChange({
        precision: 'date-time',
        selectedDate: DATE,
        currentTime: null,
      }),
    ).toEqual({
      nextDueDate: null,
      focusTimeInput: true,
    });
  });
});
