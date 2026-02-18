import { create } from 'zustand';

import {
  type TaskStatusConfig,
  type PredefinedStatusId,
  PREDEFINED_STATUSES,
  TERMINAL_STATUSES,
  getDefaultStatusConfig,
} from '../../types/models';
import { getUntask } from '../lib/untask';

type TaskStatusConfigStore = {
  config: TaskStatusConfig;
  loaded: boolean;

  fetchConfig: () => Promise<void>;
  updateConfig: (config: TaskStatusConfig) => Promise<void>;
};

export const useTaskStatusConfigStore = create<TaskStatusConfigStore>(
  (set, get) => ({
    config: getDefaultStatusConfig(),
    loaded: false,

    fetchConfig: async () => {
      try {
        const config = await getUntask().tasks.getStatuses();
        set({ config, loaded: true });
      } catch {
        set({ loaded: true });
      }
    },

    updateConfig: async (config) => {
      const prev = get().config;
      set({ config });
      try {
        await getUntask().tasks.setStatuses(config);
      } catch {
        set({ config: prev });
      }
    },
  }),
);

// ─── Selectors ──────────────────────────────────────────────

export const selectEnabledStatuses = (s: TaskStatusConfigStore) =>
  s.config.enabled;

export const selectLaneOrder = (s: TaskStatusConfigStore): PredefinedStatusId[] =>
  s.config.order.filter((id) => s.config.enabled.includes(id));

export const selectEnabledNonTerminal = (s: TaskStatusConfigStore): PredefinedStatusId[] =>
  s.config.order.filter(
    (id) =>
      s.config.enabled.includes(id) && !TERMINAL_STATUSES.includes(id),
  );

export const selectEnabledTerminal = (s: TaskStatusConfigStore): PredefinedStatusId[] =>
  s.config.order.filter(
    (id) =>
      s.config.enabled.includes(id) && TERMINAL_STATUSES.includes(id),
  );

export const selectFirstEnabledNonTerminal = (
  s: TaskStatusConfigStore,
): PredefinedStatusId =>
  selectEnabledNonTerminal(s)[0] ?? 'active';

export const selectStatusLabel = (id: PredefinedStatusId): string =>
  PREDEFINED_STATUSES.find((s) => s.id === id)?.label ?? id;
