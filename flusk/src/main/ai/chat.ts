import { randomUUID } from 'node:crypto';

import { streamText } from 'ai';

import type { AssistantLiveContext, AssistantMemorySnapshot } from '../../types/assistant';
import type {
  ChatStreamErrorCode,
  ChatSendResultPayload,
  ChatStreamEvent,
  ChatTurnTelemetry,
  ChatToolExecutionSummary,
  PersistedChatToolMetadata,
} from '../../types/chat';
import {
  getRecentChatMessages,
  saveChatMessage,
  sweepChatRetention,
} from '../services/chatService';
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
const STREAM_MAX_ATTEMPTS = 2;
const STREAM_RETRY_BASE_DELAY_MS = 400;
const HISTORY_WINDOW_LIMIT = 12;
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

type ClassifiedChatError = {
  code: ChatStreamErrorCode;
  retryable: boolean;
  message: string;
};

type StreamRetryEvaluationInput = {
  requestId: string;
  attemptCount: number;
  maxAttempts: number;
  classifiedError: ClassifiedChatError;
  hasToolExecution: boolean;
  hasAssistantText: boolean;
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return 'Unknown chat orchestration error.';
};

const normalizeErrorMessage = (message: string): string => message.toLowerCase();

export const classifyChatError = (error: unknown): ClassifiedChatError => {
  const message = toErrorMessage(error);
  const normalized = normalizeErrorMessage(message);

  if (
    normalized.includes('api key') ||
    normalized.includes('openrouter_api_key') ||
    normalized.includes('unauthorized') ||
    normalized.includes('forbidden') ||
    normalized.includes('invalid model')
  ) {
    return {
      code: 'config_error',
      retryable: false,
      message,
    };
  }

  if (
    normalized.includes('tool ') ||
    normalized.includes('invalid payload for') ||
    normalized.includes('unknown tool')
  ) {
    return {
      code: 'tool_error',
      retryable: false,
      message,
    };
  }

  if (
    normalized.includes('econnreset') ||
    normalized.includes('enotfound') ||
    normalized.includes('etimedout') ||
    normalized.includes('fetch failed') ||
    normalized.includes('network') ||
    normalized.includes('socket hang up')
  ) {
    return {
      code: 'network_error',
      retryable: true,
      message,
    };
  }

  if (
    normalized.includes('429') ||
    normalized.includes('rate limit') ||
    normalized.includes('overloaded') ||
    normalized.includes('503') ||
    normalized.includes('502') ||
    normalized.includes('provider')
  ) {
    return {
      code: 'provider_error',
      retryable: true,
      message,
    };
  }

  return {
    code: 'unknown_error',
    retryable: false,
    message,
  };
};

export const shouldRetryStreamAttempt = (
  input: StreamRetryEvaluationInput,
): boolean => {
  if (isChatRequestCanceled(input.requestId)) {
    return false;
  }

  if (!input.classifiedError.retryable) {
    return false;
  }

  if (input.hasToolExecution || input.hasAssistantText) {
    return false;
  }

  return input.attemptCount < input.maxAttempts;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const computeRetryDelayMs = (): number =>
  STREAM_RETRY_BASE_DELAY_MS + Math.floor(Math.random() * 200);

const buildPromptWithRecentHistory = (input: {
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  userMessage: string;
}): string => {
  const historyLines = input.history
    .map((entry) => ({
      roleLabel: entry.role === 'assistant' ? 'Assistant' : 'User',
      content: entry.content.trim(),
    }))
    .filter((entry) => entry.content.length > 0)
    .map((entry) => `${entry.roleLabel}: ${entry.content}`);

  if (historyLines.length === 0) {
    return input.userMessage;
  }

  return [
    'Recent conversation context (oldest to newest):',
    ...historyLines,
    `User: ${input.userMessage}`,
  ].join('\n');
};

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

const normalizeFallbackTaskTitle = (rawTitle: string): string =>
  rawTitle.trim().replace(/^["']+|["']+$/g, '');

const looksLikeQuestion = (message: string): boolean =>
  message.includes('?') || /^(can|could|would|will|should|please)\b/i.test(message);

export const parseExplicitFallbackToolCall = (
  userMessage: string,
): AiToolCall | null => {
  const normalized = userMessage.trim();

  if (normalized.length === 0 || looksLikeQuestion(normalized)) {
    return null;
  }

  const createWithColonMatch = normalized.match(/^create\s+task:\s+(.+)$/i);
  if (createWithColonMatch && createWithColonMatch[1]) {
    const title = normalizeFallbackTaskTitle(createWithColonMatch[1]);
    if (title.length === 0) {
      return null;
    }
    return {
      name: 'create_task',
      input: { title },
    };
  }

  const addWithColonMatch = normalized.match(/^add\s+task:\s+(.+)$/i);
  if (addWithColonMatch && addWithColonMatch[1]) {
    const title = normalizeFallbackTaskTitle(addWithColonMatch[1]);
    if (title.length === 0) {
      return null;
    }
    return {
      name: 'create_task',
      input: { title },
    };
  }

  const calledMatch =
    normalized.match(/^create\s+task\s+called\s+"([^"]+)"\s*$/i) ??
    normalized.match(/^create\s+task\s+called\s+'([^']+)'\s*$/i);
  if (calledMatch && calledMatch[1]) {
    const title = normalizeFallbackTaskTitle(calledMatch[1]);
    if (title.length === 0) {
      return null;
    }
    return {
      name: 'create_task',
      input: { title },
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
  const telemetry: ChatTurnTelemetry = {
    startedAt: new Date().toISOString(),
    attemptCount: 0,
  };

  const emit = input.emit;
  let assistantText = '';
  let finalizedTextFromModel = '';

  try {
    let streamCompleted = false;

    for (let attempt = 1; attempt <= STREAM_MAX_ATTEMPTS; attempt += 1) {
      telemetry.attemptCount = attempt;
      let attemptHadToolExecution = false;

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
        const recentHistory = getRecentChatMessages(HISTORY_WINDOW_LIMIT).filter(
          (message) => message.role === 'user' || message.role === 'assistant',
        );
        const historyWithoutCurrentTurn = [...recentHistory];
        const lastHistoryEntry =
          historyWithoutCurrentTurn[historyWithoutCurrentTurn.length - 1];
        if (
          lastHistoryEntry?.role === 'user' &&
          lastHistoryEntry.content.trim() === input.userMessage
        ) {
          historyWithoutCurrentTurn.pop();
        }
        const promptWithHistory = buildPromptWithRecentHistory({
          history: historyWithoutCurrentTurn.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          userMessage: input.userMessage,
        });

        const result = streamText({
          model,
          system: builtPrompt.modelInputPrompt,
          prompt: promptWithHistory,
          tools: createSdkTools({
            onActionCard: (card) => {
              actionCards.push(card);
            },
          }) as Parameters<typeof streamText>[0]['tools'],
        });

        for await (const part of result.fullStream) {
          if (isChatRequestCanceled(input.requestId)) {
            return;
          }

          switch (part.type) {
            case 'text-delta': {
              if (!telemetry.firstTokenAt) {
                telemetry.firstTokenAt = new Date().toISOString();
              }

              assistantText += part.text;
              emit({
                type: 'token',
                requestId: input.requestId,
                text: part.text,
              });
              break;
            }
            case 'tool-call': {
              attemptHadToolExecution = true;
              emit({
                type: 'tool_call_started',
                requestId: input.requestId,
                toolName: part.toolName,
                toolCallId: part.toolCallId,
              });
              break;
            }
            case 'tool-result': {
              attemptHadToolExecution = true;
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
              attemptHadToolExecution = true;
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
            case 'error':
              throw part.error;
            default:
              break;
          }
        }

        if (isChatRequestCanceled(input.requestId)) {
          return;
        }

        if (toolExecutions.length === 0) {
          const fallbackCall = parseExplicitFallbackToolCall(input.userMessage);

          if (fallbackCall) {
            attemptHadToolExecution = true;
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

        finalizedTextFromModel = (await result.text).trim() || assistantText.trim();
        if (isChatRequestCanceled(input.requestId)) {
          return;
        }

        streamCompleted = true;
        break;
      } catch (error) {
        if (isChatRequestCanceled(input.requestId)) {
          return;
        }

        const classified = classifyChatError(error);
        const shouldRetry = shouldRetryStreamAttempt({
          requestId: input.requestId,
          attemptCount: attempt,
          maxAttempts: STREAM_MAX_ATTEMPTS,
          classifiedError: classified,
          hasToolExecution: toolExecutions.length > 0 || attemptHadToolExecution,
          hasAssistantText: assistantText.trim().length > 0,
        });

        if (shouldRetry) {
          await sleep(computeRetryDelayMs());
          continue;
        }

        emit({
          type: 'error',
          requestId: input.requestId,
          message: classified.message,
          code: classified.code,
          retryable: classified.retryable,
        });
        return;
      }
    }

    if (!streamCompleted) {
      emit({
        type: 'error',
        requestId: input.requestId,
        message: 'Assistant stream did not complete.',
        code: 'unknown_error',
        retryable: false,
      });
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
      telemetry: {
        ...telemetry,
        completedAt: new Date().toISOString(),
      },
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

    const classified = classifyChatError(error);
    emit({
      type: 'error',
      requestId: input.requestId,
      message: classified.message,
      code: classified.code,
      retryable: classified.retryable,
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
