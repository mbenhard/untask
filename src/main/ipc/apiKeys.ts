import { ipcMain } from 'electron';
import {
  IPC_CHANNELS,
  type ApiKeysHasRequest,
  type ApiKeysHasResult,
  type ApiKeysSetRequest,
  type ApiKeysDeleteRequest,
  type ApiKeysValidateRequest,
  type ApiKeysValidateResult,
} from '../../types/ipc';
import { withIpcLogging } from './helpers';
import {
  providerOnlySchema,
  setApiKeySchema,
  validateApiKeySchema,
} from './schemas';
import {
  storeApiKey,
  hasApiKey,
  deleteApiKey as deleteStoredApiKey,
} from '../services/keyStorage';

const API_KEY_VALIDATORS: Record<string, {
  url: string;
  method?: string;
  headers: (key: string) => Record<string, string>;
  body?: string;
  isValid: (response: Response) => boolean;
  errorMessage: (response: Response) => string;
}> = {
  openrouter: {
    url: 'https://openrouter.ai/api/v1/auth/key',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    isValid: (response) => response.ok,
    errorMessage: (response) => `Invalid API key (HTTP ${response.status})`,
  },
  openai: {
    url: 'https://api.openai.com/v1/models',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    isValid: (response) => response.ok,
    errorMessage: (response) => `Invalid API key (HTTP ${response.status})`,
  },
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    method: 'POST',
    headers: (key) => ({
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    }),
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
    // 401 = bad key, 400/200/etc = key works
    isValid: (response) => response.status !== 401,
    errorMessage: () => 'Invalid API key',
  },
  inception: {
    url: 'https://api.inceptionlabs.ai/v1/models',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    isValid: (response) => response.ok,
    errorMessage: (response) => `Invalid API key (HTTP ${response.status})`,
  },
};

export const registerApiKeyHandlers = (): void => {
  ipcMain.handle(
    IPC_CHANNELS.API_KEYS_HAS,
    withIpcLogging(
      'API_KEYS_HAS',
      (_event: Electron.IpcMainInvokeEvent, request: ApiKeysHasRequest): ApiKeysHasResult => {
        const validated = providerOnlySchema.parse(request);
        return { hasKey: hasApiKey(validated.provider) };
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.API_KEYS_SET,
    withIpcLogging(
      'API_KEYS_SET',
      (_event: Electron.IpcMainInvokeEvent, request: ApiKeysSetRequest): void => {
        const validated = setApiKeySchema.parse(request);
        storeApiKey(validated.provider, validated.key);
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.API_KEYS_DELETE,
    withIpcLogging(
      'API_KEYS_DELETE',
      (_event: Electron.IpcMainInvokeEvent, request: ApiKeysDeleteRequest): void => {
        const validated = providerOnlySchema.parse(request);
        deleteStoredApiKey(validated.provider);
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.API_KEYS_VALIDATE,
    withIpcLogging(
      'API_KEYS_VALIDATE',
      async (_event: Electron.IpcMainInvokeEvent, request: ApiKeysValidateRequest): Promise<ApiKeysValidateResult> => {
        const validated = validateApiKeySchema.parse(request);
        const validator = API_KEY_VALIDATORS[validated.provider];

        if (!validator) {
          // Ollama and others: no key validation needed
          return { valid: true };
        }

        const { net } = await import('electron');
        const response = await net.fetch(validator.url, {
          method: validator.method,
          headers: validator.headers(validated.key),
          ...(validator.body ? { body: validator.body } : {}),
        });

        if (!validator.isValid(response)) {
          return { valid: false, error: validator.errorMessage(response) };
        }

        return { valid: true };
      },
    ),
  );
};
