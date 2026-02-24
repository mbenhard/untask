import { BrowserWindow, dialog, ipcMain } from 'electron';
import {
  IPC_CHANNELS,
  type AttachmentSaveRequest,
  type AttachmentIdRequest,
  type AttachmentPickAndSaveResult,
} from '../../types/ipc';
import { withIpcLogging } from './helpers';
import {
  saveAttachment,
  openAttachment,
  revealAttachment,
  deleteAttachment,
  readAttachment,
} from '../attachments';

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
};
