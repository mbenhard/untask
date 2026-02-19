import { ipcMain } from 'electron';
import {
  IPC_CHANNELS,
  type SearchQueryRequest,
  type SearchQueryResponse,
} from '../../types/ipc';
import { withIpcLogging } from './helpers';
import { searchTasks, searchNotes } from '../services/searchService';

export const registerSearchHandlers = (): void => {
  ipcMain.handle(
    IPC_CHANNELS.SEARCH_QUERY,
    withIpcLogging(
      'SEARCH_QUERY',
      async (_event: Electron.IpcMainInvokeEvent, request: SearchQueryRequest): Promise<SearchQueryResponse> => {
        const [taskResult, noteResult] = await Promise.all([
          searchTasks({ query: request.query, limit: request.limit }),
          searchNotes({ query: request.query, limit: request.limit }),
        ]);

        const taskResults = taskResult.results.map((r) => ({ ...r, type: 'task' as const }));
        const noteResults = noteResult.results.map((r) => ({ ...r, type: 'note' as const }));

        const types: ('task' | 'note')[] = [];
        if (taskResults.length > 0) types.push('task');
        if (noteResults.length > 0) types.push('note');

        return {
          results: [...taskResults, ...noteResults],
          total: taskResults.length + noteResults.length,
          types,
        };
      },
    ),
  );
};
