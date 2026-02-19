import { ipcMain } from 'electron';
import { z } from 'zod';
import type { MemoryLayer } from '../../types/assistant';
import {
  IPC_CHANNELS,
  type SettingsGetAiEnabledResult,
  type SettingsSetAiEnabledRequest,
  type SettingsSetAiEnabledResult,
  type SettingsMemoryStatePayload,
  type SettingsMemoryUpdateRequestPayload,
  type SettingsMemoryHistoryRequestPayload,
  type SettingsMemoryHistoryResultPayload,
  type SettingsUndoMemoryEventRequestPayload,
  type SettingsUndoMemoryEventResultPayload,
  type SettingsReadJournalRequestPayload,
  type SettingsReadJournalResultPayload,
} from '../../types/ipc';
import { withIpcLogging } from './helpers';
import {
  settingsMemoryUpdateSchema,
  settingsReadJournalSchema,
  memoryHistoryRequestSchema,
  undoMemoryEventRequestSchema,
} from './schemas';
import { getSetting, setSetting, getAllSettings, isBootstrapCompleted, markBootstrapCompleted } from '../services/settingsService';
import { SETTING_KEY_AI_ENABLED } from '../defaultSettings';
import { getIdentity, getMemory, setIdentity, setMemory } from '../ai/memory';
import { readJournalEntries } from '../services/journalService';
import { listMemoryEvents, undoMemoryEvents } from '../services/memoryService';
import { fireAiReminder } from '../assistant/proactiveLoop';
import { initReminderScheduler } from '../services/reminderScheduler';
import { startProactiveTurn } from '../ai/chat';

const getMemoryState = (): SettingsMemoryStatePayload => ({
  identity: getIdentity(),
  memory: getMemory(),
});

export const registerSettingsHandlers = (): void => {
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET,
    withIpcLogging('SETTINGS_GET', (_event: Electron.IpcMainInvokeEvent, key: string) => {
      return getSetting(key);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SET,
    withIpcLogging('SETTINGS_SET', (_event: Electron.IpcMainInvokeEvent, key: string, value: string) => {
      return setSetting(key, value);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET_ALL,
    withIpcLogging('SETTINGS_GET_ALL', () => {
      return getAllSettings();
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET_AI_ENABLED,
    withIpcLogging(
      'SETTINGS_GET_AI_ENABLED',
      (): SettingsGetAiEnabledResult => {
        const stored = getSetting(SETTING_KEY_AI_ENABLED);
        return { enabled: stored !== 'false' };
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SET_AI_ENABLED,
    withIpcLogging(
      'SETTINGS_SET_AI_ENABLED',
      (_event: Electron.IpcMainInvokeEvent, request: SettingsSetAiEnabledRequest): SettingsSetAiEnabledResult => {
        setSetting(SETTING_KEY_AI_ENABLED, String(request.enabled));
        // Re-init scheduler with or without AI callback based on new setting
        // Pass isColdStart: false to avoid triggering overdue catch-up notifications
        initReminderScheduler(
          {
            isColdStart: false,
            ...(request.enabled
              ? {
                  fireAiReminder: (taskContext) =>
                    fireAiReminder(taskContext, {
                      startProactiveTurn: (input) =>
                        startProactiveTurn({
                          triggerMessage: input.triggerMessage,
                          triggerType: input.triggerType,
                          emit: input.emit,
                        }),
                    }),
                }
              : {}),
          },
        );
        return { enabled: request.enabled };
      },
    ),
  );

  // Onboarding handlers
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET_BOOTSTRAP_COMPLETED,
    withIpcLogging(
      'SETTINGS_GET_BOOTSTRAP_COMPLETED',
      (): { completed: boolean } => {
        return { completed: isBootstrapCompleted() };
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_MARK_BOOTSTRAP_COMPLETED,
    withIpcLogging(
      'SETTINGS_MARK_BOOTSTRAP_COMPLETED',
      (): void => {
        markBootstrapCompleted();
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SET_USER_NAME,
    withIpcLogging(
      'SETTINGS_SET_USER_NAME',
      (_event: Electron.IpcMainInvokeEvent, nameInput: unknown): void => {
        const name = z.string().min(1).max(120).parse(nameInput);
        setSetting('user.name', name.trim());
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SET_IDENTITY,
    withIpcLogging(
      'SETTINGS_SET_IDENTITY',
      (_event: Electron.IpcMainInvokeEvent, identityInput: unknown): void => {
        const identity = z.string().min(1).max(4000).parse(identityInput);
        setIdentity(identity.trim(), 'user');
      },
    ),
  );

  // Memory state handlers
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET_MEMORY_STATE,
    withIpcLogging(
      'SETTINGS_GET_MEMORY_STATE',
      (): SettingsMemoryStatePayload => {
        return getMemoryState();
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_UPDATE_MEMORY_STATE,
    withIpcLogging(
      'SETTINGS_UPDATE_MEMORY_STATE',
      (_event: Electron.IpcMainInvokeEvent, payload: SettingsMemoryUpdateRequestPayload): SettingsMemoryStatePayload => {
        const validated = settingsMemoryUpdateSchema.parse(payload ?? {});

        if (validated.identity !== undefined) {
          setIdentity(validated.identity);
        }
        if (validated.memory !== undefined) {
          setMemory(validated.memory);
        }

        return getMemoryState();
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET_MEMORY_HISTORY,
    withIpcLogging(
      'SETTINGS_GET_MEMORY_HISTORY',
      (
        _event: Electron.IpcMainInvokeEvent,
        payload?: SettingsMemoryHistoryRequestPayload,
      ): SettingsMemoryHistoryResultPayload => {
        const validated = memoryHistoryRequestSchema.parse(payload ?? {});
        return {
          events: listMemoryEvents({
            layer: validated.layer as MemoryLayer | undefined,
            limit: validated.limit,
          }),
        };
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_UNDO_MEMORY_EVENT,
    withIpcLogging(
      'SETTINGS_UNDO_MEMORY_EVENT',
      (
        _event: Electron.IpcMainInvokeEvent,
        payload?: SettingsUndoMemoryEventRequestPayload,
      ): SettingsUndoMemoryEventResultPayload => {
        const validated = undoMemoryEventRequestSchema.parse(payload ?? {});
        const result = undoMemoryEvents({
          eventId: validated.eventId,
          steps: validated.steps,
          source: 'user',
        });
        return {
          state: getMemoryState(),
          revertedEventIds: result.revertedEventIds,
        };
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_READ_JOURNAL,
    withIpcLogging(
      'SETTINGS_READ_JOURNAL',
      (_event: Electron.IpcMainInvokeEvent, payload?: SettingsReadJournalRequestPayload): SettingsReadJournalResultPayload => {
        const validated = settingsReadJournalSchema.parse(payload ?? {});

        return {
          entries: readJournalEntries({
            category: validated.category,
            limit: validated.limit,
            days_back: validated.days_back,
            daysBack: validated.daysBack,
          }),
        };
      },
    ),
  );

};
