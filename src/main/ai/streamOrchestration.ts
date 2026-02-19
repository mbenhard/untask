import { randomUUID } from 'node:crypto';

import { app } from 'electron';
import { generateText, stepCountIs, streamText, type ModelMessage } from 'ai';

import type {
  ChipAction,
  ChatNoteContext,
  ChatStreamEvent,
  ChatTurnTelemetry,
  ChatToolExecutionSummary,
  PersistedChatToolMetadata,
} from '../../types/chat';
import {
  getRecentConversationMessages,
  saveChatMessage,
} from '../services/chatService';
import { buildCanonicalRuntimeContext } from './contextBuilder';
import { getActiveProvider } from './providers';
import { getModelWebSearchConfig, modelSupportsVision } from './models';
import { buildSystemPrompt } from './systemPrompt';
import type { AiToolCall, AiToolName, ToolExecutionEnvelope } from './tools';
import { createSdkTools, executeToolCall, OLLAMA_ALLOWED_TOOLS } from './tools';
import { isOllamaProvider } from './models';
import { loadPendingActions } from './autonomy';
import { classifyChatError, shouldRetryStreamAttempt } from './errorClassification';
import { maybeAutoTitleConversation } from './autoTitle';

export const STREAM_MAX_ATTEMPTS = 2;
const STREAM_RETRY_BASE_DELAY_MS = 400;
const HISTORY_WINDOW_LIMIT = 20;
const STREAM_TOOL_LOOP_MAX_STEPS = 25;

// ─── Ollama slim mode ───────────────────────────────────────
// When true, Ollama gets fewer tools, shorter prompt, reduced history.
// Set to false to revert Ollama to full cloud-equivalent behavior.
const OLLAMA_SLIM_MODE = true;
const OLLAMA_HISTORY_WINDOW_LIMIT = 10;
const OLLAMA_TOOL_LOOP_MAX_STEPS = 5;

export type ConversationMessage = {
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

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const computeRetryDelayMs = (): number =>
  STREAM_RETRY_BASE_DELAY_MS + Math.floor(Math.random() * 200);

const hasString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export const toToolExecutionEnvelope = (
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

// ─── Chip extraction helpers ────────────────────────────────────

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

/**
 * Try to parse an `[emit_chips:{...}]` JSON block that the model may embed
 * inline when it cannot call the emit_chips tool (e.g., toolChoice forced to
 * 'none' after a tool failure).
 */
const extractInlineEmitChipsJson = (
  text: string,
): { text: string; chips: ChipAction[] } | null => {
  const pattern = /\[emit_chips:\s*(\{[\s\S]*?\})\s*\]/;
  const match = text.match(pattern);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[1]) as { chips?: Array<{ label: string; responseText?: string }> };
    if (!Array.isArray(parsed.chips) || parsed.chips.length < 2) return null;

    const chips: ChipAction[] = parsed.chips.slice(0, 4).map((c) => ({
      label: (c.label ?? '').slice(0, 40),
      type: 'response',
      responseText: c.responseText?.trim() || c.label,
    }));

    const cleanedText = text.replace(pattern, '').replace(/\n{3,}/g, '\n\n').trim();
    return { text: cleanedText.length > 0 ? cleanedText : text.trim(), chips };
  } catch {
    return null;
  }
};

/**
 * Try to parse an `<emit_chips>...</emit_chips>` XML block that small models
 * may produce when they can't reliably format tool calls.
 */
const extractInlineEmitChipsXml = (
  text: string,
): { text: string; chips: ChipAction[] } | null => {
  const xmlPattern = /<emit_chips>\s*(\{[\s\S]*?\})\s*<\/emit_chips>/;
  const match = text.match(xmlPattern);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[1]) as { chips?: Array<{ label: string; responseText?: string }> };
    if (!Array.isArray(parsed.chips) || parsed.chips.length < 2) return null;

    const chips: ChipAction[] = parsed.chips.slice(0, 4).map((c) => ({
      label: (c.label ?? '').slice(0, 40),
      type: 'response',
      responseText: c.responseText?.trim() || c.label,
    }));

    const cleanedText = text.replace(xmlPattern, '').replace(/\n{3,}/g, '\n\n').trim();
    return { text: cleanedText.length > 0 ? cleanedText : text.trim(), chips };
  } catch {
    return null;
  }
};

export const extractInlineChipBlock = (
  text: string,
): { text: string; chips: ChipAction[] } | null => {
  // First try the JSON [emit_chips:...] format
  const jsonResult = extractInlineEmitChipsJson(text);
  if (jsonResult) return jsonResult;

  // Then try the XML <emit_chips>...</emit_chips> format
  const xmlResult = extractInlineEmitChipsXml(text);
  if (xmlResult) return xmlResult;

  // Fall back to section-heading + bullet-list format
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

// ─── Tool call description helpers ──────────────────────────────

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
      return 'Updating task\u2026';
    case 'complete_task':
      return 'Completing task\u2026';
    case 'delete_task':
      return 'Deleting task\u2026';
    case 'read_note':
      return 'Reading note';
    case 'edit_note':
      return input.action === 'rewrite'
        ? 'Rewriting note'
        : input.action === 'replace'
          ? 'Replacing note section'
          : 'Appending to note';
    case 'undo_last_action':
      return 'Undoing last action\u2026';
    case 'update_memory':
      return input.section ? `Updating memory section "${truncate(String(input.section), 30)}"` : 'Updating memory';
    case 'emit_chips':
      return 'Attaching chips';
    case 'list_tasks':
      return input.search ? `Searching tasks for "${truncate(String(input.search), 40)}"` : 'Listing tasks';
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

// ─── Explicit fallback tool call parsing ────────────────────────

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

// ─── Tool choice heuristic ──────────────────────────────────────

const CONFIRMATION_PATTERN =
  /^(yes|yeah|yep|do it|go ahead|sure|ok|okay|confirmed|approve|please|absolutely|definitely)\s*[.!]?\s*$/i;

export const shouldRequireToolChoice = (input: {
  userMessage: string;
  history: ConversationMessage[];
  allowWebSearchToolChoice?: boolean;
}): boolean => {
  const normalizedMessage = input.userMessage.trim();
  if (normalizedMessage.length === 0) {
    return false;
  }

  // Only force tool use for very explicit, unambiguous commands
  const explicitCommand = parseExplicitFallbackToolCall(normalizedMessage);
  if (explicitCommand) {
    return true;
  }

  // Follow-up confirmation when there are pending actions
  if (CONFIRMATION_PATTERN.test(normalizedMessage)) {
    const pending = loadPendingActions();
    if (pending.length > 0) {
      return true;
    }
  }

  return false;
};

// ─── Main stream orchestration ──────────────────────────────────

export const runAssistantStream = async (
  input: {
    requestId: string;
    conversationId: string;
    userMessage: string;
    modelId: string;
    images?: string[];
    noteContext?: ChatNoteContext;
    tokenBudget?: number;
    allowedTools?: ReadonlySet<AiToolName>;
    emit: (event: ChatStreamEvent) => void;
  },
  chatState: {
    isCanceled: (requestId: string) => boolean;
    removeRequest: (requestId: string) => void;
    removeCanceled: (requestId: string) => void;
  },
): Promise<void> => {
  const actionCards: PersistedChatToolMetadata['actionCards'] = [];
  const toolExecutions: ChatToolExecutionSummary[] = [];
  const mutationSignatures = new Set<string>();
  const telemetry: ChatTurnTelemetry = {
    startedAt: new Date().toISOString(),
    attemptCount: 0,
  };

  const isDev = !app.isPackaged;
  const t0 = isDev ? performance.now() : 0;
  let tFirstReasoning = 0;
  let tFirstToken = 0;
  let tFirstToolCall = 0;
  let tokenCount = 0;
  let reasoningTokenCount = 0;

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
        const ollamaSlim = OLLAMA_SLIM_MODE && isOllamaProvider();

        let builtPrompt: ReturnType<typeof buildSystemPrompt> | null = cachedPrompt;
        if (!builtPrompt) {
          const { liveContext } = buildCanonicalRuntimeContext();
          builtPrompt = buildSystemPrompt({
            userMessage: input.userMessage,
            liveContext,
            modelId: input.modelId,
            isSlimMode: ollamaSlim,
          });
          cachedPrompt = builtPrompt;
        }

        if (!builtPrompt) {
          throw new Error('Failed to build chat system prompt.');
        }

        const provider = getActiveProvider();
        const model = provider.languageModel(input.modelId);
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
        const historyLimit = ollamaSlim ? OLLAMA_HISTORY_WINDOW_LIMIT : HISTORY_WINDOW_LIMIT;
        const recentHistory = getRecentConversationMessages(
          input.conversationId,
          historyLimit,
        ).filter(
          (message) => message.role === 'user' || message.role === 'assistant',
        );
        if (isDev) {
          const promptChars = (noteContextPrompt
            ? `${builtPrompt.modelInputPrompt}\n\n${noteContextPrompt}`
            : builtPrompt.modelInputPrompt
          ).length;
          const estimatedPromptTokens = Math.round(promptChars / 4);
          const estimatedHistoryTokens = Math.round(
            recentHistory.reduce((acc, m) => acc + m.content.length, 0) / 4,
          );
          const estimatedToolSchemaTokens = 1100;
          const totalEstimatedTokens =
            estimatedPromptTokens + estimatedHistoryTokens + estimatedToolSchemaTokens;
          console.log(
            `[chat-stream] start: model=${input.modelId}` +
            ` | history=${recentHistory.length}` +
            ` | images=${input.images?.length ?? 0}` +
            ` | ~tokens=${totalEstimatedTokens} (sys=${estimatedPromptTokens} tools=${estimatedToolSchemaTokens} hist=${estimatedHistoryTokens})`,
          );
        }

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
          stopWhen: stepCountIs(ollamaSlim ? OLLAMA_TOOL_LOOP_MAX_STEPS : STREAM_TOOL_LOOP_MAX_STEPS),
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
          experimental_repairToolCall: async ({ toolCall, error, inputSchema }) => {
            try {
              const schema = await inputSchema({ toolName: toolCall.toolName });
              const { text: repairedArgs } = await generateText({
                model,
                system: [
                  'You are a JSON repair assistant. The previous tool call had an error.',
                  `Tool: ${toolCall.toolName}`,
                  `Error: ${error.message}`,
                  `Schema: ${JSON.stringify(schema)}`,
                  'Respond ONLY with a valid JSON object matching the schema. No explanation.',
                ].join('\n'),
                messages: [
                  { role: 'user', content: `Fix this tool call input: ${toolCall.input}` },
                ],
              });

              const parsed = JSON.parse(repairedArgs.trim());
              return { ...toolCall, input: JSON.stringify(parsed) };
            } catch {
              return null;
            }
          },
          tools: (() => {
            const effectiveAllowedTools =
              ollamaSlim && !input.allowedTools
                ? OLLAMA_ALLOWED_TOOLS
                : input.allowedTools;

            const sdkTools = createSdkTools({
              onActionCard: (card) => {
                actionCards.push(card);
              },
              activeNoteId: input.noteContext?.noteId,
              mutationSignatures,
            }, effectiveAllowedTools);

            // Use AI SDK provider-defined tool shape to avoid unsupported raw tool injection.
            if (webSearchConfig.supportsWebSearch && webSearchConfig.webSearchMethod && provider.tools) {
              const webSearch = provider.tools.webSearch as ((config: { searchContextSize: string }) => unknown) | undefined;
              if (webSearch) {
                (sdkTools as Record<string, unknown>).web_search = webSearch({
                  searchContextSize: 'medium',
                });
              }
            }

            return sdkTools;
          })() as Parameters<typeof streamText>[0]['tools'],
        });

        // ── <think> tag parser state machine ──────────────────────
        // Reclassifies text containing <think>...</think> tags into
        // reasoning events. Handles partial tags split across chunks.
        let thinkState: 'normal' | 'inThinking' = 'normal';
        let thinkBuffer = '';

        const flushThinkBuffer = (forceState?: 'normal' | 'inThinking'): void => {
          const state = forceState ?? thinkState;
          if (thinkBuffer.length === 0) return;
          if (state === 'inThinking') {
            reasoningText += thinkBuffer;
            emit({ type: 'reasoning', requestId: input.requestId, text: thinkBuffer });
            if (isDev && !tFirstReasoning) {
              tFirstReasoning = performance.now();
              console.log(`[chat-stream] first reasoning: ${(tFirstReasoning - t0).toFixed(0)}ms`);
            }
            if (isDev) reasoningTokenCount++;
          } else {
            assistantText += thinkBuffer;
            emit({ type: 'token', requestId: input.requestId, text: thinkBuffer });
            if (isDev && !tFirstToken) {
              tFirstToken = performance.now();
              console.log(`[chat-stream] first token: ${(tFirstToken - t0).toFixed(0)}ms`);
            }
            if (isDev) tokenCount++;
          }
          thinkBuffer = '';
        };

        const processThinkText = (text: string): void => {
          thinkBuffer += text;

          // eslint-disable-next-line no-constant-condition
          while (true) {
            if (thinkState === 'normal') {
              const openIdx = thinkBuffer.indexOf('<think>');
              if (openIdx !== -1) {
                // Flush text before <think> as normal token
                const before = thinkBuffer.slice(0, openIdx);
                if (before.length > 0) {
                  assistantText += before;
                  emit({ type: 'token', requestId: input.requestId, text: before });
                  if (isDev && !tFirstToken) {
                    tFirstToken = performance.now();
                    console.log(`[chat-stream] first token: ${(tFirstToken - t0).toFixed(0)}ms`);
                  }
                  if (isDev) tokenCount++;
                }
                thinkBuffer = thinkBuffer.slice(openIdx + 7); // skip '<think>'
                thinkState = 'inThinking';
                continue;
              }
              // Check for potential partial '<think>' at end of buffer
              // Keep last 6 chars (length of '<think' minus 1) if they start with '<'
              const partialCheckLen = Math.min(thinkBuffer.length, 6);
              const tail = thinkBuffer.slice(-partialCheckLen);
              const ltIdx = tail.lastIndexOf('<');
              if (ltIdx !== -1 && '<think>'.startsWith(tail.slice(ltIdx))) {
                // Potential partial tag — flush everything before it
                const safeEnd = thinkBuffer.length - partialCheckLen + ltIdx;
                if (safeEnd > 0) {
                  const safe = thinkBuffer.slice(0, safeEnd);
                  assistantText += safe;
                  emit({ type: 'token', requestId: input.requestId, text: safe });
                  if (isDev && !tFirstToken) {
                    tFirstToken = performance.now();
                    console.log(`[chat-stream] first token: ${(tFirstToken - t0).toFixed(0)}ms`);
                  }
                  if (isDev) tokenCount++;
                }
                thinkBuffer = thinkBuffer.slice(safeEnd);
              } else {
                // No partial tag — flush entire buffer
                flushThinkBuffer();
              }
              break;
            } else {
              // inThinking
              const closeIdx = thinkBuffer.indexOf('</think>');
              if (closeIdx !== -1) {
                // Flush text before </think> as reasoning
                const before = thinkBuffer.slice(0, closeIdx);
                if (before.length > 0) {
                  reasoningText += before;
                  emit({ type: 'reasoning', requestId: input.requestId, text: before });
                  if (isDev && !tFirstReasoning) {
                    tFirstReasoning = performance.now();
                    console.log(`[chat-stream] first reasoning: ${(tFirstReasoning - t0).toFixed(0)}ms`);
                  }
                  if (isDev) reasoningTokenCount++;
                }
                thinkBuffer = thinkBuffer.slice(closeIdx + 9); // skip '</think>'
                thinkState = 'normal';
                continue;
              }
              // Check for potential partial '</think>' at end
              const partialCheckLen = Math.min(thinkBuffer.length, 8);
              const tail = thinkBuffer.slice(-partialCheckLen);
              const ltIdx = tail.lastIndexOf('<');
              if (ltIdx !== -1 && '</think>'.startsWith(tail.slice(ltIdx))) {
                const safeEnd = thinkBuffer.length - partialCheckLen + ltIdx;
                if (safeEnd > 0) {
                  const safe = thinkBuffer.slice(0, safeEnd);
                  reasoningText += safe;
                  emit({ type: 'reasoning', requestId: input.requestId, text: safe });
                  if (isDev && !tFirstReasoning) {
                    tFirstReasoning = performance.now();
                    console.log(`[chat-stream] first reasoning: ${(tFirstReasoning - t0).toFixed(0)}ms`);
                  }
                  if (isDev) reasoningTokenCount++;
                }
                thinkBuffer = thinkBuffer.slice(safeEnd);
              } else {
                // No partial tag — flush entire buffer as reasoning
                flushThinkBuffer();
              }
              break;
            }
          }
        };

        for await (const part of result.fullStream) {
          resetInactivityTimer();

          if (chatState.isCanceled(input.requestId)) {
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
              if (isDev && !tFirstReasoning) {
                tFirstReasoning = performance.now();
                console.log(`[chat-stream] first reasoning: ${(tFirstReasoning - t0).toFixed(0)}ms`);
              }
              if (isDev) reasoningTokenCount++;
              break;
            }
            case 'reasoning-start':
            case 'reasoning-end':
              break;
            case 'text-delta': {
              if (!telemetry.firstTokenAt) {
                telemetry.firstTokenAt = new Date().toISOString();
              }

              processThinkText(part.text);
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
              if (isDev && !tFirstToolCall) {
                tFirstToolCall = performance.now();
                console.log(`[chat-stream] first tool call (${part.toolName}): ${(tFirstToolCall - t0).toFixed(0)}ms`);
              }
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
              if (isDev) {
                console.log(`[chat-stream] tool ${part.toolName} completed (${status}): ${(performance.now() - t0).toFixed(0)}ms`);
              }
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

        // Flush any remaining content in the think tag buffer
        // If still inThinking, treat remaining as reasoning (unclosed tag)
        flushThinkBuffer();

        if (chatState.isCanceled(input.requestId)) {
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

            if (chatState.isCanceled(input.requestId)) {
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
        if (chatState.isCanceled(input.requestId)) {
          return;
        }

        streamCompleted = true;
        break;
      } catch (error) {
        if (chatState.isCanceled(input.requestId)) {
          return;
        }

        const classified = classifyChatError(error);
        const shouldRetry = shouldRetryStreamAttempt(
          {
            requestId: input.requestId,
            attemptCount: attempt,
            maxAttempts: STREAM_MAX_ATTEMPTS,
            classifiedError: classified,
            hasToolExecution: toolExecutions.length > 0 || attemptHadToolExecution,
            hasAssistantText: assistantText.trim().length > 0,
          },
          chatState.isCanceled,
        );

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

    if (chatState.isCanceled(input.requestId)) {
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

    if (chatState.isCanceled(input.requestId)) {
      return;
    }

    if (isDev) {
      const elapsed = performance.now() - t0;
      console.log(
        `[chat-stream] done: ${elapsed.toFixed(0)}ms total` +
        ` | model=${input.modelId}` +
        ` | tokens=${tokenCount}` +
        ` | reasoning=${reasoningTokenCount}` +
        ` | tools=${toolExecutions.length}` +
        (tFirstToken ? ` | ttft=${(tFirstToken - t0).toFixed(0)}ms` : '') +
        (tFirstReasoning ? ` | ttfr=${(tFirstReasoning - t0).toFixed(0)}ms` : ''),
      );
    }

    emit({
      type: 'assistant_done',
      requestId: input.requestId,
      assistantMessage,
      actionCards,
      ...(emittedChips ? { chips: emittedChips } : {}),
    });
  } catch (error) {
    if (chatState.isCanceled(input.requestId)) {
      return;
    }

    const classified = classifyChatError(error);
    if (isDev) {
      console.log(`[chat-stream] error after ${(performance.now() - t0).toFixed(0)}ms: ${classified.code} — ${classified.message}`);
    }
    emit({
      type: 'error',
      requestId: input.requestId,
      message: classified.message,
      code: classified.code,
      retryable: classified.retryable,
    });
  } finally {
    chatState.removeRequest(input.requestId);
    chatState.removeCanceled(input.requestId);
  }
};
