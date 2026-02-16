import { describe, expect, it } from 'vitest';

import {
  getNextPriority,
  getNextStatusInCycle,
  getStatusAfterToggleComplete,
} from './taskInteraction';

describe('taskInteraction', () => {
  it('cycles priority through all levels', () => {
    expect(getNextPriority('none')).toBe('low');
    expect(getNextPriority('low')).toBe('medium');
    expect(getNextPriority('medium')).toBe('high');
    expect(getNextPriority('high')).toBe('none');
  });

  it('cycles status with waiting included', () => {
    expect(getNextStatusInCycle('inbox')).toBe('active');
    expect(getNextStatusInCycle('active')).toBe('in_progress');
    expect(getNextStatusInCycle('in_progress')).toBe('waiting');
    expect(getNextStatusInCycle('waiting')).toBe('done');
    expect(getNextStatusInCycle('done')).toBe('active');
  });

  it('reopens done tasks to active on toggle complete', () => {
    expect(getStatusAfterToggleComplete('done')).toBe('active');
    expect(getStatusAfterToggleComplete('active')).toBe('done');
    expect(getStatusAfterToggleComplete('waiting')).toBe('done');
  });
});
