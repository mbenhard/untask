import { describe, expect, it } from 'vitest';

import {
  buildConversationMessages,
  classifyChatError,
  extractInlineChipBlock,
  generateToolCallDescription,
  parseExplicitFallbackToolCall,
  shouldRequireToolChoice,
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

describe('buildConversationMessages', () => {
  it('keeps recent history and appends current user message when missing', () => {
    expect(
      buildConversationMessages({
        history: [{ role: 'assistant', content: 'What should I create?' }],
        userMessage: 'Create task: Call Acme',
      }),
    ).toEqual([
      { role: 'assistant', content: 'What should I create?' },
      { role: 'user', content: 'Create task: Call Acme' },
    ]);
  });

  it('does not duplicate current user turn when already present in history', () => {
    expect(
      buildConversationMessages({
        history: [{ role: 'user', content: 'Create task: Call Acme' }],
        userMessage: 'Create task: Call Acme',
      }),
    ).toEqual([{ role: 'user', content: 'Create task: Call Acme' }]);
  });
});

describe('classifyChatError', () => {
  it('marks empty provider responses as retryable provider errors', () => {
    expect(classifyChatError(new Error('Provider returned empty response.'))).toEqual({
      code: 'provider_error',
      retryable: true,
      message: 'Provider returned empty response.',
    });
  });

  it('classifies inactivity timeout as retryable provider error', () => {
    expect(
      classifyChatError(
        new Error('Stream inactivity timeout: no data received for 90 seconds.'),
      ),
    ).toEqual({
      code: 'provider_error',
      retryable: true,
      message: 'Stream inactivity timeout: no data received for 90 seconds.',
    });
  });
});

describe('shouldRequireToolChoice', () => {
  it('requires tool choice for explicit task commands', () => {
    expect(
      shouldRequireToolChoice({
        userMessage: 'create task: Call Acme',
        history: [],
      }),
    ).toBe(true);
  });

  it('requires tool choice for clarification follow-up detail messages', () => {
    expect(
      shouldRequireToolChoice({
        userMessage: 'do laundry tomorrow at 1pm medium priority',
        history: [
          {
            role: 'assistant',
            content:
              "What's the task? Give me a title and any details like due date or priority.",
          },
        ],
      }),
    ).toBe(true);
  });

  it('does not require tool choice for non-task conversational prompts', () => {
    expect(
      shouldRequireToolChoice({
        userMessage: 'why',
        history: [
          {
            role: 'assistant',
            content: 'I can help you capture and organize tasks.',
          },
        ],
      }),
    ).toBe(false);
  });

  it('does not require tool choice for generic factual questions by default', () => {
    expect(
      shouldRequireToolChoice({
        userMessage: 'what is the weather in berlin today',
        history: [],
      }),
    ).toBe(false);
  });

  it('can require tool choice for explicit web-search phrasing when enabled', () => {
    expect(
      shouldRequireToolChoice({
        userMessage: 'look up latest news about openrouter',
        history: [],
        allowWebSearchToolChoice: true,
      }),
    ).toBe(true);
  });
});

describe('generateToolCallDescription', () => {
  it('generates description for create_task with title', () => {
    expect(generateToolCallDescription('create_task', { title: 'Call Acme about invoice' })).toBe(
      'Creating task "Call Acme about invoice"',
    );
  });

  it('generates description for create_task without args', () => {
    expect(generateToolCallDescription('create_task', {})).toBe('Creating task');
  });

  it('generates description for complete_task', () => {
    expect(generateToolCallDescription('complete_task', { id: 'task-123' })).toBe(
      'Completing task…',
    );
  });

  it('generates description for delete_task', () => {
    expect(generateToolCallDescription('delete_task', { id: 'task-456' })).toBe(
      'Deleting task…',
    );
  });

  it('generates description for suggest_daily_plan', () => {
    expect(generateToolCallDescription('suggest_daily_plan', {})).toBe('Generating daily plan');
  });

  it('generates description for set_today', () => {
    expect(generateToolCallDescription('set_today', { id: 'task-789' })).toBe(
      'Updating Today list…',
    );
  });

  it('generates description for read_note', () => {
    expect(generateToolCallDescription('read_note', {})).toBe('Reading note');
  });

  it('generates description for edit_note rewrite', () => {
    expect(generateToolCallDescription('edit_note', { action: 'rewrite' })).toBe(
      'Rewriting note',
    );
  });

  it('generates description for undo_last_action without event id', () => {
    expect(generateToolCallDescription('undo_last_action', {})).toBe('Undoing last action…');
  });

  it('generates description for undo_last_action with event id', () => {
    expect(generateToolCallDescription('undo_last_action', { taskEventId: 'evt-1' })).toBe(
      'Undoing last action…',
    );
  });

  it('generates description for write_journal', () => {
    expect(generateToolCallDescription('write_journal', {})).toBe('Writing journal entry');
  });

  it('generates description for read_journal', () => {
    expect(generateToolCallDescription('read_journal', {})).toBe('Reading journal entries');
  });

  it('generates description for search_chat_history', () => {
    expect(generateToolCallDescription('search_chat_history', { query: 'invoice' })).toBe(
      'Searching chat history for "invoice"',
    );
  });

  it('generates description for improve_task', () => {
    expect(generateToolCallDescription('improve_task', { id: 'task-abc' })).toBe(
      'Analyzing task…',
    );
  });

  it('generates fallback for unknown tool', () => {
    expect(generateToolCallDescription('unknown_tool', {})).toBe('Running unknown_tool');
  });

  it('truncates long create_task titles', () => {
    const longTitle = 'A'.repeat(100);
    const result = generateToolCallDescription('create_task', { title: longTitle });
    expect(result.length).toBeLessThan(100);
    expect(result).toContain('...');
  });

  it('handles null/undefined args gracefully', () => {
    expect(generateToolCallDescription('create_task', null)).toBe('Creating task');
    expect(generateToolCallDescription('create_task', undefined)).toBe('Creating task');
  });
});

describe('extractInlineChipBlock', () => {
  it('extracts chips from "Action Chips:" heading with bullet list', () => {
    const text = 'What would you like to do?\n\nAction Chips:\n- Plan my day\n- Check inbox\n- Review tasks';
    const result = extractInlineChipBlock(text);
    expect(result).not.toBeNull();
    expect(result!.chips).toHaveLength(3);
    expect(result!.chips[0].label).toBe('Plan my day');
    expect(result!.chips[0].type).toBe('response');
    expect(result!.text).toBe('What would you like to do?');
  });

  it('extracts chips from "Chips:" heading', () => {
    const text = 'Pick one.\n\nChips:\n- Yes\n- No';
    const result = extractInlineChipBlock(text);
    expect(result).not.toBeNull();
    expect(result!.chips).toHaveLength(2);
    expect(result!.chips[0].label).toBe('Yes');
    expect(result!.chips[1].label).toBe('No');
  });

  it('extracts chips from "Options:" heading (no chip keyword)', () => {
    const text = 'Which client?\n\nOptions:\n- Acme Corp\n- Globex Inc\n- Initech';
    const result = extractInlineChipBlock(text);
    expect(result).not.toBeNull();
    expect(result!.chips).toHaveLength(3);
    expect(result!.chips[0].label).toBe('Acme Corp');
  });

  it('extracts chips from "Quick replies:" heading', () => {
    const text = 'How urgent?\n\nQuick replies:\n- High priority\n- Medium priority\n- Low priority';
    const result = extractInlineChipBlock(text);
    expect(result).not.toBeNull();
    expect(result!.chips).toHaveLength(3);
  });

  it('extracts chips from "Suggestions:" heading', () => {
    const text = 'Next steps.\n\nSuggestions:\n- Review budget\n- Call vendor';
    const result = extractInlineChipBlock(text);
    expect(result).not.toBeNull();
    expect(result!.chips).toHaveLength(2);
  });

  it('handles bold markdown in heading', () => {
    const text = 'Choose:\n\n**Options:**\n- A\n- B\n- C';
    const result = extractInlineChipBlock(text);
    expect(result).not.toBeNull();
    expect(result!.chips).toHaveLength(3);
  });

  it('returns null when no heading is found', () => {
    const text = 'Just a normal response with no chip-like patterns at all.';
    expect(extractInlineChipBlock(text)).toBeNull();
  });

  it('returns null when fewer than 2 unique chip labels', () => {
    const text = 'Pick:\n\nChips:\n- Only one option';
    expect(extractInlineChipBlock(text)).toBeNull();
  });

  it('caps at 4 chips', () => {
    const text = 'Options:\n- A\n- B\n- C\n- D\n- E\n- F';
    const result = extractInlineChipBlock(text);
    expect(result).not.toBeNull();
    expect(result!.chips.length).toBeLessThanOrEqual(4);
  });

  it('strips quoted chip labels', () => {
    const text = 'Options:\n- "Start now"\n- "Defer to tomorrow"';
    const result = extractInlineChipBlock(text);
    expect(result).not.toBeNull();
    expect(result!.chips[0].label).toBe('Start now');
  });

  it('deduplicates chip labels', () => {
    const text = 'Options:\n- Yes\n- Yes\n- No';
    const result = extractInlineChipBlock(text);
    expect(result).not.toBeNull();
    expect(result!.chips).toHaveLength(2);
  });

  it('strips the chip block from output text', () => {
    const text = 'Before text.\n\nOptions:\n- A\n- B\n\nAfter text.';
    const result = extractInlineChipBlock(text);
    expect(result).not.toBeNull();
    expect(result!.text).toContain('Before text.');
    expect(result!.text).toContain('After text.');
    expect(result!.text).not.toContain('Options:');
  });
});
