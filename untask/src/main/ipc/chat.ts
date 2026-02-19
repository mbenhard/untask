import { ipcMain } from 'electron';
import {
  IPC_CHANNELS,
  type ChatModelCatalogResult,
  type ChatHistoryRequest,
  type ChatListThreadsRequest,
  type ChatListThreadsResult,
  type ChatCreateThreadRequest,
  type ChatCreateThreadResult,
  type ChatArchiveThreadRequest,
  type ChatDeleteThreadRequest,
  type ChatRetentionResult,
  type ChatSendRequest,
  type ChatSendResult,
  type ChatSelectedModelResult,
  type ChatSetModelRequest,
  type ChatSetRetentionRequest,
  type ChatUndoRequest,
  type ChatUndoResult,
  type ChatAutonomyModeResult,
  type ChatSetAutonomyModeRequest,
  type ChatResolvePendingActionRequest,
  type ChatResolvePendingActionResponse,
  type ChatListPendingActionsResponse,
} from '../../types/ipc';
import { withIpcLogging } from './helpers';
import {
  chatSendSchema,
  chatHistoryRequestSchema,
  chatListThreadsSchema,
  chatCreateThreadSchema,
  chatThreadMutationSchema,
  resolvePendingActionSchema,
} from './schemas';
import {
  archiveConversation,
  createConversation,
  clearChatHistory,
  deleteConversation,
  ensureConversation,
  getConversationMessages,
  getChatRetentionMode,
  listConversations,
  setChatRetentionMode,
} from '../services/chatService';
import { cancelActiveChatTurns, startChatTurn } from '../ai/chat';
import { undoLastAiTaskEvent, undoTaskEvent } from '../services/taskService';
import { getModels, getSelectedModelId, setSelectedModelId } from '../ai/models';
import { clearOllamaDetectionCache, detectOllama } from '../ai/providers/ollamaDetection';
import {
  getAutonomyMode,
  setAutonomyMode,
  loadPendingActions,
  requeuePendingAction,
  removePendingAction,
  getPendingAction,
} from '../ai/autonomy';
import { executeToolCall } from '../ai/tools';

export const registerChatHandlers = (): void => {
  ipcMain.handle(
    IPC_CHANNELS.CHAT_CANCEL,
    withIpcLogging('CHAT_CANCEL', () => {
      cancelActiveChatTurns();
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAT_SEND,
    withIpcLogging(
      'CHAT_SEND',
      async (event: Electron.IpcMainInvokeEvent, message: ChatSendRequest): Promise<ChatSendResult> => {
        const parsedMessage = chatSendSchema.parse(message ?? {});
        const content = parsedMessage.content.trim();
        if (content.length === 0) {
          throw new Error('Chat content cannot be empty.');
        }

        const images = Array.isArray(parsedMessage.images) ? parsedMessage.images.filter(
          (img): img is string => typeof img === 'string' && img.length > 0,
        ) : undefined;

        return startChatTurn({
          content,
          conversationId: parsedMessage.conversationId,
          modelId: parsedMessage.modelId,
          images: images?.length ? images : undefined,
          noteContext: parsedMessage.noteContext,
          emit: (streamEvent): void => {
            if (event.sender.isDestroyed()) {
              return;
            }

            event.sender.send(IPC_CHANNELS.CHAT_STREAM_EVENT, streamEvent);
          },
        });
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAT_HISTORY,
    withIpcLogging(
      'CHAT_HISTORY',
      (_event: Electron.IpcMainInvokeEvent, request: ChatHistoryRequest) => {
        const parsed = chatHistoryRequestSchema.parse(request ?? {});
        const conversation = ensureConversation(parsed.conversationId);
        return getConversationMessages(conversation.id);
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAT_CLEAR,
    withIpcLogging('CHAT_CLEAR', () => {
      cancelActiveChatTurns();
      clearChatHistory();
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAT_LIST_THREADS,
    withIpcLogging(
      'CHAT_LIST_THREADS',
      (_event: Electron.IpcMainInvokeEvent, request?: ChatListThreadsRequest): ChatListThreadsResult => {
        const parsed = chatListThreadsSchema.parse(request ?? {});
        return listConversations(parsed);
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAT_CREATE_THREAD,
    withIpcLogging(
      'CHAT_CREATE_THREAD',
      (_event: Electron.IpcMainInvokeEvent, request?: ChatCreateThreadRequest): ChatCreateThreadResult => {
        const parsed = chatCreateThreadSchema.parse(request ?? {});
        const created = createConversation({
          title: parsed.title,
          isAutoTitle: !parsed.title,
        });
        const listed = listConversations({ includeArchived: true, limit: 1, offset: 0 });
        const conversation =
          listed.conversations.find((entry) => entry.id === created.id) ??
          {
            id: created.id,
            title: created.title,
            isAutoTitle: created.isAutoTitle ?? true,
            createdAt: created.createdAt,
            updatedAt: created.updatedAt,
            archivedAt: created.archivedAt,
            messageCount: 0,
          };
        return { conversation };
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAT_ARCHIVE_THREAD,
    withIpcLogging(
      'CHAT_ARCHIVE_THREAD',
      (_event: Electron.IpcMainInvokeEvent, request: ChatArchiveThreadRequest): void => {
        const parsed = chatThreadMutationSchema.parse(request ?? {});
        archiveConversation(parsed.conversationId);
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAT_DELETE_THREAD,
    withIpcLogging(
      'CHAT_DELETE_THREAD',
      (_event: Electron.IpcMainInvokeEvent, request: ChatDeleteThreadRequest): void => {
        const parsed = chatThreadMutationSchema.parse(request ?? {});
        deleteConversation(parsed.conversationId);
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAT_GET_MODELS,
    withIpcLogging(
      'CHAT_GET_MODELS',
      (): ChatModelCatalogResult => {
        const selectedModelId = getSelectedModelId();

        return getModels().map((model) => ({
          id: model.id,
          label: model.label,
          inputCostPerMillion: model.inputCostPerMillion,
          outputCostPerMillion: model.outputCostPerMillion,
          defaultSelected: model.defaultSelected,
          selected: model.id === selectedModelId,
        }));
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAT_GET_SELECTED_MODEL,
    withIpcLogging(
      'CHAT_GET_SELECTED_MODEL',
      (): ChatSelectedModelResult => {
        return { modelId: getSelectedModelId() };
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAT_SET_SELECTED_MODEL,
    withIpcLogging(
      'CHAT_SET_SELECTED_MODEL',
      (_event: Electron.IpcMainInvokeEvent, request: ChatSetModelRequest): ChatSelectedModelResult => {
        if (!request || typeof request.modelId !== 'string') {
          throw new Error('Invalid model selection payload.');
        }

        return { modelId: setSelectedModelId(request.modelId) };
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAT_UNDO_LAST_ACTION,
    withIpcLogging(
      'CHAT_UNDO_LAST_ACTION',
      (_event: Electron.IpcMainInvokeEvent, request?: ChatUndoRequest): ChatUndoResult => {
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
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAT_GET_RETENTION_MODE,
    withIpcLogging(
      'CHAT_GET_RETENTION_MODE',
      (): ChatRetentionResult => {
        return { mode: getChatRetentionMode() };
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAT_SET_RETENTION_MODE,
    withIpcLogging(
      'CHAT_SET_RETENTION_MODE',
      (_event: Electron.IpcMainInvokeEvent, request: ChatSetRetentionRequest): ChatRetentionResult => {
        if (
          !request ||
          (request.mode !== 'session' &&
            request.mode !== '30d' &&
            request.mode !== 'forever')
        ) {
          throw new Error('Invalid chat retention mode payload.');
        }

        return { mode: setChatRetentionMode(request.mode) };
      },
    ),
  );

  // Autonomy handlers
  ipcMain.handle(
    IPC_CHANNELS.CHAT_GET_AUTONOMY_MODE,
    withIpcLogging(
      'CHAT_GET_AUTONOMY_MODE',
      (): ChatAutonomyModeResult => {
        return { mode: getAutonomyMode() };
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAT_SET_AUTONOMY_MODE,
    withIpcLogging(
      'CHAT_SET_AUTONOMY_MODE',
      (_event: Electron.IpcMainInvokeEvent, request: ChatSetAutonomyModeRequest): ChatAutonomyModeResult => {
        if (
          !request ||
          (request.mode !== 'auto' &&
            request.mode !== 'confirm')
        ) {
          throw new Error('Invalid autonomy mode payload.');
        }
        return { mode: setAutonomyMode(request.mode) };
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAT_LIST_PENDING_ACTIONS,
    withIpcLogging(
      'CHAT_LIST_PENDING_ACTIONS',
      (): ChatListPendingActionsResponse => {
        return { actions: loadPendingActions() };
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAT_RESOLVE_PENDING_ACTION,
    withIpcLogging(
      'CHAT_RESOLVE_PENDING_ACTION',
      async (_event: Electron.IpcMainInvokeEvent, request: ChatResolvePendingActionRequest): Promise<ChatResolvePendingActionResponse> => {
        const validatedRequest = resolvePendingActionSchema.parse(request ?? {});

        const pending = getPendingAction(validatedRequest.actionId);
        if (!pending) {
          return {
            ok: false,
            actionId: validatedRequest.actionId,
            lifecycle: 'rejected',
            message: 'Pending action not found (may have already been resolved).',
          };
        }

        if (validatedRequest.decision === 'reject') {
          removePendingAction(validatedRequest.actionId);
          return {
            ok: true,
            actionId: validatedRequest.actionId,
            lifecycle: 'rejected',
            message: 'Action rejected. No changes were made.',
          };
        }

        // Approve: execute the stored tool payload with autonomy bypass
        removePendingAction(validatedRequest.actionId);

        let result;
        try {
          result = await executeToolCall(
            { name: pending.toolName, input: pending.input },
            {
              toolCallId: `autonomy-approve-${validatedRequest.actionId}`,
              autonomyBypass: true,
            },
          );
        } catch (execError) {
          // Restore pending action on execution failure
          requeuePendingAction(pending);
          throw execError;
        }

        if (result.ok) {
          return {
            ok: true,
            actionId: validatedRequest.actionId,
            lifecycle: 'executed',
            message: result.output.message,
            taskEventId: result.output.actionCard?.taskEventId,
            actionCard: result.output.actionCard,
          };
        }

        // Execution returned an error -- restore pending action for retry
        requeuePendingAction(pending);

        return {
          ok: false,
          actionId: validatedRequest.actionId,
          lifecycle: 'pending',
          message: result.error.message,
        };
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.OLLAMA_STATUS,
    withIpcLogging(
      'OLLAMA_STATUS',
      async () => {
        clearOllamaDetectionCache();
        return detectOllama();
      },
    ),
  );
};
