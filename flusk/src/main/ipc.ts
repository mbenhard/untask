import { ipcMain } from 'electron';
import { z } from 'zod';
import {
  type ChatModelCatalogResult,
  type ChatKernelOrchestrationRequestPayload,
  type ChatKernelOrchestrationResultPayload,
  type ChatKernelStatusResultPayload,
  type ChatLiveThoughtResult,
  type ChatRetentionResult,
  type ChatSendRequest,
  type ChatSendResult,
  type ChatSelectedModelResult,
  type ChatSetModelRequest,
  type ChatSetRetentionRequest,
  type ChatUndoRequest,
  type ChatUndoResult,
  IPC_CHANNELS,
  type IdentityContextSnapshotRequest,
  type IdentityContextSnapshotResult,
  type MemoryPromotionConfirmRequestPayload,
  type MemoryPromotionConfirmResultPayload,
  type MemoryPromotionEvaluationRequestPayload,
  type MemoryPromotionEvaluationResultPayload,
  type ProactiveTriggerEvaluationRequestPayload,
  type ProactiveTriggerEvaluationResultPayload,
  type SettingsBootstrapState,
  type SettingsMemoryStatePayload,
  type SettingsMemoryUpdateRequestPayload,
  type SettingsReadJournalRequestPayload,
  type SettingsReadJournalResultPayload,
} from '../types/ipc';
import { buildIdentityContext } from './ai/contextBuilder';
import { getPatterns, getProfile, getSoul, resetSoul, setPatterns, setProfile, setSoul } from './ai/memory';
import {
  evaluateMemoryPromotion,
  resolveMemoryPromotionConfirmation,
} from './assistant/memoryPolicy';
import { evaluateProactiveTriggerPolicy } from './assistant/proactivePolicy';
import { getIdentityKernelStatus, orchestrateChatWithIdentityKernel } from './assistant/identityKernel';
import {
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  completeTask,
  toggleToday,
  reorderTasks,
  undoLastAiTaskEvent,
  undoTaskEvent,
} from './services/taskService';
import {
  clearChatHistory,
  getChatHistory,
  getChatRetentionMode,
  setChatRetentionMode,
} from './services/chatService';
import { readJournalEntries } from './services/journalService';
import { getScratchpad, saveScratchpad } from './services/scratchpadService';
import { getSetting, setSetting, getAllSettings } from './services/settingsService';
import { cancelActiveChatTurns, startChatTurn } from './ai/chat';
import { generateLiveThought } from './ai/liveThought';
import { getModels, getSelectedModelId, setSelectedModelId } from './ai/models';

type ChatSendInput = {
  content: string;
  modelId?: string | null;
};

const settingsMemoryUpdateSchema = z
  .object({
    soul: z.string().optional(),
    profile: z.string().optional(),
    patterns: z.string().optional(),
  })
  .refine(
    (value) =>
      value.soul !== undefined ||
      value.profile !== undefined ||
      value.patterns !== undefined,
    {
      message: 'At least one memory field must be provided.',
    },
  );

const settingsReadJournalSchema = z.object({
  category: z.enum(['pattern', 'progress', 'preference', 'summary']).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  days_back: z.number().int().min(1).max(90).optional(),
  daysBack: z.number().int().min(1).max(90).optional(),
});

const getMemoryState = (): SettingsMemoryStatePayload => ({
  soul: getSoul(),
  profile: getProfile(),
  patterns: getPatterns(),
});

export const registerIpcHandlers = (): void => {
  if (ipcMain.listenerCount(IPC_CHANNELS.SETTINGS_GET_BOOTSTRAP_STATE) > 0) {
    return;
  }

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET_BOOTSTRAP_STATE,
    (): SettingsBootstrapState => ({
      status: 'ready',
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET_IDENTITY_CONTEXT_SNAPSHOT,
    async (
      _event,
      request?: IdentityContextSnapshotRequest,
    ): Promise<IdentityContextSnapshotResult> => {
      return buildIdentityContext({
        baseDir: process.cwd(),
        userMessage: request?.request,
        tokenBudget: request?.tokenBudget,
        memory: request?.memory,
        liveContext: request?.liveContext,
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_EVALUATE_MEMORY_PROMOTION,
    (
      _event,
      request: MemoryPromotionEvaluationRequestPayload,
    ): MemoryPromotionEvaluationResultPayload =>
      evaluateMemoryPromotion(request),
  );

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_CONFIRM_MEMORY_PROMOTION,
    (
      _event,
      request: MemoryPromotionConfirmRequestPayload,
    ): MemoryPromotionConfirmResultPayload =>
      resolveMemoryPromotionConfirmation(request),
  );

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_EVALUATE_PROACTIVE_TRIGGERS,
    (
      _event,
      request: ProactiveTriggerEvaluationRequestPayload,
    ): ProactiveTriggerEvaluationResultPayload =>
      evaluateProactiveTriggerPolicy(request),
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAT_GET_KERNEL_STATUS,
    async (): Promise<ChatKernelStatusResultPayload> => getIdentityKernelStatus(),
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAT_ORCHESTRATE_WITH_KERNEL,
    async (
      _event,
      request: ChatKernelOrchestrationRequestPayload,
    ): Promise<ChatKernelOrchestrationResultPayload> =>
      orchestrateChatWithIdentityKernel(request),
  );

  // ─── Task handlers ────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.TASK_LIST, (_event, filter?) => {
    try { return listTasks(filter); }
    catch (e) { console.error('[ipc] TASK_LIST:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.TASK_CREATE, (_event, input) => {
    try { return createTask(input); }
    catch (e) { console.error('[ipc] TASK_CREATE:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.TASK_UPDATE, (_event, input) => {
    try { return updateTask(input); }
    catch (e) { console.error('[ipc] TASK_UPDATE:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.TASK_DELETE, (_event, id: string) => {
    try { deleteTask(id); }
    catch (e) { console.error('[ipc] TASK_DELETE:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.TASK_REORDER, (_event, ids: string[]) => {
    try { reorderTasks(ids); }
    catch (e) { console.error('[ipc] TASK_REORDER:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.TASK_COMPLETE, (_event, id: string) => {
    try { return completeTask(id); }
    catch (e) { console.error('[ipc] TASK_COMPLETE:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.TASK_TOGGLE_TODAY, (_event, id: string) => {
    try { return toggleToday(id); }
    catch (e) { console.error('[ipc] TASK_TOGGLE_TODAY:', e); throw e; }
  });

  // ─── Chat handlers ───────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.CHAT_SEND,
    async (event, message: ChatSendInput): Promise<ChatSendResult> => {
    try {
      if (!message || typeof message.content !== 'string') {
        throw new Error('Invalid chat payload: expected { content, modelId? }.');
      }

      const content = message.content.trim();
      if (content.length === 0) {
        throw new Error('Chat content cannot be empty.');
      }

      const payload: ChatSendRequest = {
        content,
        modelId: message.modelId,
      };

      return startChatTurn({
        ...payload,
        emit: (streamEvent): void => {
          if (event.sender.isDestroyed()) {
            return;
          }

          event.sender.send(IPC_CHANNELS.CHAT_STREAM_EVENT, streamEvent);
        },
      });
    }
    catch (e) { console.error('[ipc] CHAT_SEND:', e); throw e; }
    },
  );

  ipcMain.handle(IPC_CHANNELS.CHAT_HISTORY, () => {
    try { return getChatHistory(); }
    catch (e) { console.error('[ipc] CHAT_HISTORY:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.CHAT_CLEAR, () => {
    try {
      cancelActiveChatTurns();
      clearChatHistory();
    }
    catch (e) { console.error('[ipc] CHAT_CLEAR:', e); throw e; }
  });
  ipcMain.handle(
    IPC_CHANNELS.CHAT_GET_MODELS,
    (): ChatModelCatalogResult => {
      try {
        const selectedModelId = getSelectedModelId();

        return getModels().map((model) => ({
          id: model.id,
          label: model.label,
          inputCostPerMillion: model.inputCostPerMillion,
          outputCostPerMillion: model.outputCostPerMillion,
          defaultSelected: model.defaultSelected,
          selected: model.id === selectedModelId,
        }));
      }
      catch (e) { console.error('[ipc] CHAT_GET_MODELS:', e); throw e; }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.CHAT_GET_SELECTED_MODEL,
    (): ChatSelectedModelResult => {
      try {
        return { modelId: getSelectedModelId() };
      }
      catch (e) { console.error('[ipc] CHAT_GET_SELECTED_MODEL:', e); throw e; }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.CHAT_SET_SELECTED_MODEL,
    (_event, request: ChatSetModelRequest): ChatSelectedModelResult => {
      try {
        if (!request || typeof request.modelId !== 'string') {
          throw new Error('Invalid model selection payload.');
        }

        return { modelId: setSelectedModelId(request.modelId) };
      }
      catch (e) { console.error('[ipc] CHAT_SET_SELECTED_MODEL:', e); throw e; }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.CHAT_UNDO_LAST_ACTION,
    (_event, request?: ChatUndoRequest): ChatUndoResult => {
      try {
        const result = request?.taskEventId
          ? undoTaskEvent(request.taskEventId, 'user')
          : undoLastAiTaskEvent('user');

        if (!result) {
          return {
            ok: true,
            undone: false,
            message: 'No AI action available to undo.',
          };
        }

        return {
          ok: true,
          undone: result.undone,
          message: result.undone
            ? 'Undid AI action successfully.'
            : (result.reason ?? 'No changes were made by undo.'),
          targetTaskId: result.targetTaskId,
          originalEventId: result.originalEventId,
          undoEventId: result.undoEventId,
        };
      }
      catch (e) { console.error('[ipc] CHAT_UNDO_LAST_ACTION:', e); throw e; }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.CHAT_GET_RETENTION_MODE,
    (): ChatRetentionResult => {
      try {
        return { mode: getChatRetentionMode() };
      }
      catch (e) { console.error('[ipc] CHAT_GET_RETENTION_MODE:', e); throw e; }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.CHAT_SET_RETENTION_MODE,
    (_event, request: ChatSetRetentionRequest): ChatRetentionResult => {
      try {
        if (
          !request ||
          (request.mode !== 'session' &&
            request.mode !== '30d' &&
            request.mode !== 'forever')
        ) {
          throw new Error('Invalid chat retention mode payload.');
        }

        return { mode: setChatRetentionMode(request.mode) };
      }
      catch (e) { console.error('[ipc] CHAT_SET_RETENTION_MODE:', e); throw e; }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.CHAT_GET_LIVE_THOUGHT,
    (): ChatLiveThoughtResult => {
      try {
        return generateLiveThought();
      }
      catch (e) { console.error('[ipc] CHAT_GET_LIVE_THOUGHT:', e); throw e; }
    },
  );

  // ─── Scratchpad handlers ─────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.SCRATCHPAD_GET, () => {
    try { return getScratchpad(); }
    catch (e) { console.error('[ipc] SCRATCHPAD_GET:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.SCRATCHPAD_SAVE, (_event, content: string) => {
    try { return saveScratchpad(content); }
    catch (e) { console.error('[ipc] SCRATCHPAD_SAVE:', e); throw e; }
  });

  // ─── Settings handlers ───────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (_event, key: string) => {
    try { return getSetting(key); }
    catch (e) { console.error('[ipc] SETTINGS_GET:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_event, key: string, value: string) => {
    try { return setSetting(key, value); }
    catch (e) { console.error('[ipc] SETTINGS_SET:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_ALL, () => {
    try { return getAllSettings(); }
    catch (e) { console.error('[ipc] SETTINGS_GET_ALL:', e); throw e; }
  });
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET_MEMORY_STATE,
    (): SettingsMemoryStatePayload => {
      try { return getMemoryState(); }
      catch (e) { console.error('[ipc] SETTINGS_GET_MEMORY_STATE:', e); throw e; }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_UPDATE_MEMORY_STATE,
    (_event, payload: SettingsMemoryUpdateRequestPayload): SettingsMemoryStatePayload => {
      try {
        const validated = settingsMemoryUpdateSchema.parse(payload ?? {});

        if (validated.soul !== undefined) {
          setSoul(validated.soul);
        }
        if (validated.profile !== undefined) {
          setProfile(validated.profile);
        }
        if (validated.patterns !== undefined) {
          setPatterns(validated.patterns);
        }

        return getMemoryState();
      }
      catch (e) { console.error('[ipc] SETTINGS_UPDATE_MEMORY_STATE:', e); throw e; }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_RESET_SOUL,
    (): SettingsMemoryStatePayload => {
      try {
        resetSoul();
        return getMemoryState();
      }
      catch (e) { console.error('[ipc] SETTINGS_RESET_SOUL:', e); throw e; }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_READ_JOURNAL,
    (_event, payload?: SettingsReadJournalRequestPayload): SettingsReadJournalResultPayload => {
      try {
        const validated = settingsReadJournalSchema.parse(payload ?? {});

        return {
          entries: readJournalEntries({
            category: validated.category,
            limit: validated.limit,
            days_back: validated.days_back,
            daysBack: validated.daysBack,
          }),
        };
      }
      catch (e) { console.error('[ipc] SETTINGS_READ_JOURNAL:', e); throw e; }
    },
  );
};
