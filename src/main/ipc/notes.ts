import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../types/ipc';
import { withIpcLogging } from './helpers';
import { noteIdSchema, noteTitleSchema, noteSaveSchema } from './schemas';
import {
  createNote,
  getNote,
  saveNote,
  archiveNote,
  restoreNote,
  deleteNote,
  listNotes,
  pinNote,
  unpinNote,
  duplicateNote,
} from '../services/notesService';

export const registerNotesHandlers = (): void => {
  ipcMain.handle(
    IPC_CHANNELS.NOTES_LIST,
    withIpcLogging('NOTES_LIST', () => {
      return listNotes();
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.NOTES_GET,
    withIpcLogging('NOTES_GET', (_event: Electron.IpcMainInvokeEvent, idInput: string) => {
      const id = noteIdSchema.parse(idInput);
      return getNote(id);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.NOTES_CREATE,
    withIpcLogging('NOTES_CREATE', (_event: Electron.IpcMainInvokeEvent, titleInput?: string) => {
      const title = noteTitleSchema.parse(titleInput);
      return createNote(title);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.NOTES_SAVE,
    withIpcLogging('NOTES_SAVE', (_event: Electron.IpcMainInvokeEvent, idInput: string, contentInput: string, titleInput?: string) => {
      const validated = noteSaveSchema.parse({
        id: idInput,
        content: contentInput,
        title: titleInput,
      });
      return saveNote(validated.id, validated.content, validated.title);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.NOTES_ARCHIVE,
    withIpcLogging('NOTES_ARCHIVE', (_event: Electron.IpcMainInvokeEvent, idInput: string) => {
      const id = noteIdSchema.parse(idInput);
      return archiveNote(id);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.NOTES_RESTORE,
    withIpcLogging('NOTES_RESTORE', (_event: Electron.IpcMainInvokeEvent, idInput: string) => {
      const id = noteIdSchema.parse(idInput);
      return restoreNote(id);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.NOTES_DELETE,
    withIpcLogging('NOTES_DELETE', (_event: Electron.IpcMainInvokeEvent, idInput: string) => {
      const id = noteIdSchema.parse(idInput);
      return deleteNote(id);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.NOTES_PIN,
    withIpcLogging('NOTES_PIN', (_event: Electron.IpcMainInvokeEvent, idInput: string) => {
      const id = noteIdSchema.parse(idInput);
      return pinNote(id);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.NOTES_UNPIN,
    withIpcLogging('NOTES_UNPIN', (_event: Electron.IpcMainInvokeEvent, idInput: string) => {
      const id = noteIdSchema.parse(idInput);
      return unpinNote(id);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.NOTES_DUPLICATE,
    withIpcLogging('NOTES_DUPLICATE', (_event: Electron.IpcMainInvokeEvent, idInput: string) => {
      const id = noteIdSchema.parse(idInput);
      return duplicateNote(id);
    }),
  );
};
