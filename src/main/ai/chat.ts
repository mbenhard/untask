import { randomUUID } from 'node:crypto';

import type {
  ChatNoteContext,
  ChatSendResultPayload,
  ChatStreamEvent,
} from '../../types/chat';
import type { ProactiveTriggerType } from '../../types/assistant';
import {
  ensureConversation,
  getMostRecentConversation,
  saveChatMessage,
  sweepChatRetention,
} from '../services/chatService';
import { getSelectedModelId, resolveModelId } from './models';
import { PROACTIVE_ALLOWED_TOOLS } from './tools';
import { runAssistantStream } from './streamOrchestration';

// ─── Re-exports for external consumers ──────────────────────────
// These keep imports like `import { classifyChatError } from '../ai/chat'`
// working without changes in IPC handlers, tests, or other modules.

export {
  classifyChatError,
  shouldRetryStreamAttempt,
} from './errorClassification';

export type {
  ClassifiedChatError,
  StreamRetryEvaluationInput,
} from './errorClassification';

export {
  buildConversationMessages,
  extractInlineChipBlock,
  generateToolCallDescription,
  parseExplicitFallbackToolCall,
  shouldRequireToolChoice,
} from './streamOrchestration';

// ─── Module state ───────────────────────────────────────────────

const activeChatRequestIds = new Set<string>();
const canceledChatRequestIds = new Set<string>();

const isChatRequestCanceled = (requestId: string): boolean =>
  canceledChatRequestIds.has(requestId);

const chatState = {
  isCanceled: isChatRequestCanceled,
  removeRequest: (requestId: string) => activeChatRequestIds.delete(requestId),
  removeCanceled: (requestId: string) => canceledChatRequestIds.delete(requestId),
};

// ─── Public types ───────────────────────────────────────────────

export type StartChatTurnInput = {
  content: string;
  conversationId?: string;
  modelId?: string | null;
  images?: string[];
  noteContext?: ChatNoteContext;
  tokenBudget?: number;
  requestId?: string;
  emit: (event: ChatStreamEvent) => void;
};

export type StartProactiveTurnInput = {
  triggerMessage: string;
  triggerType: ProactiveTriggerType;
  conversationId?: string;
  emit: (event: ChatStreamEvent) => void;
};

// ─── Core orchestration entry points ────────────────────────────

export const startChatTurn = async (
  input: StartChatTurnInput,
): Promise<ChatSendResultPayload> => {
  sweepChatRetention();

  const content = input.content.trim();
  if (content.length === 0) {
    throw new Error('Chat content cannot be empty.');
  }

  const requestId = input.requestId ?? randomUUID();
  const modelId = input.modelId ? resolveModelId(input.modelId) : getSelectedModelId();
  const conversation = ensureConversation(input.conversationId);
  activeChatRequestIds.add(requestId);
  canceledChatRequestIds.delete(requestId);

  const images = input.images?.length ? input.images : undefined;
  const noteContext =
    input.noteContext &&
    input.noteContext.noteId.trim().length > 0 &&
    input.noteContext.markdown.trim().length > 0
      ? {
          noteId: input.noteContext.noteId.trim(),
          title: input.noteContext.title.trim(),
          markdown: input.noteContext.markdown.trim(),
        }
      : undefined;

  try {
    const userMessageMeta: Record<string, unknown> = {
      requestId,
      modelId,
    };
    if (images) {
      userMessageMeta.imageCount = images.length;
    }
    if (noteContext) {
      userMessageMeta.noteContext = {
        noteId: noteContext.noteId,
        title: noteContext.title,
      };
    }

    const userMessage = saveChatMessage({
      conversationId: conversation.id,
      role: 'user',
      content,
      toolCalls: JSON.stringify(userMessageMeta),
      chips: null,
    });

    void runAssistantStream(
      {
        requestId,
        conversationId: conversation.id,
        requestOrigin: 'user',
        userMessage: content,
        modelId,
        images,
        noteContext,
        tokenBudget: input.tokenBudget,
        emit: input.emit,
      },
      chatState,
    );

    return {
      requestId,
      conversationId: conversation.id,
      userMessage,
    };
  } catch (error) {
    activeChatRequestIds.delete(requestId);
    canceledChatRequestIds.delete(requestId);
    throw error;
  }
};

export const cancelActiveChatTurns = (): void => {
  activeChatRequestIds.forEach((requestId) => {
    canceledChatRequestIds.add(requestId);
  });
  activeChatRequestIds.clear();
};

// ─── Proactive turn (no user message saved) ─────────────────────

export const startProactiveTurn = async (
  input: StartProactiveTurnInput,
): Promise<void> => {
  const requestId = `proactive-${randomUUID()}`;
  const modelId = getSelectedModelId();
  const conversation =
    input.conversationId
      ? ensureConversation(input.conversationId)
      : getMostRecentConversation(false) ?? ensureConversation();
  activeChatRequestIds.add(requestId);
  canceledChatRequestIds.delete(requestId);

  // No user message saved to DB -- synthetic trigger is invisible to chat history.
  // The assistant response will be saved by runAssistantStream as normal.
  await runAssistantStream(
    {
      requestId,
      conversationId: conversation.id,
      requestOrigin: 'proactive',
      userMessage: input.triggerMessage,
      modelId,
      emit: input.emit,
      allowedTools: PROACTIVE_ALLOWED_TOOLS,
    },
    chatState,
  );
};
