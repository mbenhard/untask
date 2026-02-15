import { randomUUID } from 'node:crypto';

import { streamText } from 'ai';

import type { AssistantLiveContext, AssistantMemorySnapshot } from '../../types/assistant';
import type {
  ChatSendResultPayload,
  ChatStreamEvent,
  ChatToolExecutionSummary,
  PersistedChatToolMetadata,
} from '../../types/chat';
import { saveChatMessage, sweepChatRetention } from '../services/chatService';
import { writeJournalEntry } from '../services/journalService';
import { getSetting, setSetting } from '../services/settingsService';

import { buildCanonicalRuntimeContext } from './contextBuilder';
import { createOpenRouterProviderFromEnv } from './openrouter';
import type { ChatModelId } from './models';
import { getSelectedModelId, resolveModelId } from './models';
import { buildSystemPrompt } from './systemPrompt';
import type { AiToolCall, AiToolExecutionResult, ToolExecutionEnvelope } from './tools';
import { createSdkTools, executeToolCall } from './tools';

const activeChatRequestIds = new Set<string>();
const canceledChatRequestIds = new Set<string>();
const AUTO_JOURNAL_LAST_WRITE_AT_KEY = 'ai_journal_last_auto_write_at';
const AUTO_JOURNAL_COOLDOWN_MS = 20 * 60 * 1000;
const TOOL_MUTATION_NAMES = new Set([
  'create_task',
  'update_task',
  'complete_task',
  'move_task',
  'set_today',
  'parse_notes',
  'undo_last_action',
  'update_user_profile',
  'update_patterns',
]);

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unknown chat orchestration error.';

const isChatRequestCanceled = (requestId: string): boolean =>
  canceledChatRequestIds.has(requestId);

const hasString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const toToolExecutionEnvelope = (
  value: unknown,
): ToolExecutionEnvelope | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<ToolExecutionEnvelope>;

  if (
    (candidate.status === 'success' ||
      candidate.status === 'error' ||
      candidate.status === 'confirmation_required') &&
    hasString(candidate.message)
  ) {
    return {
      status: candidate.status,
      message: candidate.message,
      data: candidate.data,
      actionCard: candidate.actionCard,
    };
  }

  return null;
};

const inferFallbackToolCall = (userMessage: string): AiToolCall | null => {
  const normalized = userMessage.trim();

  const createMatch = normalized.match(
    /create(?:\s+a)?\s+task(?:\s*(?:called|named|titled))?[:\-\s]+(.+)/i,
  );
  if (createMatch && createMatch[1]) {
    const title = createMatch[1].trim().replace(/^["']+|["'.]+$/g, '');
    if (title.length > 0) {
      return {
        name: 'create_task',
        input: { title },
      };
    }
  }

  if (/plan my day/i.test(normalized)) {
    return {
      name: 'suggest_daily_plan',
      input: { maxTasks: 5 },
    };
  }

  return null;
};

const truncate = (value: string, max: number): string =>
  value.length <= max ? value : `${value.slice(0, max - 3).trimEnd()}...`;

const isPlanningIntent = (message: string): boolean =>
  /\b(plan|prioriti[sz]e|today|next step|focus|schedule)\b/i.test(message);

const isPreferenceIntent = (message: string): boolean =>
  /\b(i prefer|i usually|i tend to|my style|works best for me|i hate|i dislike)\b/i.test(
    message,
  );

const hasToolMutation = (executions: ChatToolExecutionSummary[]): boolean =>
  executions.some(
    (execution) =>
      execution.status === 'success' && TOOL_MUTATION_NAMES.has(execution.toolName),
  );

const shouldSkipAutoJournal = (nowMs: number): boolean => {
  const lastWrittenAt = getSetting(AUTO_JOURNAL_LAST_WRITE_AT_KEY);
  if (!lastWrittenAt) {
    return false;
  }

  const parsed = Date.parse(lastWrittenAt);
  if (Number.isNaN(parsed)) {
    return false;
  }

  return nowMs - parsed < AUTO_JOURNAL_COOLDOWN_MS;
};

const maybeWriteMeaningfulInteractionJournal = (input: {
  userMessage: string;
  assistantText: string;
  toolExecutions: ChatToolExecutionSummary[];
}): void => {
  const normalizedMessage = input.userMessage.trim();
  if (normalizedMessage.length === 0) {
    return;
  }

  const planningIntent = isPlanningIntent(normalizedMessage);
  const preferenceIntent = isPreferenceIntent(normalizedMessage);
  const toolMutation = hasToolMutation(input.toolExecutions);
  const meaningful = planningIntent || preferenceIntent || toolMutation;

  if (!meaningful) {
    return;
  }

  const now = Date.now();
  if (shouldSkipAutoJournal(now)) {
    return;
  }

  const successfulTools = input.toolExecutions
    .filter((execution) => execution.status === 'success')
    .map((execution) => execution.toolName);
  const category: 'pattern' | 'progress' | 'preference' | 'summary' =
    preferenceIntent ? 'preference' : toolMutation ? 'progress' : 'pattern';
  const toolSummary =
    successfulTools.length > 0 ? `Tools: ${successfulTools.join(', ')}.` : '';
  const content = [
    `Meaningful turn: ${truncate(normalizedMessage, 180)}`,
    toolSummary,
    `Assistant outcome: ${truncate(input.assistantText.trim(), 180)}`,
  ]
    .filter((line) => line.trim().length > 0)
    .join(' ');

  try {
    writeJournalEntry({
      category,
      content,
    });
    setSetting(AUTO_JOURNAL_LAST_WRITE_AT_KEY, new Date(now).toISOString());
  } catch {
    // Never block chat completion on auto-journal failures.
  }
};

export type PrepareChatTurnInput = {
  userMessage: string;
  modelId?: string | null;
  tokenBudget?: number;
  memory?: Partial<AssistantMemorySnapshot>;
  liveContext?: Partial<AssistantLiveContext>;
};

export type PreparedChatTurn = {
  modelId: ChatModelId;
  userMessage: string;
  systemPrompt: string;
};

export type StartChatTurnInput = {
  content: string;
  modelId?: string | null;
  tokenBudget?: number;
  requestId?: string;
  emit: (event: ChatStreamEvent) => void;
};

export const prepareChatTurn = async (
  input: PrepareChatTurnInput,
): Promise<PreparedChatTurn> => {
  const trimmedMessage = input.userMessage.trim();

  if (trimmedMessage.length === 0) {
    throw new Error('Chat message cannot be empty.');
  }

  const modelId = input.modelId ? resolveModelId(input.modelId) : getSelectedModelId();
  const { memory, liveContext } = buildCanonicalRuntimeContext({
    memory: input.memory,
    liveContext: input.liveContext,
    journalLimit: 24,
  });

  const built = await buildSystemPrompt({
    userMessage: trimmedMessage,
    tokenBudget: input.tokenBudget,
    memory,
    liveContext,
  });

  return {
    modelId,
    userMessage: trimmedMessage,
    systemPrompt: built.modelInputPrompt,
  };
};

const runAssistantStream = async (
  input: {
    requestId: string;
    userMessage: string;
    modelId: ChatModelId;
    tokenBudget?: number;
    emit: (event: ChatStreamEvent) => void;
  },
): Promise<void> => {
  const actionCards: PersistedChatToolMetadata['actionCards'] = [];
  const toolExecutions: ChatToolExecutionSummary[] = [];

  const emit = input.emit;

  try {
    const { memory, liveContext } = buildCanonicalRuntimeContext({
      journalLimit: 24,
    });
    const builtPrompt = await buildSystemPrompt({
      userMessage: input.userMessage,
      tokenBudget: input.tokenBudget,
      memory,
      liveContext,
    });

    const provider = createOpenRouterProviderFromEnv();
    const model = provider(input.modelId);

    const result = streamText({
      model,
      system: builtPrompt.modelInputPrompt,
      prompt: input.userMessage,
      tools: createSdkTools({
        onActionCard: (card) => {
          actionCards.push(card);
        },
      }) as Parameters<typeof streamText>[0]['tools'],
    });

    let assistantText = '';

    for await (const part of result.fullStream) {
      if (isChatRequestCanceled(input.requestId)) {
        return;
      }

      switch (part.type) {
        case 'text-delta': {
          assistantText += part.text;
          emit({
            type: 'token',
            requestId: input.requestId,
            text: part.text,
          });
          break;
        }
        case 'tool-call': {
          emit({
            type: 'tool_call_started',
            requestId: input.requestId,
            toolName: part.toolName,
            toolCallId: part.toolCallId,
          });
          break;
        }
        case 'tool-result': {
          const envelope = toToolExecutionEnvelope(part.output);
          const status = envelope?.status ?? 'success';
          const message = envelope?.message ?? `${part.toolName} completed.`;
          const actionCard = envelope?.actionCard;

          if (actionCard) {
            const exists = actionCards.some((card) => card.id === actionCard.id);
            if (!exists) {
              actionCards.push(actionCard);
            }
          }

          const execution: ChatToolExecutionSummary = {
            toolName: part.toolName,
            toolCallId: part.toolCallId,
            status,
            message,
            actionCardId: actionCard?.id,
          };
          toolExecutions.push(execution);

          emit({
            type: 'tool_call_completed',
            requestId: input.requestId,
            toolName: part.toolName,
            toolCallId: part.toolCallId,
            status,
            message,
            actionCard,
          });
          break;
        }
        case 'tool-error': {
          const maybeErrorText =
            'errorText' in part && typeof part.errorText === 'string'
              ? part.errorText
              : null;
          const message = maybeErrorText ?? `${part.toolName} failed.`;

          toolExecutions.push({
            toolName: part.toolName,
            toolCallId: part.toolCallId,
            status: 'error',
            message,
          });

          emit({
            type: 'tool_call_completed',
            requestId: input.requestId,
            toolName: part.toolName,
            toolCallId: part.toolCallId,
            status: 'error',
            message,
          });
          break;
        }
        case 'error': {
          emit({
            type: 'error',
            requestId: input.requestId,
            message: toErrorMessage(part.error),
          });
          break;
        }
        default:
          break;
      }
    }

    if (isChatRequestCanceled(input.requestId)) {
      return;
    }

    if (toolExecutions.length === 0) {
      const fallbackCall = inferFallbackToolCall(input.userMessage);

      if (fallbackCall) {
        const fallbackToolCallId = `heuristic-${randomUUID()}`;

        emit({
          type: 'tool_call_started',
          requestId: input.requestId,
          toolName: fallbackCall.name,
          toolCallId: fallbackToolCallId,
        });

        const fallbackResult = await executeToolCall(fallbackCall, {
          toolCallId: fallbackToolCallId,
          onActionCard: (card) => {
            actionCards.push(card);
          },
        });

        if (isChatRequestCanceled(input.requestId)) {
          return;
        }

        if (fallbackResult.ok) {
          const actionCard = fallbackResult.output.actionCard;
          const execution: ChatToolExecutionSummary = {
            toolName: fallbackResult.toolName,
            toolCallId: fallbackToolCallId,
            status: fallbackResult.output.status,
            message: fallbackResult.output.message,
            actionCardId: actionCard?.id,
          };
          toolExecutions.push(execution);

          emit({
            type: 'tool_call_completed',
            requestId: input.requestId,
            toolName: fallbackResult.toolName,
            toolCallId: fallbackToolCallId,
            status: fallbackResult.output.status,
            message: fallbackResult.output.message,
            actionCard,
          });
        } else {
          toolExecutions.push({
            toolName: fallbackResult.toolName,
            toolCallId: fallbackToolCallId,
            status: 'error',
            message: fallbackResult.error.message,
          });

          emit({
            type: 'tool_call_completed',
            requestId: input.requestId,
            toolName: fallbackResult.toolName,
            toolCallId: fallbackToolCallId,
            status: 'error',
            message: fallbackResult.error.message,
          });
        }
      }
    }

    const finalizedTextFromModel = (await result.text).trim() || assistantText.trim();
    if (isChatRequestCanceled(input.requestId)) {
      return;
    }

    const synthesizedToolSummary =
      toolExecutions.length > 0
        ? `Tools executed: ${toolExecutions
            .map((execution) => `${execution.toolName} (${execution.status})`)
            .join(', ')}.`
        : '';
    const finalizedText =
      finalizedTextFromModel.length > 0
        ? finalizedTextFromModel
        : synthesizedToolSummary;

    const metadata: PersistedChatToolMetadata = {
      requestId: input.requestId,
      modelId: input.modelId,
      actionCards,
      toolExecutions,
    };

    if (isChatRequestCanceled(input.requestId)) {
      return;
    }

    const assistantMessage = saveChatMessage({
      role: 'assistant',
      content:
        finalizedText.length > 0
          ? finalizedText
          : 'No assistant text was generated for this turn.',
      toolCalls: JSON.stringify(metadata),
    });

    maybeWriteMeaningfulInteractionJournal({
      userMessage: input.userMessage,
      assistantText: finalizedText,
      toolExecutions,
    });

    if (isChatRequestCanceled(input.requestId)) {
      return;
    }

    emit({
      type: 'assistant_done',
      requestId: input.requestId,
      assistantMessage,
      actionCards,
    });
  } catch (error) {
    if (isChatRequestCanceled(input.requestId)) {
      return;
    }

    emit({
      type: 'error',
      requestId: input.requestId,
      message: toErrorMessage(error),
    });
  } finally {
    activeChatRequestIds.delete(input.requestId);
    canceledChatRequestIds.delete(input.requestId);
  }
};

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
  activeChatRequestIds.add(requestId);
  canceledChatRequestIds.delete(requestId);

  try {
    const userMessage = saveChatMessage({
      role: 'user',
      content,
      toolCalls: JSON.stringify({
        requestId,
        modelId,
      }),
    });

    void runAssistantStream({
      requestId,
      userMessage: content,
      modelId,
      tokenBudget: input.tokenBudget,
      emit: input.emit,
    });

    return {
      requestId,
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
};

export const dispatchToolCall = async (
  call: AiToolCall,
): Promise<AiToolExecutionResult> => executeToolCall(call);
