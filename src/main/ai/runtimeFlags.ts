import {
  SETTING_KEY_AI_RUNTIME_DETERMINISTIC_ROUTER,
  SETTING_KEY_AI_RUNTIME_DUPLICATE_FAILURE_GUARD,
  SETTING_KEY_AI_RUNTIME_PENDING_SCOPE_GUARD,
  SETTING_KEY_AI_RUNTIME_POST_MUTATION_VERIFY,
} from '../defaultSettings';
import { getSettingWithDefault } from '../services/settingsService';

const isTruthy = (value: string | null, fallback: boolean): boolean => {
  if (value === null) {
    return fallback;
  }

  return value.trim().toLowerCase() === 'true';
};

export const isDeterministicRouterEnabled = (): boolean =>
  isTruthy(getSettingWithDefault(SETTING_KEY_AI_RUNTIME_DETERMINISTIC_ROUTER), true);

export const isPendingScopeGuardEnabled = (): boolean =>
  isTruthy(getSettingWithDefault(SETTING_KEY_AI_RUNTIME_PENDING_SCOPE_GUARD), false);

export const isDuplicateFailureGuardEnabled = (): boolean =>
  isTruthy(getSettingWithDefault(SETTING_KEY_AI_RUNTIME_DUPLICATE_FAILURE_GUARD), true);

export const isPostMutationVerifyEnabled = (): boolean =>
  isTruthy(getSettingWithDefault(SETTING_KEY_AI_RUNTIME_POST_MUTATION_VERIFY), false);

