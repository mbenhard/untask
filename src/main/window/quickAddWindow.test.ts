import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IPC_CHANNELS } from '../../types/ipc';

type Listener = (...args: unknown[]) => void;

const electronState = {
  isPackaged: false,
  shouldUseDarkColors: false,
};

const ipcHandlers = new Map<string, Listener>();
const windowListeners = new Map<string, Listener>();

const mockMainWindow = {
  isDestroyed: vi.fn(() => false),
  webContents: {
    send: vi.fn(),
  },
};

const mockSummonWindow = vi.fn();
const mockGetSetting = vi.fn<(key: string) => string | null>(() => null);

const mockBrowserWindow = {
  setVisibleOnAllWorkspaces: vi.fn(),
  loadURL: vi.fn(async () => undefined),
  loadFile: vi.fn(async () => undefined),
  setSize: vi.fn(),
  setPosition: vi.fn(),
  setBounds: vi.fn(),
  getBounds: vi.fn(() => ({ x: 100, y: 120, width: 600, height: 60 })),
  showInactive: vi.fn(),
  focus: vi.fn(),
  hide: vi.fn(),
  isVisible: vi.fn(() => false),
  isDestroyed: vi.fn(() => false),
  on: vi.fn((event: string, handler: Listener) => {
    windowListeners.set(event, handler);
  }),
  webContents: {
    send: vi.fn(),
  },
};

const BrowserWindowCtor = vi.fn(function BrowserWindowCtor() {
  return mockBrowserWindow;
});
const ipcMainOn = vi.fn((channel: string, handler: Listener) => {
  ipcHandlers.set(channel, handler);
});
const ipcMainRemoveListener = vi.fn((channel: string) => {
  ipcHandlers.delete(channel);
});

vi.mock('electron', () => ({
  BrowserWindow: BrowserWindowCtor,
  ipcMain: {
    on: ipcMainOn,
    removeListener: ipcMainRemoveListener,
  },
  nativeTheme: {
    get shouldUseDarkColors() {
      return electronState.shouldUseDarkColors;
    },
  },
  screen: {
    getCursorScreenPoint: vi.fn(() => ({ x: 240, y: 180 })),
    getDisplayNearestPoint: vi.fn(() => ({
      workArea: { x: 0, y: 0, width: 1280, height: 800 },
    })),
  },
  app: {
    get isPackaged() {
      return electronState.isPackaged;
    },
    getAppPath: vi.fn(() => '/mock/app'),
  },
}));

vi.mock('../services/settingsService', () => ({
  getSetting: (key: string) => mockGetSetting(key),
}));

vi.mock('./summonController', () => ({
  summonWindow: () => mockSummonWindow(),
  getMainWindow: () => mockMainWindow,
}));

const loadModule = async () => {
  vi.resetModules();
  (globalThis as { QUICK_ADD_VITE_DEV_SERVER_URL?: string }).QUICK_ADD_VITE_DEV_SERVER_URL = 'http://localhost:5173';
  (globalThis as { QUICK_ADD_VITE_NAME?: string }).QUICK_ADD_VITE_NAME = 'quickadd';
  return import('./quickAddWindow');
};

describe('quickAddWindow', () => {
  beforeEach(() => {
    ipcHandlers.clear();
    windowListeners.clear();
    mockGetSetting.mockReset();
    mockSummonWindow.mockReset();
    mockMainWindow.isDestroyed.mockReturnValue(false);
    mockMainWindow.webContents.send.mockReset();

    BrowserWindowCtor.mockClear();
    ipcMainOn.mockClear();
    ipcMainRemoveListener.mockClear();

    mockBrowserWindow.setVisibleOnAllWorkspaces.mockClear();
    mockBrowserWindow.loadURL.mockClear();
    mockBrowserWindow.loadFile.mockClear();
    mockBrowserWindow.setSize.mockClear();
    mockBrowserWindow.setPosition.mockClear();
    mockBrowserWindow.setBounds.mockClear();
    mockBrowserWindow.showInactive.mockClear();
    mockBrowserWindow.focus.mockClear();
    mockBrowserWindow.hide.mockClear();
    mockBrowserWindow.webContents.send.mockClear();
    mockBrowserWindow.isVisible.mockReturnValue(false);
  });

  it('shows quick add with resolved theme payload and toggles closed on second invoke', async () => {
    mockGetSetting.mockReturnValue('dark');
    const quickAdd = await loadModule();

    quickAdd.createQuickAddWindow();
    quickAdd.showQuickAdd();

    expect(mockBrowserWindow.webContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.QUICK_ADD_PAYLOAD,
      expect.objectContaining({ theme: 'dark', text: '', source: 'empty' }),
    );
    expect(mockBrowserWindow.showInactive).toHaveBeenCalledTimes(1);
    expect(mockBrowserWindow.focus).toHaveBeenCalledTimes(1);

    mockBrowserWindow.isVisible.mockReturnValue(true);
    quickAdd.showQuickAdd();
    expect(mockBrowserWindow.hide).toHaveBeenCalledTimes(1);
  });

  it('routes quick-add navigate IPC to summon + task navigation', async () => {
    const quickAdd = await loadModule();
    quickAdd.createQuickAddWindow();

    const navigateHandler = ipcHandlers.get(IPC_CHANNELS.QUICK_ADD_NAVIGATE_TASK);
    expect(navigateHandler).toBeTypeOf('function');

    navigateHandler?.({}, 'task-123');

    expect(mockSummonWindow).toHaveBeenCalledTimes(1);
    expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.TASK_NAVIGATE,
      { taskId: 'task-123' },
    );
  });

  it('removes IPC listeners and clears instance on window close', async () => {
    const quickAdd = await loadModule();
    quickAdd.createQuickAddWindow();

    expect(ipcHandlers.has(IPC_CHANNELS.QUICK_ADD_HIDE)).toBe(true);
    expect(ipcHandlers.has(IPC_CHANNELS.QUICK_ADD_RESIZE)).toBe(true);
    expect(ipcHandlers.has(IPC_CHANNELS.QUICK_ADD_NAVIGATE_TASK)).toBe(true);

    const closedListener = windowListeners.get('closed');
    closedListener?.();

    expect(ipcMainRemoveListener).toHaveBeenCalledWith(
      IPC_CHANNELS.QUICK_ADD_HIDE,
      expect.any(Function),
    );
    expect(ipcMainRemoveListener).toHaveBeenCalledWith(
      IPC_CHANNELS.QUICK_ADD_RESIZE,
      expect.any(Function),
    );
    expect(ipcMainRemoveListener).toHaveBeenCalledWith(
      IPC_CHANNELS.QUICK_ADD_NAVIGATE_TASK,
      expect.any(Function),
    );
    expect(quickAdd.getQuickAddWindow()).toBeNull();
  });
});
