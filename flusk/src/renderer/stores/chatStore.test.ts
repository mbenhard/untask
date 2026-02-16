import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatMessage } from '../../types/models';
import type { ChatActionCard, TurnStep } from '../../types/chat';
import { useChatStore } from './chatStore';

const createMockChatApi = () => {
  const unsubscribe = vi.fn();

  return {
    send: vi.fn(),
    cancel: vi.fn(async () => undefined),
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
          steps: [],
        },
      ],
      inFlightByRequestId: {
        'req-1': {
          placeholderId: 'assistant-stream-req-1',
          actionCards: [],
          steps: [],
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
          steps: [],
        },
      ],
      inFlightByRequestId: {
        'req-2': {
          placeholderId: 'assistant-stream-req-2',
          actionCards: [],
          steps: [],
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

  it('accumulates reasoning events into a thinking step', () => {
    useChatStore.setState({
      messages: [
        {
          id: 'assistant-stream-req-3',
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
          isStreaming: true,
          actionCards: [],
          steps: [],
        },
      ],
      inFlightByRequestId: {
        'req-3': {
          placeholderId: 'assistant-stream-req-3',
          actionCards: [],
          steps: [],
        },
      },
    });

    useChatStore.getState().applyStreamEvent({
      type: 'reasoning',
      requestId: 'req-3',
      text: 'Let me think ',
    });
    useChatStore.getState().applyStreamEvent({
      type: 'reasoning',
      requestId: 'req-3',
      text: 'about this...',
    });

    const state = useChatStore.getState();
    const message = state.messages.find((m) => m.id === 'assistant-stream-req-3');
    expect(message?.steps).toHaveLength(1);
    expect(message?.steps[0]).toEqual({
      kind: 'thinking',
      content: 'Let me think about this...',
    });
  });

  it('accumulates mixed event sequence into ordered steps', () => {
    useChatStore.setState({
      messages: [
        {
          id: 'assistant-stream-req-4',
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
          isStreaming: true,
          actionCards: [],
          steps: [],
        },
      ],
      inFlightByRequestId: {
        'req-4': {
          placeholderId: 'assistant-stream-req-4',
          actionCards: [],
          steps: [],
        },
      },
    });

    const store = useChatStore.getState();

    // Reasoning first
    store.applyStreamEvent({
      type: 'reasoning',
      requestId: 'req-4',
      text: 'Planning...',
    });

    // Then text
    store.applyStreamEvent({
      type: 'token',
      requestId: 'req-4',
      text: 'Let me create that task.',
    });

    // Then tool call started
    store.applyStreamEvent({
      type: 'tool_call_started',
      requestId: 'req-4',
      toolName: 'create_task',
      toolCallId: 'tc-1',
      description: 'Creating task "Call Acme"',
    });

    // Then tool call completed
    store.applyStreamEvent({
      type: 'tool_call_completed',
      requestId: 'req-4',
      toolName: 'create_task',
      toolCallId: 'tc-1',
      status: 'success',
      message: 'Task created',
      summary: 'Task created — priority: high',
    });

    const state = useChatStore.getState();
    const message = state.messages.find((m) => m.id === 'assistant-stream-req-4');
    expect(message?.steps).toHaveLength(3);
    expect(message?.steps[0]).toEqual({ kind: 'thinking', content: 'Planning...' });
    expect(message?.steps[1]).toEqual({ kind: 'text', content: 'Let me create that task.' });
    expect((message?.steps[2] as Extract<TurnStep, { kind: 'tool' }>).kind).toBe('tool');
    expect((message?.steps[2] as Extract<TurnStep, { kind: 'tool' }>).status).toBe('success');
    expect((message?.steps[2] as Extract<TurnStep, { kind: 'tool' }>).summary).toBe(
      'Task created — priority: high',
    );
  });

  it('tool_call_started creates a running tool step', () => {
    useChatStore.setState({
      messages: [
        {
          id: 'assistant-stream-req-5',
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
          isStreaming: true,
          actionCards: [],
          steps: [],
        },
      ],
      inFlightByRequestId: {
        'req-5': {
          placeholderId: 'assistant-stream-req-5',
          actionCards: [],
          steps: [],
        },
      },
    });

    useChatStore.getState().applyStreamEvent({
      type: 'tool_call_started',
      requestId: 'req-5',
      toolName: 'delete_task',
      toolCallId: 'tc-del',
      description: 'Deleting task task-123',
    });

    const state = useChatStore.getState();
    const message = state.messages.find((m) => m.id === 'assistant-stream-req-5');
    expect(message?.steps).toHaveLength(1);
    const step = message?.steps[0] as Extract<TurnStep, { kind: 'tool' }>;
    expect(step.kind).toBe('tool');
    expect(step.status).toBe('running');
    expect(step.description).toBe('Deleting task task-123');
    expect(step.toolCallId).toBe('tc-del');
  });

  it('reconstructs steps from persisted metadata on history load', () => {
    const metadata = {
      requestId: 'req-hist',
      modelId: 'minimax/minimax-m2.5',
      actionCards: [
        {
          id: 'card-hist',
          toolName: 'create_task',
          status: 'success' as const,
          title: 'Task created',
          detail: 'Call Acme',
          undoable: true,
          createdAt: new Date().toISOString(),
        },
      ],
      toolExecutions: [
        {
          toolName: 'create_task',
          toolCallId: 'tc-hist',
          status: 'success' as const,
          message: 'Call Acme (priority:high)',
          actionCardId: 'card-hist',
        },
      ],
      reasoningText: 'Let me think about this task.',
    };

    const historicalMessage: ChatMessage = {
      id: 'msg-hist',
      role: 'assistant',
      content: 'Done. Task created.',
      toolCalls: JSON.stringify(metadata),
      createdAt: new Date().toISOString(),
    };

    const mockChatApi = ((globalThis as { window?: unknown }).window as {
      flusk: { chat: ReturnType<typeof createMockChatApi> };
    }).flusk.chat;

    mockChatApi.history.mockResolvedValue([historicalMessage]);

    return useChatStore.getState().initialize().then(() => {
      const state = useChatStore.getState();
      const message = state.messages.find((m) => m.id === 'msg-hist');

      expect(message).toBeDefined();
      expect(message?.steps.length).toBeGreaterThanOrEqual(2);

      const thinkingStep = message?.steps.find((s) => s.kind === 'thinking');
      expect(thinkingStep).toBeDefined();
      expect((thinkingStep as Extract<TurnStep, { kind: 'thinking' }>).content).toBe(
        'Let me think about this task.',
      );

      const toolStep = message?.steps.find((s) => s.kind === 'tool') as
        | Extract<TurnStep, { kind: 'tool' }>
        | undefined;
      expect(toolStep).toBeDefined();
      expect(toolStep?.status).toBe('success');
      expect(toolStep?.toolName).toBe('create_task');
    });
  });
});
