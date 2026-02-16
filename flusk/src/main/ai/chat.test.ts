import { describe, expect, it } from 'vitest';

import {
  classifyChatError,
  parseExplicitFallbackToolCall,
  shouldRetryStreamAttempt,
} from './chat';

describe('parseExplicitFallbackToolCall', () => {
  it('rejects conversational question phrasing', () => {
    expect(parseExplicitFallbackToolCall('can you create a task for me?')).toBeNull();
  });

  it('parses explicit create command', () => {
    expect(
      parseExplicitFallbackToolCall('create task: Call Acme about invoice'),
    ).toEqual({
      name: 'create_task',
      input: {
        title: 'Call Acme about invoice',
      },
    });
  });
});

describe('shouldRetryStreamAttempt', () => {
  it('retries transient provider errors before any tool work starts', () => {
    const classifiedError = classifyChatError(new Error('Provider returned 429'));

    expect(
      shouldRetryStreamAttempt({
        requestId: 'req-1',
        attemptCount: 1,
        maxAttempts: 2,
        classifiedError,
        hasToolExecution: false,
        hasAssistantText: false,
      }),
    ).toBe(true);
  });

  it('does not retry when a tool has already started', () => {
    const classifiedError = classifyChatError(new Error('fetch failed'));

    expect(
      shouldRetryStreamAttempt({
        requestId: 'req-2',
        attemptCount: 1,
        maxAttempts: 2,
        classifiedError,
        hasToolExecution: true,
        hasAssistantText: false,
      }),
    ).toBe(false);
  });
});
