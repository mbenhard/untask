import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

vi.mock('./memory', () => ({
  getMemory: vi.fn(() => ''),
  updateMemorySection: vi.fn(),
}));

vi.mock('./models', () => ({
  getSelectedModelId: vi.fn(() => 'moonshotai/kimi-k2.5'),
}));

vi.mock('./providers', () => ({
  getActiveProvider: vi.fn(() => ({
    languageModel: vi.fn(() => ({ id: 'mock-model' })),
  })),
}));

import { generateText } from 'ai';

import { getMemory, updateMemorySection } from './memory';
import { cancelPendingExtraction, scheduleKnowledgeExtraction } from './knowledgeExtractor';

const generateTextMock = vi.mocked(generateText);
const getMemoryMock = vi.mocked(getMemory);
const updateMemorySectionMock = vi.mocked(updateMemorySection);

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  getMemoryMock.mockReturnValue('## Preferences\n- direct communication');
  generateTextMock.mockResolvedValue({
    text: '{"extractions":[]}',
  } as never);
});

afterEach(() => {
  cancelPendingExtraction();
  vi.useRealTimers();
});

describe('knowledge extractor scheduling', () => {
  it('debounces and only runs the latest scheduled extraction', async () => {
    const emit = vi.fn();

    scheduleKnowledgeExtraction({
      userMessage: 'I prefer morning deep work blocks for important tasks.',
      assistantResponse: 'Understood, I will prioritize deep work in the morning.',
      requestId: 'req-1',
      emit,
    });

    scheduleKnowledgeExtraction({
      userMessage: 'Actually afternoons are best for admin and calls.',
      assistantResponse: 'Got it, I will account for that.',
      requestId: 'req-2',
      emit,
    });

    expect(generateTextMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60_000);

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    const prompt = generateTextMock.mock.calls[0]?.[0]?.messages?.[0]?.content;
    expect(String(prompt)).toContain('Actually afternoons are best for admin and calls.');
    expect(String(prompt)).not.toContain('I prefer morning deep work blocks');
  });

  it('cancels pending extraction when requested', async () => {
    const emit = vi.fn();

    scheduleKnowledgeExtraction({
      userMessage: 'I always review invoices on Fridays before lunch.',
      assistantResponse: 'Noted. I will remember your invoice review pattern.',
      requestId: 'req-cancel',
      emit,
    });

    cancelPendingExtraction();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(generateTextMock).not.toHaveBeenCalled();
    expect(updateMemorySectionMock).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('applies extracted facts silently (no memory_updated event)', async () => {
    const emit = vi.fn();
    generateTextMock.mockResolvedValue({
      text: JSON.stringify({
        extractions: [
          {
            action: 'ADD',
            section: 'Preferences',
            content: 'Afternoon is best for calls and admin.',
            evidence: 'afternoons are best for admin and calls',
          },
        ],
      }),
    } as never);

    scheduleKnowledgeExtraction({
      userMessage: 'Afternoons are best for admin and calls.',
      assistantResponse: 'Understood and recorded.',
      requestId: 'req-update',
      emit,
    });

    await vi.advanceTimersByTimeAsync(60_000);

    expect(updateMemorySectionMock).toHaveBeenCalledWith(
      'Preferences',
      '- Afternoon is best for calls and admin.',
      'merge',
      'ai',
    );
    // Background extraction is silent — no memory_updated event emitted
    expect(emit).not.toHaveBeenCalled();
  });

  it('skips extraction for short turns', async () => {
    const emit = vi.fn();

    scheduleKnowledgeExtraction({
      userMessage: 'Short',
      assistantResponse: 'Too short',
      requestId: 'req-short',
      emit,
    });

    await vi.advanceTimersByTimeAsync(60_000);

    expect(generateTextMock).not.toHaveBeenCalled();
    expect(updateMemorySectionMock).not.toHaveBeenCalled();
  });
});
