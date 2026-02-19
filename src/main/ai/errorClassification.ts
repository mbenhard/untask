import type { ChatStreamErrorCode } from '../../types/chat';
import { toErrorMessage } from '../lib/errors';

export type ClassifiedChatError = {
  code: ChatStreamErrorCode;
  retryable: boolean;
  message: string;
};

export type StreamRetryEvaluationInput = {
  requestId: string;
  attemptCount: number;
  maxAttempts: number;
  classifiedError: ClassifiedChatError;
  hasToolExecution: boolean;
  hasAssistantText: boolean;
};

const normalizeErrorMessage = (message: string): string => message.toLowerCase();

export const classifyChatError = (error: unknown): ClassifiedChatError => {
  const message = toErrorMessage(error, 'Unknown chat orchestration error.');
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
  isCanceled: (requestId: string) => boolean = () => false,
): boolean => {
  if (isCanceled(input.requestId)) {
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
