import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runAssistantStream } from './streamOrchestration';

const {
  executeToolCallMock,
  saveChatMessageMock,
  loadPendingActionsMock,
  removePendingActionMock,
  requeuePendingActionMock,
} = vi.hoisted(() => ({
  executeToolCallMock: vi.fn(),
  saveChatMessageMock: vi.fn(),
  loadPendingActionsMock: vi.fn(),
  removePendingActionMock: vi.fn(),
  requeuePendingActionMock: vi.fn(),
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

beforeEach(() => {
  vi.clearAllMocks();
  loadPendingActionsMock.mockReturnValue([]);
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
}));

vi.mock('./autonomy', () => ({
  loadPendingActions: loadPendingActionsMock,
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
  isDeterministicRouterEnabled: vi.fn(() => true),
  isPendingScopeGuardEnabled: vi.fn(() => true),
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

  it('requires card-based resolution for legacy pending actions missing scope metadata', async () => {
    loadPendingActionsMock.mockReturnValue([
      {
        actionId: 'legacy-1',
        toolName: 'delete_task',
        input: { id: 'task-legacy' },
        riskLevel: 'critical',
        rationale: 'Delete task.',
        requiresHardConfirmation: true,
        createdAt: '2026-02-24T10:00:00.000Z',
        modeAtCreation: 'auto',
        lifecycle: 'pending',
      },
    ]);

    await runAssistantStream(
      {
        requestId: 'req-approve-legacy',
        conversationId: 'thread-1',
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
        content: expect.stringContaining('Approve or reject it from the card'),
      }),
    );
  });
});
