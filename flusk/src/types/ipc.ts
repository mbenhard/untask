import type {
  IdentityContextCompileRequest,
  IdentityContextDebugSnapshot,
} from './assistant';

export const IPC_CHANNELS = {
  SETTINGS_GET_BOOTSTRAP_STATE: 'settings:get-bootstrap-state',
  SETTINGS_GET_IDENTITY_CONTEXT_SNAPSHOT:
    'settings:get-identity-context-snapshot',
} as const;

export type SettingsBootstrapState = {
  status: 'ready';
};

export type IdentityContextSnapshotRequest = IdentityContextCompileRequest;
export type IdentityContextSnapshotResult = IdentityContextDebugSnapshot;
