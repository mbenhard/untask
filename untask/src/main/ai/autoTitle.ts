import { generateText } from 'ai';

import {
  DEFAULT_CONVERSATION_TITLE,
  canAutoTitleConversation,
  getConversationMessageCount,
  setConversationTitle,
} from '../services/chatService';
import { getActiveProvider } from './providers';

const AUTO_TITLE_MODEL_ID = 'openai/gpt-4o-mini';
const AUTO_TITLE_TIMEOUT_MS = 5_000;
const AUTO_TITLE_MAX_LENGTH = 80;

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

export const maybeAutoTitleConversation = async (input: {
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
    const provider = getActiveProvider();
    const model = provider.languageModel(AUTO_TITLE_MODEL_ID);
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
