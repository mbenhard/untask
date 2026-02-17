import { describe, it, expect } from 'vitest';

import { IPC_CHANNELS } from './ipc';

describe('IPC_CHANNELS', () => {
  it('contains app lifecycle channels', () => {
    expect(IPC_CHANNELS.APP_REQUEST_HIDE).toBe('app:request-hide');
    expect(IPC_CHANNELS.APP_ESCAPE_LAYER_EXIT).toBe('app:escape-layer-exit');
    expect(IPC_CHANNELS.APP_QUICK_ADD_PAYLOAD).toBe('app:quick-add-payload');
    expect(IPC_CHANNELS.APP_GET_LAUNCH_AT_LOGIN).toBe('app:get-launch-at-login');
    expect(IPC_CHANNELS.APP_SET_LAUNCH_AT_LOGIN).toBe('app:set-launch-at-login');
    expect(IPC_CHANNELS.APP_GET_WINDOW_DISMISS_MODE).toBe('app:get-window-dismiss-mode');
    expect(IPC_CHANNELS.APP_SET_WINDOW_DISMISS_MODE).toBe('app:set-window-dismiss-mode');
  });

  it('contains chat thread channels', () => {
    expect(IPC_CHANNELS.CHAT_CREATE_THREAD).toBe('chat:create-thread');
    expect(IPC_CHANNELS.CHAT_LIST_THREADS).toBe('chat:list-threads');
    expect(IPC_CHANNELS.CHAT_ARCHIVE_THREAD).toBe('chat:archive-thread');
    expect(IPC_CHANNELS.CHAT_DELETE_THREAD).toBe('chat:delete-thread');
  });

  it('contains all expected domain prefixes', () => {
    const channels = Object.values(IPC_CHANNELS);
    const prefixes = new Set(channels.map((c) => c.split(':')[0]));

    expect(prefixes).toContain('app');
    expect(prefixes).toContain('settings');
    expect(prefixes).toContain('task');
    expect(prefixes).toContain('chat');
    expect(prefixes).toContain('notes');
    expect(prefixes).toContain('search');
    expect(prefixes).toContain('backup');
  });

  it('has no duplicate channel values', () => {
    const channels = Object.values(IPC_CHANNELS);
    const unique = new Set(channels);
    expect(channels.length).toBe(unique.size);
  });
});
