import { app, ipcMain, shell } from 'electron';
import {
  IPC_CHANNELS,
  type SettingsBootstrapState,
  type DockModeResult,
  type IdentityContextSnapshotRequest,
  type IdentityContextSnapshotResult,
  type MemoryPromotionEvaluationResultPayload,
  type MemoryPromotionConfirmResultPayload,
  type ChatKernelStatusResultPayload,
  type ChatKernelOrchestrationRequestPayload,
  type ChatKernelOrchestrationResultPayload,
  type UpdateInfo,
} from '../../types/ipc';
import { withIpcLogging } from './helpers';
import { launchAtLoginSchema } from './schemas';
import { buildCanonicalRuntimeContext } from '../ai/contextBuilder';
import { buildSystemPrompt } from '../ai/systemPrompt';
import { getSetting, isBootstrapCompleted, setSetting } from '../services/settingsService';
import { SETTING_KEY_APP_LAUNCH_AT_LOGIN } from '../defaultSettings';
import {
  requestHideFromRenderer,
  onEscapeLayerExit,
} from '../window/summonController';
import { dockModeSchema, readDockMode, applyDockMode, DOCK_MODE_KEY } from '../window/dockMode';
import { reRegisterShortcuts, getShortcutRegistrationStatus } from '../shortcuts';
import {
  checkForUpdates as runUpdateCheck,
  getUpdateInfo as getCachedUpdateInfo,
} from '../services/updateChecker';

export const registerAppHandlers = (): void => {
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET_BOOTSTRAP_STATE,
    withIpcLogging(
      'SETTINGS_GET_BOOTSTRAP_STATE',
      (): SettingsBootstrapState => ({
        status: isBootstrapCompleted() ? 'ready' : 'onboarding',
      }),
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.APP_REQUEST_HIDE,
    withIpcLogging('APP_REQUEST_HIDE', () => {
      requestHideFromRenderer();
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.APP_ESCAPE_LAYER_EXIT,
    withIpcLogging('APP_ESCAPE_LAYER_EXIT', () => {
      onEscapeLayerExit();
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.APP_GET_LAUNCH_AT_LOGIN,
    withIpcLogging('APP_GET_LAUNCH_AT_LOGIN', () => {
      const stored = getSetting(SETTING_KEY_APP_LAUNCH_AT_LOGIN);
      const enabled = stored === 'true';
      const supported =
        process.platform === 'win32' || (process.platform === 'darwin' && app.isPackaged);
      return { enabled, applied: supported };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.APP_SET_LAUNCH_AT_LOGIN,
    withIpcLogging('APP_SET_LAUNCH_AT_LOGIN', (_event: Electron.IpcMainInvokeEvent, enabledInput: unknown) => {
      const enabled = launchAtLoginSchema.parse(enabledInput);
      setSetting(SETTING_KEY_APP_LAUNCH_AT_LOGIN, String(enabled));
      const supported =
        process.platform === 'win32' || (process.platform === 'darwin' && app.isPackaged);

      if (!supported) {
        return {
          enabled,
          applied: false,
          error: 'Launch at login is unavailable in this runtime.',
        };
      }

      try {
        app.setLoginItemSettings({ openAtLogin: enabled });
        return { enabled, applied: true };
      } catch (error) {
        return {
          enabled,
          applied: false,
          error: error instanceof Error ? error.message : 'Failed to apply login item setting',
        };
      }
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.APP_GET_DOCK_MODE,
    withIpcLogging(
      'APP_GET_DOCK_MODE',
      (): DockModeResult => {
        return { mode: readDockMode() };
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.APP_SET_DOCK_MODE,
    withIpcLogging(
      'APP_SET_DOCK_MODE',
      (_event: Electron.IpcMainInvokeEvent, modeInput: unknown): DockModeResult => {
        const mode = dockModeSchema.parse(modeInput);
        setSetting(DOCK_MODE_KEY, mode);
        applyDockMode(mode);
        return { mode };
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.APP_GET_VERSION,
    withIpcLogging('APP_GET_VERSION', (): string => {
      return app.getVersion();
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.SHORTCUT_UPDATE,
    withIpcLogging('SHORTCUT_UPDATE', () => {
      reRegisterShortcuts();
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.SHORTCUT_GET_REGISTRATION_STATUS,
    withIpcLogging(
      'SHORTCUT_GET_REGISTRATION_STATUS',
      (): import('../../types/ipc').ShortcutRegistrationStatusResult => {
        return {
          status: {
            'shortcut.toggleWindow': getShortcutRegistrationStatus('shortcut.toggleWindow'),
            'shortcut.quickAdd': getShortcutRegistrationStatus('shortcut.quickAdd'),
          },
        };
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET_IDENTITY_CONTEXT_SNAPSHOT,
    withIpcLogging(
      'SETTINGS_GET_IDENTITY_CONTEXT_SNAPSHOT',
      async (
        _event: Electron.IpcMainInvokeEvent,
        request?: IdentityContextSnapshotRequest,
      ): Promise<IdentityContextSnapshotResult> => {
        const { liveContext } = buildCanonicalRuntimeContext();
        const result = buildSystemPrompt({
          userMessage: request?.request ?? '',
          liveContext: request?.liveContext
            ? { ...liveContext, ...request.liveContext }
            : liveContext,
        });
        return result.contextSnapshot;
      },
    ),
  );

  // Memory promotion removed -- AI decides directly via tools.
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_EVALUATE_MEMORY_PROMOTION,
    withIpcLogging(
      'SETTINGS_EVALUATE_MEMORY_PROMOTION',
      (): MemoryPromotionEvaluationResultPayload => ({
        action: 'journal_only',
        proposedLayer: 'identity',
        proposedEntry: '',
        confidence: 0,
        requiresConfirmation: false,
        reasons: [],
        impactSignals: [],
      }),
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_CONFIRM_MEMORY_PROMOTION,
    withIpcLogging(
      'SETTINGS_CONFIRM_MEMORY_PROMOTION',
      (): MemoryPromotionConfirmResultPayload => ({
        resolved: false,
        decision: {
          action: 'journal_only',
          proposedLayer: 'identity',
          proposedEntry: '',
          confidence: 0,
          requiresConfirmation: false,
          reasons: [],
          impactSignals: [],
        },
      }),
    ),
  );

  // Identity kernel status -- always ready (identity is in DB now).
  ipcMain.handle(
    IPC_CHANNELS.CHAT_GET_KERNEL_STATUS,
    withIpcLogging(
      'CHAT_GET_KERNEL_STATUS',
      async (): Promise<ChatKernelStatusResultPayload> => ({
        ready: true,
        diagnostics: [],
      }),
    ),
  );

  // Orchestration endpoint -- returns system prompt snapshot.
  ipcMain.handle(
    IPC_CHANNELS.CHAT_ORCHESTRATE_WITH_KERNEL,
    withIpcLogging(
      'CHAT_ORCHESTRATE_WITH_KERNEL',
      async (
        _event: Electron.IpcMainInvokeEvent,
        request: ChatKernelOrchestrationRequestPayload,
      ): Promise<ChatKernelOrchestrationResultPayload> => {
        const { liveContext } = buildCanonicalRuntimeContext();
        const result = buildSystemPrompt({
          userMessage: request.userMessage,
          liveContext: request.liveContext
            ? { ...liveContext, ...request.liveContext }
            : liveContext,
        });
        return {
          ok: true,
          kernelStatus: { ready: true, diagnostics: [] },
          context: result.contextSnapshot,
        };
      },
    ),
  );

  // Update checker handlers
  ipcMain.handle(
    IPC_CHANNELS.APP_CHECK_FOR_UPDATES,
    withIpcLogging(
      'APP_CHECK_FOR_UPDATES',
      async (): Promise<UpdateInfo> => {
        return await runUpdateCheck();
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.APP_GET_UPDATE_INFO,
    withIpcLogging(
      'APP_GET_UPDATE_INFO',
      (): UpdateInfo | null => {
        return getCachedUpdateInfo();
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SHELL_OPEN_EXTERNAL,
    withIpcLogging(
      'SHELL_OPEN_EXTERNAL',
      async (_event: Electron.IpcMainInvokeEvent, url: string): Promise<void> => {
        let parsed: URL;
        try {
          parsed = new URL(url);
        } catch {
          throw new Error('Invalid URL.');
        }
        const allowedProtocols = ['https:', 'http:', 'x-apple.systempreferences:'];
        if (!allowedProtocols.includes(parsed.protocol)) {
          throw new Error(`Refusing to open URL with scheme: ${parsed.protocol}`);
        }
        await shell.openExternal(url);
      },
    ),
  );
};
