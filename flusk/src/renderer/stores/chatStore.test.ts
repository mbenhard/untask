import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatMessage } from '../../types/models';
import type { ChatActionCard, TurnStep } from '../../types/chat';
import { useAppStore } from './appStore';
import { useChatStore } from './chatStore';

const createMockChatApi = () => {
  const unsubscribe = vi.fn();

  return {
    send: vi.fn(),
    cancel: vi.fn(async () => undefined),
    onStreamEvent: vi.fn(() => unsubscribe),
    onFocusMessage: vi.fn(() => unsubscribe),
    history: vi.fn(async (): Promise<ChatMessage[]> => []),
    clear: vi.fn(async () => undefined),
    listThreads: vi.fn(async () => ({
      conversations: [
        {
          id: 'thread-1',
          title: 'New Thread',
          isAutoTitle: true,
          createdAt: '2026-02-17T00:00:00.000Z',
          updatedAt: '2026-02-17T00:00:00.000Z',
          archivedAt: null,
          messageCount: 0,
        },
      ],
      total: 1,
    })),
    createThread: vi.fn(async () => ({
      conversation: {
        id: 'thread-new',
        title: 'New Thread',
        isAutoTitle: true,
        createdAt: '2026-02-17T00:00:00.000Z',
        updatedAt: '2026-02-17T00:00:00.000Z',
        archivedAt: null,
        messageCount: 0,
      },
    })),
    archiveThread: vi.fn(async () => undefined),
    deleteThread: vi.fn(async () => undefined),
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

    getAutonomyMode: vi.fn(async () => ({ mode: 'auto' as const })),
    setAutonomyMode: vi.fn(async ({ mode }: { mode: 'auto' | 'confirm' }) => ({
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
      conversations: [],
      conversationsTotal: 0,
      activeConversationId: 'thread-1',
      isLoadingConversations: false,
      isInitialized: false,
      isSending: false,
      error: null,
      models: [],
      selectedModelId: null,
      retentionMode: '30d',
      inFlightByRequestId: {},
      pendingViewSwitchByRequestId: {},
      requestPayloadByRequestId: {},
      conversationIdByRequestId: {},
      assistantMessageIdByRequestId: {},
      lastStreamError: null,
      unsubscribeStream: undefined,
      unsubscribeFocusMessage: undefined,
      autonomyMode: 'auto',
      pendingActions: [],
      pendingImages: [],
      processingImageCount: 0,
      focusMessageId: null,
      pendingNoteContext: null,
    });

    useAppStore.setState({
      activeView: 'today',
      manualNavigationVersion: 0,
      chatOverlayState: 'peek',

      newTaskTrigger: 0,
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

  it('opens chat overlay and stores focus target on focus-message event', async () => {
    const mockChatApi = ((globalThis as { window?: unknown }).window as {
      flusk: { chat: ReturnType<typeof createMockChatApi> };
    }).flusk.chat;

    await useChatStore.getState().initialize();

    const focusCalls = mockChatApi.onFocusMessage.mock.calls as unknown[][];
    const listener = focusCalls[0]?.[0] as
      | ((payload: { messageId: string }) => void)
      | undefined;

    expect(listener).toBeDefined();
    listener?.({ messageId: 'assistant-msg-1' });

    expect(useAppStore.getState().chatOverlayState).toBe('open');
    expect(useChatStore.getState().focusMessageId).toBe('assistant-msg-1');
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
          conversationId: 'thread-1',
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

  it('keeps peek state on assistant activity while overlay is peeked', () => {
    useAppStore.setState({ chatOverlayState: 'peek' });

    useChatStore.setState({
      messages: [
        {
          id: 'assistant-stream-req-peek-1',
          conversationId: 'thread-1',
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
          isStreaming: true,
          actionCards: [],
          steps: [],
        },
      ],
      inFlightByRequestId: {
        'req-peek-1': {
          placeholderId: 'assistant-stream-req-peek-1',
          actionCards: [],
          steps: [],
        },
      },
    });

    useChatStore.getState().applyStreamEvent({
      type: 'token',
      requestId: 'req-peek-1',
      text: 'Hello',
    });

    expect(useAppStore.getState().chatOverlayState).toBe('peek');
  });

  it('does not collapse an open overlay on stream activity', () => {
    useAppStore.setState({ chatOverlayState: 'open' });

    useChatStore.setState({
      messages: [
        {
          id: 'assistant-stream-req-peek-2',
          conversationId: 'thread-1',
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
          isStreaming: true,
          actionCards: [],
          steps: [],
        },
      ],
      inFlightByRequestId: {
        'req-peek-2': {
          placeholderId: 'assistant-stream-req-peek-2',
          actionCards: [],
          steps: [],
        },
      },
    });

    useChatStore.getState().applyStreamEvent({
      type: 'token',
      requestId: 'req-peek-2',
      text: 'Still open',
    });

    expect(useAppStore.getState().chatOverlayState).toBe('open');
  });

  it('applies only the last tool view intent when a turn completes', () => {
    const now = new Date().toISOString();
    const assistantMessage: ChatMessage = {
      id: 'assistant-auto-switch-1',
      conversationId: 'thread-1',
      role: 'assistant',
      content: 'Done.',
      toolCalls: null,
      chips: null,
      createdAt: now,
    };

    useAppStore.setState({
      activeView: 'tasks',
      manualNavigationVersion: 0,
      chatOverlayState: 'peek',

      newTaskTrigger: 0,
    });

    useChatStore.setState({
      messages: [
        {
          id: 'assistant-stream-req-auto-1',
          conversationId: 'thread-1',
          role: 'assistant',
          content: '',
          createdAt: now,
          isStreaming: true,
          actionCards: [],
          steps: [],
        },
      ],
      inFlightByRequestId: {
        'req-auto-1': {
          placeholderId: 'assistant-stream-req-auto-1',
          actionCards: [],
          steps: [],
        },
      },
      pendingViewSwitchByRequestId: {
        'req-auto-1': {
          manualNavigationVersionAtStart: 0,
          pendingViewIntent: null,
        },
      },
    });

    useChatStore.getState().applyStreamEvent({
      type: 'tool_call_completed',
      requestId: 'req-auto-1',
      toolName: 'edit_note',
      toolCallId: 'tc-1',
      status: 'success',
      message: 'Edited note',
      actionCard: {
        id: 'card-auto-1',
        toolName: 'edit_note',
        status: 'success',
        title: 'Note updated',
        detail: 'Edited notes',
        undoable: false,
        createdAt: now,
        viewIntent: 'notes',
      },
    });

    useChatStore.getState().applyStreamEvent({
      type: 'tool_call_completed',
      requestId: 'req-auto-1',
      toolName: 'update_task',
      toolCallId: 'tc-2',
      status: 'success',
      message: 'Task updated',
      actionCard: {
        id: 'card-auto-2',
        toolName: 'update_task',
        status: 'success',
        title: 'Task updated',
        detail: 'Updated task',
        undoable: true,
        createdAt: now,
        viewIntent: 'today',
      },
    });

    expect(useAppStore.getState().activeView).toBe('tasks');

    useChatStore.getState().applyStreamEvent({
      type: 'assistant_done',
      requestId: 'req-auto-1',
      assistantMessage,
      actionCards: [],
    });

    const appState = useAppStore.getState();
    const chatState = useChatStore.getState();
    expect(appState.activeView).toBe('today');
    expect(chatState.pendingViewSwitchByRequestId['req-auto-1']).toBeUndefined();
  });

  it('suppresses auto-switch when user navigates during the same turn', () => {
    const now = new Date().toISOString();
    const assistantMessage: ChatMessage = {
      id: 'assistant-auto-switch-2',
      conversationId: 'thread-1',
      role: 'assistant',
      content: 'Done.',
      toolCalls: null,
      chips: null,
      createdAt: now,
    };

    useChatStore.setState({
      messages: [
        {
          id: 'assistant-stream-req-auto-2',
          conversationId: 'thread-1',
          role: 'assistant',
          content: '',
          createdAt: now,
          isStreaming: true,
          actionCards: [],
          steps: [],
        },
      ],
      inFlightByRequestId: {
        'req-auto-2': {
          placeholderId: 'assistant-stream-req-auto-2',
          actionCards: [],
          steps: [],
        },
      },
      pendingViewSwitchByRequestId: {
        'req-auto-2': {
          manualNavigationVersionAtStart: 0,
          pendingViewIntent: null,
        },
      },
    });

    useChatStore.getState().applyStreamEvent({
      type: 'tool_call_completed',
      requestId: 'req-auto-2',
      toolName: 'create_task',
      toolCallId: 'tc-3',
      status: 'success',
      message: 'Task created',
      actionCard: {
        id: 'card-auto-3',
        toolName: 'create_task',
        status: 'success',
        title: 'Task created',
        detail: 'Created task',
        undoable: true,
        createdAt: now,
        viewIntent: 'inbox',
      },
    });

    useAppStore.getState().setView('tasks');

    useChatStore.getState().applyStreamEvent({
      type: 'assistant_done',
      requestId: 'req-auto-2',
      assistantMessage,
      actionCards: [],
    });

    expect(useAppStore.getState().activeView).toBe('tasks');
  });

  it('upserts assistant_done by persisted message id', () => {
    const assistantMessage: ChatMessage = {
      id: 'assistant-1',
      conversationId: 'thread-1',
      role: 'assistant',
      content: 'Done.',
      toolCalls: null,
      chips: null,
      createdAt: new Date().toISOString(),
    };

    useChatStore.setState({
      messages: [
        {
          id: 'assistant-stream-req-2',
          conversationId: 'thread-1',
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

  it('collapses adjacent duplicate text steps on assistant_done', () => {
    const now = new Date().toISOString();
    const assistantMessage: ChatMessage = {
      id: 'assistant-dedupe-1',
      conversationId: 'thread-1',
      role: 'assistant',
      content: 'Repeated summary.',
      toolCalls: null,
      chips: null,
      createdAt: now,
    };

    useChatStore.setState({
      messages: [
        {
          id: 'assistant-stream-dedupe-1',
          conversationId: 'thread-1',
          role: 'assistant',
          content: 'Repeated summary.',
          createdAt: now,
          isStreaming: true,
          actionCards: [],
          steps: [
            { kind: 'text', content: 'Repeated summary.' },
            { kind: 'text', content: 'Repeated summary.' },
          ],
        },
      ],
      inFlightByRequestId: {
        'req-dedupe-1': {
          placeholderId: 'assistant-stream-dedupe-1',
          actionCards: [],
          steps: [
            { kind: 'text', content: 'Repeated summary.' },
            { kind: 'text', content: 'Repeated summary.' },
          ],
        },
      },
    });

    useChatStore.getState().applyStreamEvent({
      type: 'assistant_done',
      requestId: 'req-dedupe-1',
      assistantMessage,
      actionCards: [],
    });

    const stored = useChatStore
      .getState()
      .messages.find((message) => message.id === 'assistant-dedupe-1');
    const textSteps = stored?.steps.filter((step) => step.kind === 'text') ?? [];

    expect(textSteps).toHaveLength(1);
    expect((textSteps[0] as Extract<TurnStep, { kind: 'text' }>)?.content).toBe('Repeated summary.');
  });

  it('accumulates reasoning events into a thinking step', () => {
    useChatStore.setState({
      messages: [
        {
          id: 'assistant-stream-req-3',
          conversationId: 'thread-1',
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
          conversationId: 'thread-1',
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
          conversationId: 'thread-1',
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
          viewIntent: 'inbox' as const,
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
      conversationId: 'thread-1',
      role: 'assistant',
      content: 'Done. Task created.',
      toolCalls: JSON.stringify(metadata),
      chips: null,
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
      expect(toolStep?.actionCard?.viewIntent).toBe('inbox');
    });
  });

  it('hydrates chips from the dedicated chat column', async () => {
    const historicalMessage: ChatMessage = {
      id: 'msg-chip-hist',
      conversationId: 'thread-1',
      role: 'assistant',
      content: 'Choose one.',
      toolCalls: JSON.stringify({
        requestId: 'req-chip-hist',
        modelId: 'minimax/minimax-m2.5',
        actionCards: [],
        toolExecutions: [],
      }),
      chips: JSON.stringify([
        { label: 'Do it', type: 'response', responseText: 'Do it' },
      ]),
      createdAt: new Date().toISOString(),
    };

    const mockChatApi = ((globalThis as { window?: unknown }).window as {
      flusk: { chat: ReturnType<typeof createMockChatApi> };
    }).flusk.chat;

    mockChatApi.history.mockResolvedValue([historicalMessage]);

    await useChatStore.getState().initialize();

    const message = useChatStore.getState().messages.find((m) => m.id === 'msg-chip-hist');
    expect(message?.chips).toHaveLength(1);
    expect(message?.chips?.[0]?.label).toBe('Do it');
  });

  it('hydrates legacy response chips by defaulting responseText to label', async () => {
    const historicalMessage: ChatMessage = {
      id: 'msg-chip-legacy',
      conversationId: 'thread-1',
      role: 'assistant',
      content: 'Choose one.',
      toolCalls: JSON.stringify({
        requestId: 'req-chip-legacy',
        modelId: 'minimax/minimax-m2.5',
        actionCards: [],
        toolExecutions: [],
      }),
      chips: JSON.stringify([
        { label: 'Review Inbox now', type: 'response' },
      ]),
      createdAt: new Date().toISOString(),
    };

    const mockChatApi = ((globalThis as { window?: unknown }).window as {
      flusk: { chat: ReturnType<typeof createMockChatApi> };
    }).flusk.chat;

    mockChatApi.history.mockResolvedValue([historicalMessage]);

    await useChatStore.getState().initialize();

    const message = useChatStore.getState().messages.find((m) => m.id === 'msg-chip-legacy');
    expect(message?.chips).toHaveLength(1);
    expect(message?.chips?.[0]).toEqual({
      label: 'Review Inbox now',
      type: 'response',
      responseText: 'Review Inbox now',
    });
  });

  it('uses the main-selected model at send time instead of stale store state', async () => {
    const mockChatApi = ((globalThis as { window?: unknown }).window as {
      flusk: { chat: ReturnType<typeof createMockChatApi> };
    }).flusk.chat;

    mockChatApi.getSelectedModel.mockResolvedValue({ modelId: 'moonshotai/kimi-k2.5' });
    mockChatApi.send.mockResolvedValue({
      requestId: 'req-send-live-model',
      conversationId: 'thread-1',
      userMessage: {
        id: 'user-msg-1',
        conversationId: 'thread-1',
        role: 'user',
        content: 'hello',
        toolCalls: null,
        chips: null,
        createdAt: new Date().toISOString(),
      },
    });

    useChatStore.setState({ selectedModelId: 'minimax/minimax-m2.5' });

    await useChatStore.getState().sendMessage('hello');

    expect(mockChatApi.getSelectedModel).toHaveBeenCalledTimes(1);
    expect(mockChatApi.send).toHaveBeenCalledWith({
      content: 'hello',
      modelId: 'moonshotai/kimi-k2.5',
      conversationId: 'thread-1',
    });
    expect(useChatStore.getState().selectedModelId).toBe('moonshotai/kimi-k2.5');
  });

  it('does not dispatch a second send while a turn is already in flight', async () => {
    const mockChatApi = ((globalThis as { window?: unknown }).window as {
      flusk: { chat: ReturnType<typeof createMockChatApi> };
    }).flusk.chat;

    useChatStore.setState({ isSending: true });

    await useChatStore.getState().sendMessage('duplicate?');

    expect(mockChatApi.getSelectedModel).not.toHaveBeenCalled();
    expect(mockChatApi.send).not.toHaveBeenCalled();
  });

  it('attaches staged note context on the next outgoing message', async () => {
    const mockChatApi = ((globalThis as { window?: unknown }).window as {
      flusk: { chat: ReturnType<typeof createMockChatApi> };
    }).flusk.chat;

    mockChatApi.getSelectedModel.mockResolvedValue({ modelId: 'moonshotai/kimi-k2.5' });
    mockChatApi.send.mockResolvedValue({
      requestId: 'req-send-note-context',
      conversationId: 'thread-1',
      userMessage: {
        id: 'user-msg-note-context',
        conversationId: 'thread-1',
        role: 'user',
        content: 'extract tasks',
        toolCalls: null,
        chips: null,
        createdAt: new Date().toISOString(),
      },
    });

    useChatStore.getState().stageNoteContext({
      noteId: 'note-42',
      title: 'Client call',
      markdown: '- send proposal',
    });

    await useChatStore.getState().sendMessage('extract tasks');

    expect(mockChatApi.send).toHaveBeenCalledWith({
      content: 'extract tasks',
      modelId: 'moonshotai/kimi-k2.5',
      conversationId: 'thread-1',
      noteContext: {
        noteId: 'note-42',
        title: 'Client call',
        markdown: '- send proposal',
      },
    });
    expect(useChatStore.getState().pendingNoteContext).toEqual({
      noteId: 'note-42',
      title: 'Client call',
      markdown: '- send proposal',
    });
  });

  it('falls back to main default model resolution when selected-model lookup fails', async () => {
    const mockChatApi = ((globalThis as { window?: unknown }).window as {
      flusk: { chat: ReturnType<typeof createMockChatApi> };
    }).flusk.chat;

    mockChatApi.getSelectedModel.mockRejectedValue(new Error('lookup failed'));
    mockChatApi.send.mockResolvedValue({
      requestId: 'req-send-fallback-model',
      conversationId: 'thread-1',
      userMessage: {
        id: 'user-msg-2',
        conversationId: 'thread-1',
        role: 'user',
        content: 'fallback',
        toolCalls: null,
        chips: null,
        createdAt: new Date().toISOString(),
      },
    });

    await useChatStore.getState().sendMessage('fallback');

    expect(mockChatApi.send).toHaveBeenCalledWith({
      content: 'fallback',
      modelId: null,
      conversationId: 'thread-1',
    });
  });

  it('detaches staged note context on demand', () => {
    useChatStore.getState().stageNoteContext({
      noteId: 'note-9',
      title: 'Planning',
      markdown: '- clarify scope',
    });

    useChatStore.getState().detachPendingNoteContext();

    expect(useChatStore.getState().pendingNoteContext).toBeNull();
  });

  it('consumes staged note context and clears it', () => {
    useChatStore.getState().stageNoteContext({
      noteId: 'note-11',
      title: 'Retro',
      markdown: '- improve handoff',
    });

    const consumed = useChatStore.getState().consumePendingNoteContext();

    expect(consumed).toEqual({
      noteId: 'note-11',
      title: 'Retro',
      markdown: '- improve handoff',
    });
    expect(useChatStore.getState().pendingNoteContext).toBeNull();
  });
});
