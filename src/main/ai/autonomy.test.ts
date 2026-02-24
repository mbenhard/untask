import { describe, expect, it } from 'vitest';

import { classifyRisk, evaluateGate, isMutationTool } from './autonomy';

describe('autonomy risk classification', () => {
  it('classifies edit_note rewrite as high risk', () => {
    expect(
      classifyRisk({
        toolName: 'edit_note',
        input: { action: 'rewrite' },
      }),
    ).toBe('high');
  });

  it('classifies non-rewrite note edits as low risk', () => {
    expect(
      classifyRisk({
        toolName: 'edit_note',
        input: { action: 'replace' },
      }),
    ).toBe('low');
    expect(
      classifyRisk({
        toolName: 'edit_note',
        input: { action: 'append' },
      }),
    ).toBe('low');
  });

  it('classifies delete_task as critical via hard override', () => {
    expect(
      classifyRisk({
        toolName: 'delete_task',
        input: { id: 'task-1' },
      }),
    ).toBe('critical');
  });
});

describe('evaluateGate', () => {
  it('auto-executes in auto mode', () => {
    expect(evaluateGate('auto', 'low', false).action).toBe('execute');
  });

  it('blocks in confirm mode', () => {
    expect(evaluateGate('confirm', 'low', false).action).toBe('pending');
  });

  it('blocks hard override in auto mode', () => {
    expect(evaluateGate('auto', 'critical', true).action).toBe('pending');
  });

  it('blocks hard override in confirm mode', () => {
    expect(evaluateGate('confirm', 'critical', true).action).toBe('pending');
  });
});

describe('isMutationTool', () => {
  it('treats read_note as non-mutation', () => {
    expect(isMutationTool('read_note')).toBe(false);
  });

  it('treats edit_note as mutation', () => {
    expect(isMutationTool('edit_note')).toBe(true);
  });
});
