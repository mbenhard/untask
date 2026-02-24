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

  if (normalized.includes('does not support tools')) {
    return {
      code: 'model_incompatible',
      retryable: false,
      message:
        "This model doesn't support tool calling, which Untask needs to manage your tasks. Switch to a compatible model like qwen3, llama3.1, or mistral in Settings \u2192 AI \u2192 Model.",
    };
  }

  // Ollama: model not pulled / not found
  if (
    normalized.includes('not found') &&
    (normalized.includes('model') || normalized.includes('pull'))
  ) {
    return {
      code: 'model_not_found',
      retryable: false,
      message:
        'This model is not installed on Ollama. Pull it in Settings \u2192 AI \u2192 Model.',
    };
  }

  // Ollama: context window exceeded
  if (
    normalized.includes('context length') ||
    normalized.includes('num_ctx') ||
    normalized.includes('context window')
  ) {
    return {
      code: 'model_incompatible',
      retryable: false,
      message:
        'The conversation exceeded this model\u2019s context window. Try starting a new conversation or switching to a model with a larger context.',
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

  // Ollama: connection refused / not running (more specific than generic network)
  if (
    normalized.includes('econnrefused') &&
    (normalized.includes('11434') || normalized.includes('ollama'))
  ) {
    return {
      code: 'network_error',
      retryable: false,
      message:
        'Cannot connect to Ollama. Make sure the Ollama app is running.',
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
    normalized.includes('empty response') ||
    normalized.includes('returned empty') ||
    normalized.includes('provider returned empty')
  ) {
    return {
      code: 'provider_error',
      retryable: true,
      message:
        'The AI provider returned an empty response. Nothing changed. Retry once, and if it repeats switch model/provider in Settings > AI.',
    };
  }

  if (
    normalized.includes('inactivity timeout') ||
    normalized.includes('no data received for 90 seconds')
  ) {
    return {
      code: 'provider_error',
      retryable: true,
      message:
        'The model timed out before replying. Nothing changed. Retry now or try a faster model/provider.',
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
