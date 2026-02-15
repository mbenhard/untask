import type {
  IdentityContextSnapshotRequest,
  IdentityContextSnapshotResult,
  SettingsBootstrapState,
} from './ipc';

export type FluskApi = {
  getBootstrapState: () => Promise<SettingsBootstrapState>;
  getIdentityContextSnapshot: (
    request?: IdentityContextSnapshotRequest,
  ) => Promise<IdentityContextSnapshotResult>;
};

declare global {
  interface Window {
    flusk?: FluskApi;
  }
}

export {};
