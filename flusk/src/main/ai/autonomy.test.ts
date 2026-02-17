import { describe, expect, it } from 'vitest';

import { classifyRisk, evaluateGate, isMutationTool } from './autonomy';

describe('autonomy note risk mapping', () => {
  it('classifies rewrite as high risk', () => {
    expect(
      classifyRisk({
        toolName: 'edit_note',
        input: { action: 'rewrite' },
      }),
    ).toBe('high');
  });

  it('classifies replace as medium risk', () => {
    expect(
      classifyRisk({
        toolName: 'edit_note',
        input: { action: 'replace' },
      }),
    ).toBe('medium');
  });

  it('classifies append as low risk', () => {
    expect(
      classifyRisk({
        toolName: 'edit_note',
        input: { action: 'append' },
      }),
    ).toBe('low');
  });

  it('auto-executes rewrite in autopilot mode', () => {
    const risk = classifyRisk({
      toolName: 'edit_note',
      input: { action: 'rewrite' },
    });
    expect(evaluateGate('autopilot', risk, false).action).toBe('execute');
  });
});

describe('evaluateGate autopilot full trust', () => {
  it('auto-executes critical risk in autopilot', () => {
    expect(evaluateGate('autopilot', 'critical', false).action).toBe('execute');
  });

  it('auto-executes high risk in autopilot', () => {
    expect(evaluateGate('autopilot', 'high', false).action).toBe('execute');
  });

  it('still blocks hard override in autopilot', () => {
    expect(evaluateGate('autopilot', 'critical', true).action).toBe('pending');
  });

  it('still blocks hard override in safe mode', () => {
    expect(evaluateGate('safe', 'critical', true).action).toBe('pending');
  });

  it('still blocks hard override in manual mode', () => {
    expect(evaluateGate('manual', 'low', true).action).toBe('pending');
  });

  it('still blocks medium risk in safe mode', () => {
    expect(evaluateGate('safe', 'medium', false).action).toBe('pending');
  });

  it('still blocks all writes in manual mode', () => {
    expect(evaluateGate('manual', 'low', false).action).toBe('pending');
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
