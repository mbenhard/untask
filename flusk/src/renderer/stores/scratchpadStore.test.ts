import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useScratchpadStore } from './scratchpadStore';

type MockScratchpadApi = {
  get: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
};

const createMockScratchpadApi = (): MockScratchpadApi => ({
  get: vi.fn(async () => ({
    id: 'main',
    content: '',
    updatedAt: new Date().toISOString(),
  })),
  save: vi.fn(async (content: string) => ({
    id: 'main',
    content,
    updatedAt: new Date().toISOString(),
  })),
});

describe('scratchpadStore', () => {
  beforeEach(() => {
    const scratchpad = createMockScratchpadApi();
    (globalThis as { window?: unknown }).window = { flusk: { scratchpad } };

    useScratchpadStore.setState({
      content: '',
      isLegacyMarkdown: false,
      isDirty: false,
      isLoading: false,
      isSaving: false,
      isSendingToAI: false,
      error: null,
    });
  });

  it('clears dirty state after saving when content is unchanged', async () => {
    useScratchpadStore.setState({ content: 'draft note', isDirty: true });

    await useScratchpadStore.getState().save();

    const state = useScratchpadStore.getState();
    expect(state.content).toBe('draft note');
    expect(state.isDirty).toBe(false);
    expect(state.isSaving).toBe(false);
  });

  it('does not overwrite newer edits when a save resolves late', async () => {
    const scratchpad = ((globalThis as { window?: unknown }).window as {
      flusk: { scratchpad: MockScratchpadApi };
    }).flusk.scratchpad;

    scratchpad.save.mockImplementation(
      async (content: string) =>
        await new Promise<{ id: string; content: string; updatedAt: string }>((resolve) => {
          setTimeout(() => {
            resolve({ id: 'main', content, updatedAt: new Date().toISOString() });
          }, 0);
        }),
    );

    useScratchpadStore.setState({ content: 'first draft', isDirty: true });

    const savePromise = useScratchpadStore.getState().save();
    useScratchpadStore.getState().setContent('first draft plus new text');
    await savePromise;

    const state = useScratchpadStore.getState();
    expect(state.content).toBe('first draft plus new text');
    expect(state.isDirty).toBe(true);
    expect(state.isSaving).toBe(false);
  });

  it('detects legacy markdown on load', async () => {
    const scratchpad = ((globalThis as { window?: unknown }).window as {
      flusk: { scratchpad: MockScratchpadApi };
    }).flusk.scratchpad;

    scratchpad.get.mockResolvedValue({
      id: 'main',
      content: '# Hello\n\n- item 1\n- item 2',
      updatedAt: new Date().toISOString(),
    });

    await useScratchpadStore.getState().load();

    const state = useScratchpadStore.getState();
    expect(state.isLegacyMarkdown).toBe(true);
    expect(state.content).toBe('# Hello\n\n- item 1\n- item 2');
  });

  it('detects blocknote JSON on load', async () => {
    const scratchpad = ((globalThis as { window?: unknown }).window as {
      flusk: { scratchpad: MockScratchpadApi };
    }).flusk.scratchpad;

    const blocks = JSON.stringify([{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }]);
    scratchpad.get.mockResolvedValue({
      id: 'main',
      content: blocks,
      updatedAt: new Date().toISOString(),
    });

    await useScratchpadStore.getState().load();

    const state = useScratchpadStore.getState();
    expect(state.isLegacyMarkdown).toBe(false);
    expect(state.content).toBe(blocks);
  });
});
