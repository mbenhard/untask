import { randomUUID } from 'node:crypto';

import { generateText, stepCountIs, streamText, type ModelMessage } from 'ai';

import type {
  ChipAction,
  ChatNoteContext,
  ChatStreamErrorCode,
  ChatSendResultPayload,
  ChatStreamEvent,
  ChatTurnTelemetry,
  ChatToolExecutionSummary,
  PersistedChatToolMetadata,
} from '../../types/chat';
import type { ProactiveTriggerType } from '../../types/assistant';
import {
  DEFAULT_CONVERSATION_TITLE,
  canAutoTitleConversation,
  ensureConversation,
  getConversationMessageCount,
  getMostRecentConversation,
  getRecentConversationMessages,
  saveChatMessage,
  setConversationTitle,
  sweepChatRetention,
} from '../services/chatService';
import { writeJournalEntry } from '../services/journalService';
import { getSetting, setSetting } from '../services/settingsService';

import { buildCanonicalRuntimeContext } from './contextBuilder';
import { scheduleKnowledgeExtraction } from './knowledgeExtractor';
import { createOpenRouterProviderFromEnv } from './openrouter';
import type { ChatModelId } from './models';
import { getSelectedModelId, getModelWebSearchConfig, modelSupportsVision, resolveModelId } from './models';
import { buildSystemPrompt } from './systemPrompt';
import type { AiToolCall, ToolExecutionEnvelope } from './tools';
import { createSdkTools, executeToolCall } from './tools';
import { loadPendingActions } from './autonomy';

const activeChatRequestIds = new Set<string>();
const canceledChatRequestIds = new Set<string>();
const AUTO_JOURNAL_LAST_WRITE_AT_KEY = 'ai_journal_last_auto_write_at';
const AUTO_JOURNAL_COOLDOWN_MS = 20 * 60 * 1000;
const STREAM_MAX_ATTEMPTS = 2;
const STREAM_RETRY_BASE_DELAY_MS = 400;
const HISTORY_WINDOW_LIMIT = 60;
const STREAM_TOOL_LOOP_MAX_STEPS = 25;
const AUTO_TITLE_MODEL_ID = 'openai/gpt-4o-mini';
const AUTO_TITLE_TIMEOUT_MS = 5_000;
const AUTO_TITLE_MAX_LENGTH = 80;
const TOOL_MUTATION_NAMES = new Set([
  'create_task',
  'update_task',
  'complete_task',
  'move_task',
  'set_today',
  'parse_notes',
  'edit_note',
  'undo_last_action',
  'update_identity',
  'update_memory',
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
    normalized.includes('empty response') ||
    normalized.includes('inactivity timeout')
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

const CHIP_SECTION_HEADING_PATTERN =
  /^\s*(?:\*\*)?(?:action|response|quick|suggested)?\s*chips?\s*:?\s*(?:\*\*)?\s*$/i;
const OPTION_SECTION_HEADING_PATTERN =
  /^\s*(?:\*\*)?(?:options|quick\s*replies|suggestions|here\s*are\s*(?:some|your|the)\s*options)\s*:?\s*(?:\*\*)?\s*$/i;
const CHIP_LIST_ITEM_PREFIX_PATTERN =
  /^\s*(?:[-*•]|\d+[.)]|[•●○◦▪▫]|\p{Extended_Pictographic})\s*/u;

const stripChipListPrefix = (line: string): string =>
  line
    .trim()
    .replace(/^(?:[-*•]|\d+[.)])\s+/, '')
    .replace(/^(?:[•●○◦▪▫])\s+/, '')
    .replace(/^(?:\p{Extended_Pictographic}|\uFE0F|\u200D)+\s*/u, '')
    .replace(/\s+/g, ' ')
    .trim();

const looksLikeChipOptionLine = (line: string): boolean => {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return false;
  }

  if (CHIP_LIST_ITEM_PREFIX_PATTERN.test(line)) {
    return true;
  }

  return trimmed.length <= 48 && !/[.:;]$/.test(trimmed);
};

const isChipSectionHeading = (line: string): boolean =>
  CHIP_SECTION_HEADING_PATTERN.test(line) || OPTION_SECTION_HEADING_PATTERN.test(line);

const extractChipBlockFromLines = (
  lines: string[],
  headerIndex: number,
): { chipLabels: string[]; endIndex: number } => {
  const chipLabels: string[] = [];
  let endIndex = headerIndex;

  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      if (chipLabels.length > 0) {
        endIndex = index;
        break;
      }
      continue;
    }

    if (!looksLikeChipOptionLine(line)) {
      if (chipLabels.length > 0) {
        endIndex = index - 1;
      }
      break;
    }

    const cleaned = stripChipListPrefix(line)
      .replace(/^["'`]+|["'`]+$/g, '')
      .trim();

    if (cleaned.length === 0) {
      continue;
    }

    chipLabels.push(cleaned.slice(0, 40));
    endIndex = index;

    if (chipLabels.length >= 4) {
      break;
    }
  }

  return { chipLabels, endIndex };
};

export const extractInlineChipBlock = (
  text: string,
): { text: string; chips: ChipAction[] } | null => {
  const lines = text.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => isChipSectionHeading(line));

  if (headerIndex === -1) {
    return null;
  }

  const { chipLabels, endIndex } = extractChipBlockFromLines(lines, headerIndex);

  const uniqueLabels = Array.from(new Set(chipLabels));
  if (uniqueLabels.length < 2) {
    return null;
  }

  const chips: ChipAction[] = uniqueLabels.map((label) => ({
    label,
    type: 'response',
    responseText: label,
  }));

  const keptLines = lines.filter((_, index) => index < headerIndex || index > endIndex);
  const cleanedText = keptLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  return {
    text: cleanedText.length > 0 ? cleanedText : text.trim(),
    chips,
  };
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

const normalizeConversationTitle = (raw: string): string => {
  const trimmed = raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/[.]+$/g, '')
    .replace(/\s+/g, ' ');

  if (trimmed.length === 0) {
    return '';
  }

  return trimmed.length <= AUTO_TITLE_MAX_LENGTH
    ? trimmed
    : `${trimmed.slice(0, AUTO_TITLE_MAX_LENGTH - 3).trimEnd()}...`;
};

const fallbackConversationTitleFromUserMessage = (userMessage: string): string => {
  const normalized = normalizeConversationTitle(userMessage);
  if (normalized.length === 0) {
    return DEFAULT_CONVERSATION_TITLE;
  }

  return normalized.length <= 40
    ? normalized
    : `${normalized.slice(0, 37).trimEnd()}...`;
};

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeoutPromise = new Promise<T>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Timed out.')), timeoutMs);
    });

    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

const maybeAutoTitleConversation = async (input: {
  conversationId: string;
  userMessage: string;
}): Promise<void> => {
  if (!canAutoTitleConversation(input.conversationId)) {
    return;
  }

  if (getConversationMessageCount(input.conversationId) < 2) {
    return;
  }

  const fallback = fallbackConversationTitleFromUserMessage(input.userMessage);
  let resolvedTitle = fallback;

  try {
    const provider = createOpenRouterProviderFromEnv();
    const model = provider.chat(AUTO_TITLE_MODEL_ID);
    const titlePrompt = [
      'Generate a concise chat thread title.',
      'Rules:',
      '- 3 to 6 words.',
      '- Use specific keywords and action verbs.',
      '- No quotes.',
      '- No trailing period.',
      '- Output only the title text.',
      `User message: ${input.userMessage.trim()}`,
    ].join('\n');

    const generated = await withTimeout(
      generateText({
        model,
        messages: [{ role: 'user', content: titlePrompt }],
        maxOutputTokens: 24,
      }),
      AUTO_TITLE_TIMEOUT_MS,
    );

    const normalized = normalizeConversationTitle(generated.text);
    if (normalized.length > 0) {
      resolvedTitle = normalized;
    }
  } catch {
    // Keep fallback title when generation fails or times out.
  }

  if (!canAutoTitleConversation(input.conversationId)) {
    return;
  }

  setConversationTitle(input.conversationId, resolvedTitle, false);
};

export const generateToolCallDescription = (
  toolName: string,
  args: unknown,
): string => {
  const input = (args && typeof args === 'object' ? args : {}) as Record<string, unknown>;
  switch (toolName) {
    case 'create_task':
      return input.title ? `Creating task "${truncate(String(input.title), 60)}"` : 'Creating task';
    case 'update_task':
      return 'Updating task…';
    case 'complete_task':
      return 'Completing task…';
    case 'delete_task':
      return 'Deleting task…';
    case 'move_task':
      return 'Moving task…';
    case 'set_today':
      return 'Updating Today list…';
    case 'suggest_daily_plan':
      return 'Generating daily plan';
    case 'parse_notes':
      return 'Extracting tasks from notes';
    case 'read_note':
      return 'Reading note';
    case 'edit_note':
      return input.action === 'rewrite'
        ? 'Rewriting note'
        : input.action === 'replace'
          ? 'Replacing note section'
          : 'Appending to note';
    case 'undo_last_action':
      return 'Undoing last action…';
    case 'write_journal':
      return 'Writing journal entry';
    case 'read_journal':
      return 'Reading journal entries';
    case 'update_identity':
      return 'Updating identity document';
    case 'update_memory':
      return input.section ? `Updating memory section "${truncate(String(input.section), 30)}"` : 'Updating memory';
    case 'search_journal':
      return input.query ? `Searching journal for "${truncate(String(input.query), 30)}"` : 'Searching journal';
    case 'search_chat_history':
      return input.query
        ? `Searching chat history for "${truncate(String(input.query), 30)}"`
        : 'Searching chat history';
    case 'emit_chips':
      return 'Attaching chips';
    case 'improve_task':
      return 'Analyzing task…';
    case 'list_tasks':
      return input.search ? `Searching tasks for "${truncate(String(input.search), 40)}"` : 'Listing tasks';
    case 'get_task':
      return 'Loading task…';
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

const runAssistantStream = async (
  input: {
    requestId: string;
    conversationId: string;
    userMessage: string;
    modelId: ChatModelId;
    images?: string[];
    noteContext?: ChatNoteContext;
    tokenBudget?: number;
    emit: (event: ChatStreamEvent) => void;
  },
): Promise<void> => {
  const actionCards: PersistedChatToolMetadata['actionCards'] = [];
  const toolExecutions: ChatToolExecutionSummary[] = [];
  const mutationSignatures = new Set<string>();
  const telemetry: ChatTurnTelemetry = {
    startedAt: new Date().toISOString(),
    attemptCount: 0,
  };

  const emit = input.emit;
  let assistantText = '';
  let reasoningText = '';
  const stepDescriptions: string[] = [];
  let finalizedTextFromModel = '';
  let emittedChips: ChipAction[] | undefined;
  let cachedPrompt: ReturnType<typeof buildSystemPrompt> | null = null;

  try {
    let streamCompleted = false;

    for (let attempt = 1; attempt <= STREAM_MAX_ATTEMPTS; attempt += 1) {
      telemetry.attemptCount = attempt;
      let attemptHadToolExecution = false;

      try {
        let builtPrompt: ReturnType<typeof buildSystemPrompt> | null = cachedPrompt;
        if (!builtPrompt) {
          const { liveContext } = buildCanonicalRuntimeContext();
          builtPrompt = buildSystemPrompt({
            userMessage: input.userMessage,
            liveContext,
            modelId: input.modelId,
          });
          cachedPrompt = builtPrompt;
        }

        if (!builtPrompt) {
          throw new Error('Failed to build chat system prompt.');
        }

        const provider = createOpenRouterProviderFromEnv();
        const model = provider.chat(input.modelId);
        const webSearchConfig = getModelWebSearchConfig(input.modelId);
        const noteContextPrompt =
          input.noteContext &&
          input.noteContext.noteId.trim().length > 0 &&
          input.noteContext.markdown.trim().length > 0
            ? [
                'Attached note context:',
                `- note_id: ${input.noteContext.noteId}`,
                `- title: ${input.noteContext.title}`,
                input.noteContext.markdown,
              ].join('\n')
            : null;
        const recentHistory = getRecentConversationMessages(
          input.conversationId,
          HISTORY_WINDOW_LIMIT,
        ).filter(
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

        // Build final messages, converting last user message to multimodal if images present
        const images = input.images ?? [];
        const hasImages = images.length > 0;
        const visionCapable = modelSupportsVision(input.modelId);

        const sdkMessages: ModelMessage[] = conversationMessages.map((msg, idx) => {
          const isLastUserMessage = idx === conversationMessages.length - 1 && msg.role === 'user';

          if (isLastUserMessage && hasImages) {
            if (visionCapable) {
              // Build multimodal content with images + text
              const parts: Array<{ type: 'image'; image: string } | { type: 'text'; text: string }> = [];
              for (const dataUrl of images) {
                parts.push({ type: 'image', image: dataUrl });
              }
              parts.push({ type: 'text', text: msg.content });
              return { role: 'user', content: parts };
            }

            // Non-vision model: strip images, prepend note
            const note = `[User attached ${images.length} image(s), but the current model doesn't support vision.]\n\n`;
            return { role: 'user', content: note + msg.content };
          }

          if (msg.role === 'assistant') {
            return { role: 'assistant', content: msg.content };
          }

          return { role: 'user', content: msg.content };
        });

        // Inactivity timeout: abort stream if no chunks arrive for 90 seconds
        const STREAM_INACTIVITY_TIMEOUT_MS = 90_000;
        const inactivityAbort = new AbortController();
        let inactivityTimer: NodeJS.Timeout | null = null;

        const clearInactivityTimer = (): void => {
          if (inactivityTimer) {
            clearTimeout(inactivityTimer);
            inactivityTimer = null;
          }
        };

        const resetInactivityTimer = (): void => {
          clearInactivityTimer();
          inactivityTimer = setTimeout(() => {
            inactivityTimer = null;
            inactivityAbort.abort(
              new Error('Stream inactivity timeout: no data received for 90 seconds.'),
            );
          }, STREAM_INACTIVITY_TIMEOUT_MS);
        };

        resetInactivityTimer();

        const result = streamText({
          model,
          abortSignal: inactivityAbort.signal,
          system: noteContextPrompt
            ? `${builtPrompt.modelInputPrompt}\n\n${noteContextPrompt}`
            : builtPrompt.modelInputPrompt,
          messages: sdkMessages,
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
              activeNoteId: input.noteContext?.noteId,
              mutationSignatures,
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
          resetInactivityTimer();

          if (isChatRequestCanceled(input.requestId)) {
            clearInactivityTimer();
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

              // Capture chips from emit_chips tool results
              let toolChips: ChipAction[] | undefined;
              if (
                part.toolName === 'emit_chips' &&
                status === 'success' &&
                envelope?.data &&
                typeof envelope.data === 'object' &&
                'chips' in envelope.data &&
                Array.isArray((envelope.data as Record<string, unknown>).chips)
              ) {
                toolChips = (envelope.data as Record<string, unknown>).chips as ChipAction[];
                emittedChips = toolChips;
              }

              emit({
                type: 'tool_call_completed',
                requestId: input.requestId,
                toolName: part.toolName,
                toolCallId: part.toolCallId,
                status,
                message,
                summary,
                actionCard,
                ...(toolChips ? { chips: toolChips } : {}),
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

        clearInactivityTimer();

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
              activeNoteId: input.noteContext?.noteId,
              mutationSignatures,
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
          if (attemptHadToolExecution || toolExecutions.length > 0) {
            cachedPrompt = null;
          }
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
    const inlineChips = emittedChips ? null : extractInlineChipBlock(finalizedText);
    const outputText = inlineChips?.text ?? finalizedText;
    if (!emittedChips && inlineChips?.chips) {
      emittedChips = inlineChips.chips;
    }

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
      ...(emittedChips ? { chips: emittedChips } : {}),
    };

    if (isChatRequestCanceled(input.requestId)) {
      return;
    }

    const assistantMessage = saveChatMessage({
      conversationId: input.conversationId,
      role: 'assistant',
      content:
        outputText.length > 0
          ? outputText
          : 'No assistant text was generated for this turn.',
      toolCalls: JSON.stringify(metadata),
      chips: emittedChips ? JSON.stringify(emittedChips) : null,
    });

    void maybeAutoTitleConversation({
      conversationId: input.conversationId,
      userMessage: input.userMessage,
    });

    maybeWriteMeaningfulInteractionJournal({
      userMessage: input.userMessage,
      assistantText: outputText,
      toolExecutions,
    });

    scheduleKnowledgeExtraction({
      userMessage: input.userMessage,
      assistantResponse: outputText,
      requestId: input.requestId,
      emit,
    });

    if (isChatRequestCanceled(input.requestId)) {
      return;
    }

    emit({
      type: 'assistant_done',
      requestId: input.requestId,
      assistantMessage,
      actionCards,
      ...(emittedChips ? { chips: emittedChips } : {}),
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

    void runAssistantStream({
      requestId,
      conversationId: conversation.id,
      userMessage: content,
      modelId,
      images,
      noteContext,
      tokenBudget: input.tokenBudget,
      emit: input.emit,
    });

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
};

// ─── Proactive turn (no user message saved) ─────────────────

export type StartProactiveTurnInput = {
  triggerMessage: string;
  triggerType: ProactiveTriggerType;
  conversationId?: string;
  emit: (event: ChatStreamEvent) => void;
};

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

  // No user message saved to DB — synthetic trigger is invisible to chat history.
  // The assistant response will be saved by runAssistantStream as normal.
  await runAssistantStream({
    requestId,
    conversationId: conversation.id,
    userMessage: input.triggerMessage,
    modelId,
    emit: input.emit,
  });
};
