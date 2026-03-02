import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runAssistantStream } from './streamOrchestration';

const {
  generateTextMock,
  executeToolCallMock,
  saveChatMessageMock,
  loadPendingActionsMock,
  removeLegacyPendingActionsMock,
  removePendingActionMock,
  requeuePendingActionMock,
  deterministicRouterEnabledMock,
  streamTextMock,
} = vi.hoisted(() => ({
  generateTextMock: vi.fn(async () => ({ text: '{}' })),
  executeToolCallMock: vi.fn(),
  saveChatMessageMock: vi.fn(),
  loadPendingActionsMock: vi.fn(),
  removeLegacyPendingActionsMock: vi.fn(() => 0),
  removePendingActionMock: vi.fn(),
  requeuePendingActionMock: vi.fn(),
  deterministicRouterEnabledMock: vi.fn(() => true),
  streamTextMock: vi.fn(),
}));

vi.mock('ai', () => ({
  generateText: generateTextMock,
  stepCountIs: vi.fn((steps: number) => steps),
  streamText: streamTextMock,
}));

vi.mock('electron', () => ({
  app: {
    isPackaged: true,
  },
}));

vi.mock('../services/chatService', () => ({
  getRecentConversationMessages: vi.fn(() => []),
  saveChatMessage: saveChatMessageMock,
}));

const buildAssistantMessage = (input: {
  conversationId: string;
  role: 'assistant';
  content: string;
  toolCalls: string;
}) => ({
  id: 'assistant-msg-1',
  conversationId: input.conversationId,
  role: input.role,
  content: input.content,
  toolCalls: input.toolCalls,
  chips: null,
  createdAt: new Date().toISOString(),
});

const buildStreamResult = (parts: Array<Record<string, unknown>>, text: string) => ({
  fullStream: (async function* streamGenerator() {
    for (const part of parts) {
      yield part;
    }
  })(),
  text: Promise.resolve(text),
});

beforeEach(() => {
  vi.clearAllMocks();
  deterministicRouterEnabledMock.mockReturnValue(true);
  removeLegacyPendingActionsMock.mockReturnValue(0);
  loadPendingActionsMock.mockReturnValue([]);
  streamTextMock.mockReturnValue(buildStreamResult([], 'Model reply.'));
  saveChatMessageMock.mockImplementation((input: {
    conversationId: string;
    role: 'assistant';
    content: string;
    toolCalls: string;
  }) => buildAssistantMessage(input));
});

vi.mock('./tools', () => ({
  executeToolCall: executeToolCallMock,
  createSdkTools: vi.fn(() => ({})),
  OLLAMA_ALLOWED_TOOLS: new Set(['list_notes']),
  INCEPTION_ALLOWED_TOOLS: new Set(['list_notes']),
}));

vi.mock('./autonomy', () => ({
  loadPendingActions: loadPendingActionsMock,
  removeLegacyPendingActions: removeLegacyPendingActionsMock,
  removePendingAction: removePendingActionMock,
  requeuePendingAction: requeuePendingActionMock,
  hasPendingActionScopeMetadata: vi.fn((action: {
    conversationId?: string;
    fingerprint?: string;
    expiresAt?: string;
  }) =>
    Boolean(action.conversationId && action.fingerprint && action.expiresAt)),
  isPendingActionExpired: vi.fn(() => false),
}));

vi.mock('./runtimeFlags', () => ({
  isDeterministicRouterEnabled: deterministicRouterEnabledMock,
  isPendingScopeGuardEnabled: vi.fn(() => true),
}));

vi.mock('./providers', () => ({
  getActiveProvider: vi.fn(() => ({
    languageModel: vi.fn(() => ({})),
    tools: {},
  })),
}));

vi.mock('./models', () => ({
  getModelWebSearchConfig: vi.fn(() => ({
    supportsWebSearch: false,
    webSearchMethod: null,
  })),
  isOllamaProvider: vi.fn(() => false),
  isInceptionProvider: vi.fn(() => false),
  modelSupportsVision: vi.fn(() => false),
}));

vi.mock('./contextBuilder', () => ({
  buildCanonicalRuntimeContext: vi.fn(() => ({
    liveContext: {
      tasks: [],
      inboxCount: 0,
      now: '2026-02-24T10:00:00.000Z',
      timezone: 'UTC',
    },
  })),
}));

vi.mock('./systemPrompt', () => ({
  buildSystemPrompt: vi.fn(() => ({
    modelInputPrompt: 'sys',
    contextSnapshot: {
      generatedAt: '2026-02-24T10:00:00.000Z',
      timezone: 'UTC',
      tokenBudget: 0,
      estimatedTotalTokens: 0,
      sectionOrder: [],
      sections: [],
      compiledPrompt: 'sys',
    },
  })),
}));

vi.mock('./autoTitle', () => ({
  maybeAutoTitleConversation: vi.fn(),
}));

vi.mock('./runtimeDiagnostics', () => ({
  logRuntimeDiagnostic: vi.fn(),
}));

const chatState = {
  isCanceled: vi.fn(() => false),
  removeRequest: vi.fn(),
  removeCanceled: vi.fn(),
};

describe('runAssistantStream deterministic routing', () => {
  it('does not run parser-driven routing or fallback when deterministic router is disabled', async () => {
    deterministicRouterEnabledMock.mockReturnValue(false);
    streamTextMock.mockReturnValue(
      buildStreamResult(
        [{ type: 'text-delta', text: 'I can help with that.' }],
        'I can help with that.',
      ),
    );

    await runAssistantStream(
      {
        requestId: 'req-notes-ai-1',
        conversationId: 'thread-1',
        requestOrigin: 'user',
        userMessage: 'show my notes',
        modelId: 'openai/gpt-5-mini',
        emit: () => {},
      },
      chatState,
    );

    expect(streamTextMock).toHaveBeenCalledTimes(1);
    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toolChoice: 'auto',
      }),
    );
    expect(executeToolCallMock).not.toHaveBeenCalled();
    expect(saveChatMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'I can help with that.',
      }),
    );
  });

  it('forces required tool choice when semantic probe detects actionable task intent', async () => {
    deterministicRouterEnabledMock.mockReturnValue(false);
    generateTextMock.mockResolvedValue({ text: '{"needsToolAction":true}' });
    streamTextMock.mockReturnValue(
      buildStreamResult(
        [{ type: 'text-delta', text: 'I can help with that.' }],
        'I can help with that.',
      ),
    );

    await runAssistantStream(
      {
        requestId: 'req-semantic-required-1',
        conversationId: 'thread-1',
        requestOrigin: 'user',
        userMessage: 'remove kkot task',
        modelId: 'openai/gpt-5-mini',
        emit: () => {},
      },
      chatState,
    );

    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toolChoice: 'required',
      }),
    );
  });

  it('does not run deterministic parser routing for proactive requests', async () => {
    deterministicRouterEnabledMock.mockReturnValue(true);
    streamTextMock.mockReturnValue(
      buildStreamResult(
        [{ type: 'text-delta', text: 'Reminder: task is due now.' }],
        'Reminder: task is due now.',
      ),
    );

    await runAssistantStream(
      {
        requestId: 'proactive-notes-1',
        conversationId: 'thread-1',
        requestOrigin: 'proactive',
        userMessage: 'show my notes',
        modelId: 'openai/gpt-5-mini',
        emit: () => {},
      },
      chatState,
    );

    expect(streamTextMock).toHaveBeenCalledTimes(1);
    expect(executeToolCallMock).not.toHaveBeenCalled();
    expect(saveChatMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Reminder: task is due now.',
      }),
    );
  });

  it('routes explicit note listing intent without model-dependent tool choice', async () => {
    executeToolCallMock.mockResolvedValue({
      ok: true,
      toolName: 'list_notes',
      output: {
        status: 'success',
        message: 'Found 1 note.',
        data: {
          active: [{ title: 'Product ideas' }],
          archived: [],
        },
      },
    });

    const events: Array<{ type: string; [key: string]: unknown }> = [];
    await runAssistantStream(
      {
        requestId: 'req-notes-1',
        conversationId: 'thread-1',
        requestOrigin: 'user',
        userMessage: 'show my notes',
        modelId: 'openai/gpt-5-mini',
        emit: (event) => {
          events.push(event);
        },
      },
      chatState,
    );

    expect(executeToolCallMock).toHaveBeenCalledTimes(1);
    expect(executeToolCallMock).toHaveBeenCalledWith(
      { name: 'list_notes', input: {} },
      expect.objectContaining({
        requestId: 'req-notes-1',
        conversationId: 'thread-1',
      }),
    );
    expect(saveChatMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Active notes:'),
      }),
    );
    expect(events.map((event) => event.type)).toEqual([
      'tool_call_started',
      'tool_call_completed',
      'assistant_done',
    ]);
  });

  it('approves typed yes when exactly one eligible pending action exists in the same conversation', async () => {
    loadPendingActionsMock.mockReturnValue([
      {
        actionId: 'pending-1',
        toolName: 'delete_task',
        input: { id: 'task-1' },
        riskLevel: 'critical',
        rationale: 'Delete task "Task 1".',
        requiresHardConfirmation: true,
        createdAt: '2026-02-24T10:00:00.000Z',
        requestId: 'req-origin-1',
        createdByRequestId: 'req-origin-1',
        conversationId: 'thread-1',
        fingerprint: 'delete_task:{"id":"task-1"}',
        expiresAt: '2026-02-24T10:30:00.000Z',
        modeAtCreation: 'auto',
        lifecycle: 'pending',
      },
    ]);

    executeToolCallMock.mockResolvedValue({
      ok: true,
      toolName: 'delete_task',
      output: {
        status: 'success',
        message: 'Task deleted.',
      },
    });

    await runAssistantStream(
      {
        requestId: 'req-approve-1',
        conversationId: 'thread-1',
        requestOrigin: 'user',
        userMessage: 'yes',
        modelId: 'openai/gpt-5-mini',
        emit: () => {},
      },
      chatState,
    );

    expect(removePendingActionMock).toHaveBeenCalledWith('pending-1');
    expect(executeToolCallMock).toHaveBeenCalledWith(
      { name: 'delete_task', input: { id: 'task-1' } },
      expect.objectContaining({
        autonomyBypass: true,
        requestId: 'req-approve-1',
        conversationId: 'thread-1',
      }),
    );
    expect(saveChatMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Task deleted.' }),
    );
  });

  it('keeps typed pending approval path active even when deterministic router is disabled', async () => {
    deterministicRouterEnabledMock.mockReturnValue(false);
    loadPendingActionsMock.mockReturnValue([
      {
        actionId: 'pending-keep-1',
        toolName: 'delete_task',
        input: { id: 'task-keep-1' },
        riskLevel: 'critical',
        rationale: 'Delete task.',
        requiresHardConfirmation: true,
        createdAt: '2026-02-24T10:00:00.000Z',
        requestId: 'req-origin-keep-1',
        createdByRequestId: 'req-origin-keep-1',
        conversationId: 'thread-1',
        fingerprint: 'delete_task:{"id":"task-keep-1"}',
        expiresAt: '2026-02-24T10:30:00.000Z',
        modeAtCreation: 'auto',
        lifecycle: 'pending',
      },
    ]);

    executeToolCallMock.mockResolvedValue({
      ok: true,
      toolName: 'delete_task',
      output: {
        status: 'success',
        message: 'Task deleted.',
      },
    });

    await runAssistantStream(
      {
        requestId: 'req-approve-keep-1',
        conversationId: 'thread-1',
        requestOrigin: 'user',
        userMessage: 'yes',
        modelId: 'openai/gpt-5-mini',
        emit: () => {},
      },
      chatState,
    );

    expect(executeToolCallMock).toHaveBeenCalledTimes(1);
    expect(saveChatMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Task deleted.' }),
    );
  });

  it('does not execute typed yes when multiple eligible pending actions exist', async () => {
    loadPendingActionsMock.mockReturnValue([
      {
        actionId: 'pending-1',
        toolName: 'update_task',
        input: { id: 'task-1', title: 'A' },
        riskLevel: 'low',
        rationale: 'Update task.',
        requiresHardConfirmation: false,
        createdAt: '2026-02-24T10:00:00.000Z',
        requestId: 'req-origin-1',
        createdByRequestId: 'req-origin-1',
        conversationId: 'thread-1',
        fingerprint: 'update_task:{"id":"task-1","title":"A"}',
        expiresAt: '2026-02-24T10:30:00.000Z',
        modeAtCreation: 'auto',
        lifecycle: 'pending',
      },
      {
        actionId: 'pending-2',
        toolName: 'delete_task',
        input: { id: 'task-2' },
        riskLevel: 'critical',
        rationale: 'Delete task.',
        requiresHardConfirmation: true,
        createdAt: '2026-02-24T10:01:00.000Z',
        requestId: 'req-origin-2',
        createdByRequestId: 'req-origin-2',
        conversationId: 'thread-1',
        fingerprint: 'delete_task:{"id":"task-2"}',
        expiresAt: '2026-02-24T10:31:00.000Z',
        modeAtCreation: 'auto',
        lifecycle: 'pending',
      },
    ]);

    await runAssistantStream(
      {
        requestId: 'req-approve-2',
        conversationId: 'thread-1',
        requestOrigin: 'user',
        userMessage: 'yes',
        modelId: 'openai/gpt-5-mini',
        emit: () => {},
      },
      chatState,
    );

    expect(executeToolCallMock).not.toHaveBeenCalled();
    expect(saveChatMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('pending approvals in this chat'),
      }),
    );
  });

  it('rejects typed no against a single eligible pending action without executing mutation', async () => {
    loadPendingActionsMock.mockReturnValue([
      {
        actionId: 'pending-reject-1',
        toolName: 'delete_task',
        input: { id: 'task-3' },
        riskLevel: 'critical',
        rationale: 'Delete task.',
        requiresHardConfirmation: true,
        createdAt: '2026-02-24T10:00:00.000Z',
        requestId: 'req-origin-3',
        createdByRequestId: 'req-origin-3',
        conversationId: 'thread-1',
        fingerprint: 'delete_task:{"id":"task-3"}',
        expiresAt: '2026-02-24T10:30:00.000Z',
        modeAtCreation: 'auto',
        lifecycle: 'pending',
      },
    ]);

    await runAssistantStream(
      {
        requestId: 'req-reject-1',
        conversationId: 'thread-1',
        requestOrigin: 'user',
        userMessage: 'no',
        modelId: 'openai/gpt-5-mini',
        emit: () => {},
      },
      chatState,
    );

    expect(removePendingActionMock).toHaveBeenCalledWith('pending-reject-1');
    expect(executeToolCallMock).not.toHaveBeenCalled();
    expect(saveChatMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Understood. I did not apply that change.',
      }),
    );
  });

  it('clears legacy pending approvals and asks user to rerun the action', async () => {
    removeLegacyPendingActionsMock.mockReturnValue(1);
    loadPendingActionsMock.mockReturnValue([]);

    await runAssistantStream(
      {
        requestId: 'req-approve-legacy',
        conversationId: 'thread-1',
        requestOrigin: 'user',
        userMessage: 'yes',
        modelId: 'openai/gpt-5-mini',
        emit: () => {},
      },
      chatState,
    );

    expect(executeToolCallMock).not.toHaveBeenCalled();
    expect(removePendingActionMock).not.toHaveBeenCalled();
    expect(saveChatMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('cleared 1 outdated pending approval'),
      }),
    );
  });
});
