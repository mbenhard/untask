import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../types/ipc';
import { withIpcLogging } from './helpers';
import { noteIdSchema, noteSaveSchema } from './schemas';
import {
  createNote,
  getNote,
  saveNote,
  archiveNote,
  restoreNote,
  restoreFromTrash,
  deleteNote,
  listNotes,
  pinNote,
  unpinNote,
  duplicateNote,
  migrateNoteTitlesToContent,
} from '../services/notesService';

export const registerNotesHandlers = (): void => {
  // One-time migration: move stored titles into note content
  migrateNoteTitlesToContent();
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
    withIpcLogging('NOTES_CREATE', () => {
      return createNote();
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.NOTES_SAVE,
    withIpcLogging('NOTES_SAVE', (_event: Electron.IpcMainInvokeEvent, idInput: string, contentInput: string) => {
      const validated = noteSaveSchema.parse({
        id: idInput,
        content: contentInput,
      });
      return saveNote(validated.id, validated.content);
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
    IPC_CHANNELS.NOTES_RESTORE_FROM_TRASH,
    withIpcLogging('NOTES_RESTORE_FROM_TRASH', (_event: Electron.IpcMainInvokeEvent, idInput: string) => {
      const id = noteIdSchema.parse(idInput);
      return restoreFromTrash(id);
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
