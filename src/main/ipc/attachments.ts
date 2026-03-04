import { BrowserWindow, dialog, ipcMain } from 'electron';
import {
  IPC_CHANNELS,
  type AttachmentSaveRequest,
  type AttachmentSaveForTaskRequest,
  type AttachmentIdRequest,
  type AttachmentPickAndSaveResult,
  type AttachmentRecord,
  type AttachmentListByTaskRequest,
  type AttachmentDeleteRecordRequest,
  type AttachmentPickAndSaveForTaskRequest,
  type AttachmentPickAndSaveForTaskResult,
  type AttachmentGetCountsByTaskIdsRequest,
  type AttachmentGetCountsByTaskIdsResult,
} from '../../types/ipc';
import { withIpcLogging } from './helpers';
import {
  saveAttachment,
  openAttachment,
  revealAttachment,
  deleteAttachment,
  readAttachment,
} from '../attachments';
import {
  getAttachmentsByTaskId,
  getAttachmentById,
  createAttachment,
  deleteAttachmentRecord,
  getAttachmentCountsByTaskIds,
  checkAttachmentFileExists,
} from '../services/attachmentService';

export const registerAttachmentHandlers = (): void => {
  ipcMain.handle(
    IPC_CHANNELS.ATTACHMENT_SAVE,
    withIpcLogging(
      'ATTACHMENT_SAVE',
      async (_event: Electron.IpcMainInvokeEvent, request: AttachmentSaveRequest): Promise<string> => {
        return await saveAttachment(request);
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.ATTACHMENT_OPEN,
    withIpcLogging(
      'ATTACHMENT_OPEN',
      async (_event: Electron.IpcMainInvokeEvent, request: AttachmentIdRequest): Promise<void> => {
        await openAttachment(request);
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.ATTACHMENT_REVEAL,
    withIpcLogging(
      'ATTACHMENT_REVEAL',
      (_event: Electron.IpcMainInvokeEvent, request: AttachmentIdRequest): void => {
        revealAttachment(request);
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.ATTACHMENT_DELETE,
    withIpcLogging(
      'ATTACHMENT_DELETE',
      async (_event: Electron.IpcMainInvokeEvent, request: AttachmentIdRequest): Promise<void> => {
        await deleteAttachment(request);
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.ATTACHMENT_READ,
    withIpcLogging(
      'ATTACHMENT_READ',
      async (_event: Electron.IpcMainInvokeEvent, request: AttachmentIdRequest): Promise<string> => {
        return await readAttachment(request);
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.ATTACHMENT_PICK_AND_SAVE,
    withIpcLogging(
      'ATTACHMENT_PICK_AND_SAVE',
      async (event: Electron.IpcMainInvokeEvent): Promise<AttachmentPickAndSaveResult> => {
        const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
        const dialogOptions = {
          title: 'Attach files',
          properties: ['openFile' as const, 'multiSelections' as const],
        };
        const result = owner
          ? await dialog.showOpenDialog(owner, dialogOptions)
          : await dialog.showOpenDialog(dialogOptions);

        if (result.canceled || result.filePaths.length === 0) {
          return { canceled: true, urls: [] };
        }

        const { readFile } = await import('node:fs/promises');
        const path = await import('node:path');

        const urls: string[] = [];
        for (const filePath of result.filePaths) {
          const data = await readFile(filePath);
          const filename = path.basename(filePath);
          const url = await saveAttachment({
            data: new Uint8Array(data),
            filename,
          });
          urls.push(url);
        }

        return { canceled: false, urls };
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.ATTACHMENT_SAVE_FOR_TASK,
    withIpcLogging(
      'ATTACHMENT_SAVE_FOR_TASK',
      async (
        _event: Electron.IpcMainInvokeEvent,
        request: AttachmentSaveForTaskRequest,
      ): Promise<AttachmentRecord> => {
        const url = await saveAttachment({
          data: request.data,
          filename: request.filename,
        });
        const storedName = url.replace('untask-file://', '');
        const created = createAttachment({
          taskId: request.taskId,
          storedName,
          originalName: request.filename,
          size: request.size ?? request.data.byteLength,
          mimeType: request.mimeType,
        });
        return { ...created, exists: true };
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.ATTACHMENT_LIST_BY_TASK,
    withIpcLogging(
      'ATTACHMENT_LIST_BY_TASK',
      (_event: Electron.IpcMainInvokeEvent, request: AttachmentListByTaskRequest): AttachmentRecord[] => {
        return getAttachmentsByTaskId(request.taskId).map((attachment) => ({
          ...attachment,
          exists: checkAttachmentFileExists(attachment.storedName),
        }));
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.ATTACHMENT_DELETE_RECORD,
    withIpcLogging(
      'ATTACHMENT_DELETE_RECORD',
      async (_event: Electron.IpcMainInvokeEvent, request: AttachmentDeleteRecordRequest): Promise<void> => {
        const record = getAttachmentById(request.id);
        if (record) {
          await deleteAttachment({ id: record.storedName });
          deleteAttachmentRecord(request.id);
        }
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.ATTACHMENT_GET_COUNTS_BY_TASK_IDS,
    withIpcLogging(
      'ATTACHMENT_GET_COUNTS_BY_TASK_IDS',
      (_event: Electron.IpcMainInvokeEvent, request: AttachmentGetCountsByTaskIdsRequest): AttachmentGetCountsByTaskIdsResult => {
        const countsMap = getAttachmentCountsByTaskIds(request.taskIds);
        const counts: Record<string, number> = {};
        for (const [taskId, count] of countsMap) {
          counts[taskId] = count;
        }
        return { counts };
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.ATTACHMENT_PICK_AND_SAVE_FOR_TASK,
    withIpcLogging(
      'ATTACHMENT_PICK_AND_SAVE_FOR_TASK',
      async (
        event: Electron.IpcMainInvokeEvent,
        request: AttachmentPickAndSaveForTaskRequest,
      ): Promise<AttachmentPickAndSaveForTaskResult> => {
        const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
        const dialogOptions = {
          title: 'Attach files',
          properties: ['openFile' as const, 'multiSelections' as const],
        };
        const result = owner
          ? await dialog.showOpenDialog(owner, dialogOptions)
          : await dialog.showOpenDialog(dialogOptions);

        if (result.canceled || result.filePaths.length === 0) {
          return { canceled: true, attachments: [] };
        }

        const { readFile, stat } = await import('node:fs/promises');
        const path = await import('node:path');

        const created: AttachmentRecord[] = [];
        for (const filePath of result.filePaths) {
          const data = await readFile(filePath);
          const originalName = path.basename(filePath);
          const fileStats = await stat(filePath);
          const url = await saveAttachment({
            data: new Uint8Array(data),
            filename: originalName,
          });
          const storedName = url.replace('untask-file://', '');
          const record = createAttachment({
            taskId: request.taskId,
            storedName,
            originalName,
            size: fileStats.size,
          });
          created.push({ ...record, exists: true });
        }

        return { canceled: false, attachments: created };
      },
    ),
  );
};
