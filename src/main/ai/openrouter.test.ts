import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/settingsService', () => ({
  getSetting: vi.fn(() => null),
}));

import { getSetting } from '../services/settingsService';
import { resolveOpenRouterApiKey } from './openrouter';

const getSettingMock = vi.mocked(getSetting);

describe('resolveOpenRouterApiKey', () => {
  const previousEnv = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    getSettingMock.mockReset();
    getSettingMock.mockReturnValue(null);
    delete process.env.OPENROUTER_API_KEY;
  });

  afterEach(() => {
    if (typeof previousEnv === 'string') {
      process.env.OPENROUTER_API_KEY = previousEnv;
      return;
    }
    delete process.env.OPENROUTER_API_KEY;
  });

  it('prefers explicit key when provided', () => {
    process.env.OPENROUTER_API_KEY = 'env-key';
    getSettingMock.mockReturnValue('stored-key');

    expect(resolveOpenRouterApiKey('explicit-key')).toBe('explicit-key');
  });

  it('falls back to env key when explicit key is absent', () => {
    process.env.OPENROUTER_API_KEY = 'env-key';
    getSettingMock.mockReturnValue('stored-key');

    expect(resolveOpenRouterApiKey()).toBe('env-key');
  });

  it('falls back to persisted key when env key is absent', () => {
    getSettingMock.mockReturnValue('stored-key');

    expect(resolveOpenRouterApiKey()).toBe('stored-key');
  });

  it('throws when no key source is configured', () => {
    getSettingMock.mockReturnValue(null);

    expect(() => resolveOpenRouterApiKey()).toThrow(
      'OpenRouter API key is missing.',
    );
  });
});
