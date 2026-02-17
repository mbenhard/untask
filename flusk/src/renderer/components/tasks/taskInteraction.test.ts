import { describe, expect, it } from 'vitest';

import type { PredefinedStatusId } from '../../../types/models';
import {
  getNextPriority,
  getNextStatusInCycle,
  getStatusAfterToggleComplete,
} from './taskInteraction';

const DEFAULT_ENABLED_NON_TERMINAL: PredefinedStatusId[] = [
  'active',
  'in_progress',
  'waiting',
];

describe('taskInteraction', () => {
  it('cycles priority through all levels', () => {
    expect(getNextPriority('none')).toBe('low');
    expect(getNextPriority('low')).toBe('medium');
    expect(getNextPriority('medium')).toBe('high');
    expect(getNextPriority('high')).toBe('none');
  });

  it('cycles status through enabled non-terminal statuses', () => {
    expect(getNextStatusInCycle('inbox', DEFAULT_ENABLED_NON_TERMINAL)).toBe('active');
    expect(getNextStatusInCycle('active', DEFAULT_ENABLED_NON_TERMINAL)).toBe('in_progress');
    expect(getNextStatusInCycle('in_progress', DEFAULT_ENABLED_NON_TERMINAL)).toBe('waiting');
    expect(getNextStatusInCycle('waiting', DEFAULT_ENABLED_NON_TERMINAL)).toBe('active');
    expect(getNextStatusInCycle('done', DEFAULT_ENABLED_NON_TERMINAL)).toBe('active');
  });

  it('cycles status with review enabled', () => {
    const withReview: PredefinedStatusId[] = [
      'active',
      'in_progress',
      'waiting',
      'review',
    ];
    expect(getNextStatusInCycle('waiting', withReview)).toBe('review');
    expect(getNextStatusInCycle('review', withReview)).toBe('active');
  });

  it('reopens done tasks to first enabled non-terminal on toggle complete', () => {
    expect(getStatusAfterToggleComplete('done', 'active')).toBe('active');
    expect(getStatusAfterToggleComplete('active', 'active')).toBe('done');
    expect(getStatusAfterToggleComplete('waiting', 'active')).toBe('done');
  });
});
