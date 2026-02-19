/**
 * Settings slice: model selection, retention mode, autonomy mode, pending actions.
 */
import type { StoreApi } from 'zustand';

import type { AutonomyMode, ChatRetentionMode } from '../../../types/chat';
import { toErrorMessage } from '../../lib/errors';
import { getUntask } from '../../lib/untask';
import { useTaskStore } from '../taskStore';
import type { ChatStore } from './chatStoreTypes';

export const createSettingsActions = (
  set: StoreApi<ChatStore>['setState'],
  get: StoreApi<ChatStore>['getState'],
) => ({
  setSelectedModel: async (modelId: string) => {
    try {
      const [selected, models] = await Promise.all([
        getUntask().chat.setSelectedModel({ modelId }),
        getUntask().chat.getModels(),
      ]);

      set({
        selectedModelId: selected.modelId,
        models,
        error: null,
      });
    } catch (error) {
      set({ error: toErrorMessage(error, 'Unknown chat operation error.') });
    }
  },

  setRetentionMode: async (mode: ChatRetentionMode) => {
    try {
      const updated = await getUntask().chat.setRetentionMode({ mode });
      set({ retentionMode: updated.mode, error: null });
    } catch (error) {
      set({ error: toErrorMessage(error, 'Unknown chat operation error.') });
    }
  },

  setAutonomyMode: async (mode: AutonomyMode) => {
    try {
      const result = await getUntask().chat.setAutonomyMode({ mode });
      set({ autonomyMode: result.mode, error: null });
    } catch (error) {
      set({ error: toErrorMessage(error, 'Unknown chat operation error.') });
    }
  },

  approvePendingAction: async (actionId: string) => {
    try {
      const result = await getUntask().chat.resolvePendingAction({
        actionId,
        decision: 'approve',
      });

      if (result.ok) {
        const updates = result.actionCard
          ? {
              taskId: result.actionCard.taskId,
              taskEventId: result.actionCard.taskEventId,
              undoable: result.actionCard.undoable,
              title: result.actionCard.title,
              detail: result.actionCard.detail,
            }
          : undefined;

        get().updateCardLifecycle(actionId, result.lifecycle, updates);
        set((state) => ({
          pendingActions: state.pendingActions.filter((a) => a.actionId !== actionId),
          error: null,
        }));
        await useTaskStore.getState().fetchTasks();
      } else {
        set({ error: result.message });
      }
    } catch (error) {
      set({ error: toErrorMessage(error, 'Unknown chat operation error.') });
    }
  },

  rejectPendingAction: async (actionId: string) => {
    try {
      const result = await getUntask().chat.resolvePendingAction({
        actionId,
        decision: 'reject',
      });

      if (result.ok) {
        get().updateCardLifecycle(actionId, result.lifecycle);
        set((state) => ({
          pendingActions: state.pendingActions.filter((a) => a.actionId !== actionId),
          error: null,
        }));
      } else {
        set({ error: result.message });
      }
    } catch (error) {
      set({ error: toErrorMessage(error, 'Unknown chat operation error.') });
    }
  },

  refreshPendingActions: async () => {
    try {
      const result = await getUntask().chat.listPendingActions();
      set({ pendingActions: result.actions });
    } catch (error) {
      set({ error: toErrorMessage(error, 'Unknown chat operation error.') });
    }
  },
});
