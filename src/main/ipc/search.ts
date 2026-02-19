import { ipcMain } from 'electron';
import {
  IPC_CHANNELS,
  type SearchQueryRequest,
  type SearchQueryResponse,
} from '../../types/ipc';
import { withIpcLogging } from './helpers';
import { searchTasks } from '../services/searchService';

export const registerSearchHandlers = (): void => {
  ipcMain.handle(
    IPC_CHANNELS.SEARCH_QUERY,
    withIpcLogging(
      'SEARCH_QUERY',
      (_event: Electron.IpcMainInvokeEvent, request: SearchQueryRequest): SearchQueryResponse => {
        return searchTasks({
          query: request.query,
          limit: request.limit,
        });
      },
    ),
  );
};
