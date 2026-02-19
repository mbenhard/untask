import { ipcMain } from 'electron';
import type { z } from 'zod';
import {
  IPC_CHANNELS,
  type TaskDeleteRequestPayload,
  type TaskCompleteRequestPayload,
} from '../../types/ipc';
import type { TaskStatusConfig } from '../../types/models';
import { withIpcLogging } from './helpers';
import { taskDeleteRequestSchema, taskCompleteRequestSchema } from './schemas';
import {
  listTasks,
  createTask,
  createTaskSchema,
  updateTask,
  updateTaskSchema,
  deleteTask,
  completeTask,
  cancelTask,
  reopenTask,
  toggleToday,
  reorderTasks,
  undoLastUserTaskEvent,
  getTaskStatusConfig,
  setTaskStatusConfig,
} from '../services/taskService';
import { refreshTodayBadge } from '../tray';

export const registerTaskHandlers = (): void => {
  ipcMain.handle(
    IPC_CHANNELS.TASK_LIST,
    withIpcLogging('TASK_LIST', (_event: Electron.IpcMainInvokeEvent, filter?: Parameters<typeof listTasks>[0]) => {
      return listTasks(filter);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TASK_CREATE,
    withIpcLogging('TASK_CREATE', (_event: Electron.IpcMainInvokeEvent, input: z.infer<typeof createTaskSchema>) => {
      const result = createTask(input);
      refreshTodayBadge();
      return result;
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TASK_UPDATE,
    withIpcLogging('TASK_UPDATE', (_event: Electron.IpcMainInvokeEvent, input: z.infer<typeof updateTaskSchema>) => {
      const result = updateTask(input);
      refreshTodayBadge();
      return result;
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TASK_DELETE,
    withIpcLogging('TASK_DELETE', (_event: Electron.IpcMainInvokeEvent, request: TaskDeleteRequestPayload) => {
      const validated = taskDeleteRequestSchema.parse(request);
      const payload = typeof validated === 'string' ? { id: validated } : validated;
      deleteTask(payload.id, 'user', { cascade: payload.cascade === true });
      refreshTodayBadge();
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TASK_REORDER,
    withIpcLogging('TASK_REORDER', (_event: Electron.IpcMainInvokeEvent, ids: string[]) => {
      reorderTasks(ids);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TASK_COMPLETE,
    withIpcLogging('TASK_COMPLETE', (_event: Electron.IpcMainInvokeEvent, request: TaskCompleteRequestPayload) => {
      const validated = taskCompleteRequestSchema.parse(request);
      const payload = typeof validated === 'string' ? { id: validated } : validated;
      const { completed } = completeTask(payload.id, 'user', {
        completeChildren: payload.completeChildren === true,
      });
      refreshTodayBadge();
      return completed;
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TASK_TOGGLE_TODAY,
    withIpcLogging('TASK_TOGGLE_TODAY', (_event: Electron.IpcMainInvokeEvent, id: string) => {
      const result = toggleToday(id);
      refreshTodayBadge();
      return result;
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TASK_CANCEL,
    withIpcLogging('TASK_CANCEL', (_event: Electron.IpcMainInvokeEvent, id: string) => {
      const result = cancelTask(id, 'user');
      refreshTodayBadge();
      return result;
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TASK_REOPEN,
    withIpcLogging('TASK_REOPEN', (_event: Electron.IpcMainInvokeEvent, id: string) => {
      const result = reopenTask(id, 'user');
      refreshTodayBadge();
      return result;
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TASK_GET_STATUSES,
    withIpcLogging('TASK_GET_STATUSES', () => {
      return getTaskStatusConfig();
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TASK_SET_STATUSES,
    withIpcLogging('TASK_SET_STATUSES', (_event: Electron.IpcMainInvokeEvent, config: TaskStatusConfig) => {
      return setTaskStatusConfig(config);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TASK_UNDO_LAST_USER_ACTION,
    withIpcLogging(
      'TASK_UNDO_LAST_USER_ACTION',
      (): import('../../types/ipc').TaskUndoResultPayload => {
        const result = undoLastUserTaskEvent();
        if (!result) {
          return { ok: true, undone: false, message: 'No user action available to undo.' };
        }
        return {
          ok: true,
          undone: result.undone,
          message: result.undone
            ? 'Undid action successfully.'
            : (result.reason ?? 'No changes were made by undo.'),
          targetTaskId: result.targetTaskId,
          originalEventId: result.originalEventId,
          originalAction: result.originalAction,
        };
      },
    ),
  );
};
