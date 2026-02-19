import { existsSync } from 'node:fs';

import {
  SETTING_KEY_AI_OLLAMA_BASE_URL,
} from '../../defaultSettings';
import { getSetting } from '../../services/settingsService';

// ─── Types ────────────────────────────────────────────────────────────────────

export type OllamaModel = {
  name: string;
  size: number;
  parameterSize: string;
  family: string;
  quantization: string;
};

export type OllamaDetectionResult = {
  status: 'not_installed' | 'not_running' | 'ready';
  baseUrl: string;
  models: OllamaModel[];
  defaultModelName: string | null;
};

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 10_000;
let cachedResult: OllamaDetectionResult | null = null;
let cachedAt = 0;

export const clearOllamaDetectionCache = (): void => {
  cachedResult = null;
  cachedAt = 0;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const OLLAMA_BIN_PATHS = [
  '/usr/local/bin/ollama',
  '/opt/homebrew/bin/ollama',
  '/usr/bin/ollama',
];

const isOllamaInstalled = (): boolean =>
  OLLAMA_BIN_PATHS.some((p) => existsSync(p));

const DEFAULT_BASE_URL = 'http://localhost:11434';

/**
 * Resolve the Ollama base URL from (in priority order):
 * 1. User-saved setting (if non-default and non-empty)
 * 2. OLLAMA_HOST environment variable
 * 3. Default http://localhost:11434
 */
const resolveBaseUrl = (): string => {
  // 1. User setting (always wins when non-empty)
  const stored = getSetting(SETTING_KEY_AI_OLLAMA_BASE_URL)?.trim() ?? '';
  if (stored.length > 0) {
    return stored;
  }

  // 2. OLLAMA_HOST env var
  const envHost = (process.env.OLLAMA_HOST ?? '').trim();
  if (envHost.length > 0) {
    // OLLAMA_HOST can be just "host:port" without scheme
    if (envHost.startsWith('http://') || envHost.startsWith('https://')) {
      return envHost.replace(/\/$/, '');
    }
    return `http://${envHost}`;
  }

  // 3. Default
  return DEFAULT_BASE_URL;
};

// ─── Detection ────────────────────────────────────────────────────────────────

export const detectOllama = async (): Promise<OllamaDetectionResult> => {
  // Return cached result if still fresh
  if (cachedResult && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedResult;
  }

  const baseUrl = resolveBaseUrl();

  // 1. Check if Ollama binary is installed
  if (!isOllamaInstalled()) {
    const result: OllamaDetectionResult = {
      status: 'not_installed',
      baseUrl,
      models: [],
      defaultModelName: null,
    };
    cachedResult = result;
    cachedAt = Date.now();
    return result;
  }

  // 2. Check if Ollama server is running
  try {
    const response = await fetch(baseUrl, {
      signal: AbortSignal.timeout(2_000),
    });
    const body = await response.text();
    if (!body.includes('Ollama is running')) {
      const result: OllamaDetectionResult = {
        status: 'not_running',
        baseUrl,
        models: [],
        defaultModelName: null,
      };
      cachedResult = result;
      cachedAt = Date.now();
      return result;
    }
  } catch {
    const result: OllamaDetectionResult = {
      status: 'not_running',
      baseUrl,
      models: [],
      defaultModelName: null,
    };
    cachedResult = result;
    cachedAt = Date.now();
    return result;
  }

  // 3. Fetch installed models
  let models: OllamaModel[] = [];
  try {
    const tagsResponse = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5_000),
    });
    const tagsData = (await tagsResponse.json()) as {
      models?: Array<{
        name?: string;
        size?: number;
        details?: {
          parameter_size?: string;
          family?: string;
          quantization_level?: string;
        };
      }>;
    };

    if (Array.isArray(tagsData.models)) {
      models = tagsData.models
        .filter((m) => typeof m.name === 'string' && m.name.length > 0)
        .map((m) => ({
          name: m.name!,
          size: typeof m.size === 'number' ? m.size : 0,
          parameterSize: m.details?.parameter_size ?? '',
          family: m.details?.family ?? '',
          quantization: m.details?.quantization_level ?? '',
        }));
    }
  } catch {
    // Server is running but we couldn't fetch models — still report ready
  }

  const result: OllamaDetectionResult = {
    status: 'ready',
    baseUrl,
    models,
    defaultModelName: models.length > 0 ? models[0].name : null,
  };
  cachedResult = result;
  cachedAt = Date.now();
  return result;
};
