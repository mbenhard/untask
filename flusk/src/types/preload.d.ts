import type { SettingsBootstrapState } from './ipc';

export type FluskApi = {
  getBootstrapState: () => Promise<SettingsBootstrapState>;
};

declare global {
  interface Window {
    flusk?: FluskApi;
  }
}

export {};
