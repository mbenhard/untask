export const IPC_CHANNELS = {
  SETTINGS_GET_BOOTSTRAP_STATE: 'settings:get-bootstrap-state',
} as const;

export type SettingsBootstrapState = {
  status: 'ready';
};
