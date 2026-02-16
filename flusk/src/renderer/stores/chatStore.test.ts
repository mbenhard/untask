import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatMessage } from '../../types/models';
import type { ChatActionCard } from '../../types/chat';
import { useChatStore } from './chatStore';

const createMockChatApi = () => {
  const unsubscribe = vi.fn();

  return {
    send: vi.fn(),
    onStreamEvent: vi.fn(() => unsubscribe),
    history: vi.fn(async (): Promise<ChatMessage[]> => []),
    clear: vi.fn(async () => undefined),
    getModels: vi.fn(async () => []),
    getSelectedModel: vi.fn(async () => ({ modelId: 'minimax/minimax-m2.5' })),
    setSelectedModel: vi.fn(async ({ modelId }: { modelId: string }) => ({ modelId })),
    undoLastAction: vi.fn(async () => ({
      ok: true,
      undone: false,
      message: 'No action to undo.',
    })),
    getRetentionMode: vi.fn(async () => ({ mode: '30d' as const })),
    setRetentionMode: vi.fn(async ({ mode }: { mode: 'session' | '30d' | 'forever' }) => ({
      mode,
    })),
    getLiveThought: vi.fn(),
    getAutonomyMode: vi.fn(async () => ({ mode: 'safe' as const })),
    setAutonomyMode: vi.fn(async ({ mode }: { mode: 'manual' | 'safe' | 'autopilot' }) => ({
      mode,
    })),
    resolvePendingAction: vi.fn(),
    listPendingActions: vi.fn(async () => ({ actions: [] })),
  };
};

describe('chatStore stream reliability', () => {
  beforeEach(() => {
    const mockChatApi = createMockChatApi();
    (globalThis as { window?: unknown }).window = {
      flusk: {
        chat: mockChatApi,
      },
    };

    useChatStore.setState({
      messages: [],
      isInitialized: false,
      isSending: false,
      error: null,
      models: [],
      selectedModelId: null,
      retentionMode: '30d',
      inFlightByRequestId: {},
      requestPayloadByRequestId: {},
      lastStreamError: null,
      unsubscribeStream: undefined,
      autonomyMode: 'safe',
      pendingActions: [],
    });
  });

  it('guards initialize() against concurrent listener registration', async () => {
    const mockChatApi = ((globalThis as { window?: unknown }).window as {
      flusk: { chat: ReturnType<typeof createMockChatApi> };
    }).flusk.chat;

    mockChatApi.history.mockImplementation(
      async () =>
        new Promise<ChatMessage[]>((resolve) => {
          setTimeout(() => resolve([]), 10);
        }),
    );

    await Promise.all([
      useChatStore.getState().initialize(),
      useChatStore.getState().initialize(),
    ]);

    expect(mockChatApi.onStreamEvent).toHaveBeenCalledTimes(1);
  });

  it('dedupes repeated tool_call_completed cards by card id', () => {
    const card: ChatActionCard = {
      id: 'card-1',
      toolName: 'create_task',
      status: 'success',
      title: 'Task created',
      detail: 'Call Acme',
      undoable: true,
      createdAt: new Date().toISOString(),
    };

    useChatStore.setState({
      messages: [
        {
          id: 'assistant-stream-req-1',
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
          isStreaming: true,
          actionCards: [],
        },
      ],
      inFlightByRequestId: {
        'req-1': {
          placeholderId: 'assistant-stream-req-1',
          actionCards: [],
        },
      },
    });

    const event = {
      type: 'tool_call_completed' as const,
      requestId: 'req-1',
      toolName: 'create_task',
      toolCallId: 'tool-1',
      status: 'success' as const,
      message: 'Task created',
      actionCard: card,
    };

    useChatStore.getState().applyStreamEvent(event);
    useChatStore.getState().applyStreamEvent(event);

    const state = useChatStore.getState();
    expect(state.inFlightByRequestId['req-1']?.actionCards).toHaveLength(1);
    expect(
      state.messages.find((message) => message.id === 'assistant-stream-req-1')?.actionCards,
    ).toHaveLength(1);
  });

  it('upserts assistant_done by persisted message id', () => {
    const assistantMessage: ChatMessage = {
      id: 'assistant-1',
      role: 'assistant',
      content: 'Done.',
      toolCalls: null,
      createdAt: new Date().toISOString(),
    };

    useChatStore.setState({
      messages: [
        {
          id: 'assistant-stream-req-2',
          role: 'assistant',
          content: 'Partial',
          createdAt: new Date().toISOString(),
          isStreaming: true,
          actionCards: [],
        },
      ],
      inFlightByRequestId: {
        'req-2': {
          placeholderId: 'assistant-stream-req-2',
          actionCards: [],
        },
      },
    });

    const doneEvent = {
      type: 'assistant_done' as const,
      requestId: 'req-2',
      assistantMessage,
      actionCards: [
        {
          id: 'card-2',
          toolName: 'create_task',
          status: 'success' as const,
          title: 'Task created',
          detail: 'Call Acme',
          undoable: true,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'card-2',
          toolName: 'create_task',
          status: 'success' as const,
          title: 'Task created',
          detail: 'Call Acme',
          undoable: true,
          createdAt: new Date().toISOString(),
        },
      ],
    };

    useChatStore.getState().applyStreamEvent(doneEvent);
    useChatStore.getState().applyStreamEvent(doneEvent);

    const state = useChatStore.getState();
    const assistantMessages = state.messages.filter(
      (message) => message.id === assistantMessage.id,
    );
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0]?.actionCards).toHaveLength(1);
  });
});
