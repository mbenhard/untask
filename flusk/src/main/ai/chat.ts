import { randomUUID } from 'node:crypto';

import { stepCountIs, streamText } from 'ai';

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
import { getSelectedModelId, getModelWebSearchConfig, resolveModelId } from './models';
import { buildSystemPrompt } from './systemPrompt';
import type { AiToolCall, AiToolExecutionResult, ToolExecutionEnvelope } from './tools';
import { createSdkTools, executeToolCall } from './tools';
import { loadPendingActions } from './autonomy';

const activeChatRequestIds = new Set<string>();
const canceledChatRequestIds = new Set<string>();
const AUTO_JOURNAL_LAST_WRITE_AT_KEY = 'ai_journal_last_auto_write_at';
const AUTO_JOURNAL_COOLDOWN_MS = 20 * 60 * 1000;
const STREAM_MAX_ATTEMPTS = 2;
const STREAM_RETRY_BASE_DELAY_MS = 400;
const DEFAULT_TOKEN_BUDGET = 12_000;
const HISTORY_WINDOW_LIMIT = 60;
const STREAM_TOOL_LOOP_MAX_STEPS = 25;
const TOOL_MUTATION_NAMES = new Set([
  'create_task',
  'update_task',
  'complete_task',
  'move_task',
  'set_today',
  'parse_notes',
  'edit_scratchpad',
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
    normalized.includes('provider') ||
    normalized.includes('empty response')
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

type ConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export const buildConversationMessages = (input: {
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  userMessage: string;
}): ConversationMessage[] => {
  const normalizedHistory = input.history
    .map((entry) => ({
      role: entry.role,
      content: entry.content.trim(),
    }))
    .filter((entry) => entry.content.length > 0);

  const normalizedUserMessage = input.userMessage.trim();
  if (normalizedUserMessage.length === 0) {
    return normalizedHistory;
  }

  const last = normalizedHistory[normalizedHistory.length - 1];
  if (
    last?.role === 'user' &&
    last.content.trim().toLowerCase() === normalizedUserMessage.toLowerCase()
  ) {
    return normalizedHistory;
  }

  return [
    ...normalizedHistory,
    {
      role: 'user',
      content: normalizedUserMessage,
    },
  ];
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

const TASK_MUTATION_VERB_PATTERN =
  /\b(create|add|update|edit|complete|finish|move|schedule|plan|undo|mark|done|remove|delete|set|change|rename|prioritize|defer|remember|save|note|log)\b/i;
const TASK_ENTITY_PATTERN = /\b(task|todo|to-do|today|inbox)\b/i;
const TASK_CLARIFICATION_PATTERN =
  /\b(what(?:'| i)s the task|give me a title|title and any details|which task|clarify)\b/i;
const PRONOUN_WITH_VERB_PATTERN =
  /\b(mark|complete|finish|delete|remove|update|set|change|move|done)\b.*\b(it|that|this|them)\b|\b(it|that|this|them)\b.*\b(mark|complete|finish|delete|remove|update|set|change|move|done|as done|as complete)\b/i;
const CONFIRMATION_PATTERN =
  /^(yes|yeah|yep|do it|go ahead|sure|ok|okay|confirmed|approve|please|absolutely|definitely)\s*[.!]?\s*$/i;
const WEB_SEARCH_INTENT_PATTERN =
  /\b(search for|look up|find out|latest news|current price|stock price|price of)\b/i;

export const shouldRequireToolChoice = (input: {
  userMessage: string;
  history: ConversationMessage[];
  allowWebSearchToolChoice?: boolean;
}): boolean => {
  const normalizedMessage = input.userMessage.trim();
  if (normalizedMessage.length === 0) {
    return false;
  }

  const explicitCommand = parseExplicitFallbackToolCall(normalizedMessage);
  if (explicitCommand) {
    return true;
  }

  const mutationIntent =
    TASK_MUTATION_VERB_PATTERN.test(normalizedMessage) &&
    TASK_ENTITY_PATTERN.test(normalizedMessage);
  if (mutationIntent && !looksLikeQuestion(normalizedMessage)) {
    return true;
  }

  // Pronoun + strong verb pattern (e.g., "complete it", "mark that as done")
  if (PRONOUN_WITH_VERB_PATTERN.test(normalizedMessage)) {
    return true;
  }

  // Web search intent detection
  if (
    input.allowWebSearchToolChoice === true &&
    WEB_SEARCH_INTENT_PATTERN.test(normalizedMessage)
  ) {
    return true;
  }

  // Follow-up confirmation when there are pending actions
  if (CONFIRMATION_PATTERN.test(normalizedMessage)) {
    const pending = loadPendingActions();
    if (pending.length > 0) {
      return true;
    }
  }

  const lastAssistantMessage = [...input.history]
    .reverse()
    .find((entry) => entry.role === 'assistant');
  if (!lastAssistantMessage) {
    return false;
  }

  const isClarificationFollowup =
    TASK_CLARIFICATION_PATTERN.test(lastAssistantMessage.content.toLowerCase()) &&
    !looksLikeQuestion(normalizedMessage) &&
    normalizedMessage.split(/\s+/).length >= 2;

  return isClarificationFollowup;
};

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

export const generateToolCallDescription = (
  toolName: string,
  args: unknown,
): string => {
  const input = (args && typeof args === 'object' ? args : {}) as Record<string, unknown>;
  switch (toolName) {
    case 'create_task':
      return input.title ? `Creating task "${truncate(String(input.title), 60)}"` : 'Creating task';
    case 'update_task':
      return input.id ? `Updating task ${String(input.id)}` : 'Updating task';
    case 'complete_task':
      return input.id ? `Completing task ${String(input.id)}` : 'Completing task';
    case 'delete_task':
      return input.id ? `Deleting task ${String(input.id)}` : 'Deleting task';
    case 'move_task':
      return input.id ? `Moving task ${String(input.id)}` : 'Moving task';
    case 'set_today':
      return input.id ? `Updating Today list for task ${String(input.id)}` : 'Updating Today list';
    case 'suggest_daily_plan':
      return 'Generating daily plan';
    case 'parse_notes':
      return 'Extracting tasks from notes';
    case 'read_scratchpad':
      return 'Reading scratchpad';
    case 'edit_scratchpad':
      return input.action === 'rewrite'
        ? 'Rewriting scratchpad'
        : input.action === 'replace'
          ? 'Replacing scratchpad section'
          : 'Appending to scratchpad';
    case 'undo_last_action':
      return input.taskEventId ? `Undoing event ${String(input.taskEventId)}` : 'Undoing last action';
    case 'write_journal':
      return 'Writing journal entry';
    case 'read_journal':
      return 'Reading journal entries';
    case 'generate_live_thought':
      return 'Generating live thought';
    case 'update_user_profile':
      return 'Saving profile memory';
    case 'update_patterns':
      return 'Saving workflow pattern';
    case 'improve_task':
      return input.id ? `Analyzing task ${String(input.id)}` : 'Analyzing task';
    case 'list_tasks':
      return input.search ? `Searching tasks for "${truncate(String(input.search), 40)}"` : 'Listing tasks';
    case 'get_task':
      return input.id ? `Loading task ${String(input.id)}` : 'Loading task';
    case 'fetch_url':
      return input.url ? `Fetching ${truncate(String(input.url), 60)}` : 'Fetching URL';
    default:
      return `Running ${toolName}`;
  }
};

const generateToolCallSummary = (
  toolName: string,
  envelope: ToolExecutionEnvelope | null,
): string => {
  if (!envelope) {
    return `${toolName} completed.`;
  }
  return truncate(envelope.message, 120);
};

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
    tokenBudget: input.tokenBudget ?? DEFAULT_TOKEN_BUDGET,
    memory,
    liveContext,
    modelId,
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
  let reasoningText = '';
  const stepDescriptions: string[] = [];
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
          tokenBudget: input.tokenBudget ?? DEFAULT_TOKEN_BUDGET,
          memory,
          liveContext,
          modelId: input.modelId,
        });

        const provider = createOpenRouterProviderFromEnv();
        const model = provider.chat(input.modelId);
        const webSearchConfig = getModelWebSearchConfig(input.modelId);
        const recentHistory = getRecentChatMessages(HISTORY_WINDOW_LIMIT).filter(
          (message) => message.role === 'user' || message.role === 'assistant',
        );
        const conversationMessages = buildConversationMessages({
          history: recentHistory.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          userMessage: input.userMessage,
        });
        const requireToolChoice = shouldRequireToolChoice({
          userMessage: input.userMessage,
          history: conversationMessages,
          allowWebSearchToolChoice: false,
        });

        const result = streamText({
          model,
          system: builtPrompt.modelInputPrompt,
          messages: conversationMessages,
          toolChoice: requireToolChoice ? 'required' : 'auto',
          stopWhen: stepCountIs(STREAM_TOOL_LOOP_MAX_STEPS),
          prepareStep: async ({ steps }) => {
            const failedTools = new Set<string>();
            const toolCallsByStep: string[][] = [];

            for (const step of steps) {
              const stepToolNames: string[] = [];
              for (const part of step.content) {
                if (part.type === 'tool-call') stepToolNames.push(part.toolName);
                if (part.type === 'tool-error') failedTools.add(part.toolName);
                if (
                  part.type === 'tool-result' &&
                  typeof part.output === 'object' && part.output !== null &&
                  'status' in part.output && part.output.status === 'error'
                ) {
                  failedTools.add(part.toolName);
                }
              }
              toolCallsByStep.push(stepToolNames);
            }

            // If any tool failed, force text response
            if (failedTools.size > 0) {
              return { toolChoice: 'none' as const };
            }

            // Detect same tool in consecutive steps (spiral)
            if (toolCallsByStep.length >= 2) {
              const last = toolCallsByStep[toolCallsByStep.length - 1];
              const prev = toolCallsByStep[toolCallsByStep.length - 2];
              if (last.some(name => prev.includes(name))) {
                return { toolChoice: 'none' as const };
              }
            }

            // After first step, relax toolChoice
            if (steps.length > 0) {
              return { toolChoice: 'auto' as const };
            }

            return {};
          },
          tools: (() => {
            const sdkTools = createSdkTools({
              onActionCard: (card) => {
                actionCards.push(card);
              },
            });

            // Use AI SDK provider-defined tool shape to avoid unsupported raw tool injection.
            if (webSearchConfig.supportsWebSearch && webSearchConfig.webSearchMethod) {
              (sdkTools as Record<string, unknown>).web_search = provider.tools.webSearch({
                searchContextSize: 'medium',
              });
            }

            return sdkTools;
          })() as Parameters<typeof streamText>[0]['tools'],
        });

        for await (const part of result.fullStream) {
          if (isChatRequestCanceled(input.requestId)) {
            return;
          }

          switch (part.type) {
            case 'reasoning-delta': {
              reasoningText += part.text;
              emit({
                type: 'reasoning',
                requestId: input.requestId,
                text: part.text,
              });
              break;
            }
            case 'reasoning-start':
            case 'reasoning-end':
              break;
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
              const description = generateToolCallDescription(part.toolName, part.input);
              stepDescriptions.push(description);
              emit({
                type: 'tool_call_started',
                requestId: input.requestId,
                toolName: part.toolName,
                toolCallId: part.toolCallId,
                description,
              });
              break;
            }
            case 'tool-result': {
              attemptHadToolExecution = true;
              const envelope = toToolExecutionEnvelope(part.output);
              const status = envelope?.status ?? 'success';
              const message = envelope?.message ?? `${part.toolName} completed.`;
              const summary = generateToolCallSummary(part.toolName, envelope);
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
                summary,
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
                summary: message,
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
            const fallbackDescription = generateToolCallDescription(fallbackCall.name, fallbackCall.input);
            stepDescriptions.push(fallbackDescription);

            emit({
              type: 'tool_call_started',
              requestId: input.requestId,
              toolName: fallbackCall.name,
              toolCallId: fallbackToolCallId,
              description: fallbackDescription,
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
              const fallbackSummary = generateToolCallSummary(fallbackResult.toolName, fallbackResult.output);
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
                summary: fallbackSummary,
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
                summary: fallbackResult.error.message,
              });
            }
          }
        }

        finalizedTextFromModel = (await result.text).trim() || assistantText.trim();
        if (finalizedTextFromModel.length === 0 && toolExecutions.length === 0) {
          throw new Error('Provider returned empty response.');
        }
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
      ...(reasoningText.length > 0 ? { reasoningText } : {}),
      ...(stepDescriptions.length > 0 ? { stepDescriptions } : {}),
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
