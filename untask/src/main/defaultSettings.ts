// ─── Setting key constants ────────────────────────────────────────────────────
// Use these typed constants everywhere a setting key is referenced, rather than
// hardcoding bare string literals.

export const SETTING_KEY_AI_MODEL = 'ai_selected_model' as const;
export const SETTING_KEY_AI_IDENTITY = 'ai_identity' as const;
export const SETTING_KEY_AI_MEMORY = 'ai_memory' as const;
export const SETTING_KEY_AI_AUTONOMY_MODE = 'ai_autonomy_mode' as const;
export const SETTING_KEY_AI_AUTONOMY_PENDING_ACTIONS = 'ai_autonomy_pending_actions' as const;
export const SETTING_KEY_AI_OPENROUTER_KEY = 'ai_openrouter_key' as const;
export const SETTING_KEY_AI_PROVIDER = 'ai_provider' as const;
export const SETTING_KEY_AI_OPENAI_KEY = 'ai_openai_key' as const;
export const SETTING_KEY_AI_ANTHROPIC_KEY = 'ai_anthropic_key' as const;
export const SETTING_KEY_AI_OLLAMA_BASE_URL = 'ai_ollama_base_url' as const;
export const SETTING_KEY_CHAT_RETENTION_MODE = 'chat_retention_mode' as const;
export const SETTING_KEY_WINDOW_DISMISS_MODE = 'app.windowDismissMode' as const;
export const SETTING_KEY_SHORTCUT_TOGGLE_WINDOW = 'shortcut.toggleWindow' as const;
export const SETTING_KEY_SHORTCUT_QUICK_ADD = 'shortcut.quickAdd' as const;
export const SETTING_KEY_UI_FONT_SANS = 'ui_font_sans' as const;
export const SETTING_KEY_UI_FONT_MONO = 'ui_font_mono' as const;
export const SETTING_KEY_APP_BOOTSTRAP_COMPLETED = 'app.bootstrap_completed' as const;
export const SETTING_KEY_APP_LAUNCH_AT_LOGIN = 'app.launchAtLogin' as const;
export const SETTING_KEY_AI_ENABLED = 'ai.enabled' as const;
export const SETTING_KEY_AI_SHOW_ALL_MODELS = 'ai_show_all_models' as const;
export const SETTING_KEY_USER_ROLE = 'user.role' as const;
export const SETTING_KEY_COMMUNICATION_STYLE = 'communication.style' as const;
export const SETTING_KEY_USER_FOCUS = 'user.focus' as const;
export const SETTING_KEY_REMINDERS_SYNC_ENABLED = 'reminders.sync_enabled' as const;
export const SETTING_KEY_REMINDERS_LIST_ID = 'reminders.list_id' as const;
export const SETTING_KEY_REMINDERS_SYNC_FILTER = 'reminders.sync_filter' as const;
export const SETTING_KEY_REMINDERS_IMPORT_ENABLED = 'reminders.import_enabled' as const;
export const SETTING_KEY_NOTIFICATIONS_ENABLED = 'notifications.enabled' as const;
export const SETTING_KEY_NOTIFICATIONS_DEFAULT_OFFSET = 'notifications.default_offset' as const;
export const SETTING_KEY_NOTIFICATIONS_SOUND = 'notifications.sound' as const;

// ─── Default values ───────────────────────────────────────────────────────────
// Single source of truth for all persisted setting defaults.
//
// Note: `ai_identity` default is built by `buildSeedIdentityDocument()` in
// `ai/memory.ts`, personalized with the user's name. The entry below is
// intentionally empty to signal "use the seed at runtime". The `getIdentity()`
// accessor in memory.ts handles the fallback.

export const DEFAULT_SETTINGS: Readonly<Record<string, string>> = {
  [SETTING_KEY_AI_MODEL]: 'openai/gpt-4o-mini',
  [SETTING_KEY_AI_IDENTITY]: '',
  [SETTING_KEY_AI_MEMORY]: '',
  [SETTING_KEY_AI_AUTONOMY_MODE]: 'auto',
  [SETTING_KEY_AI_AUTONOMY_PENDING_ACTIONS]: '[]',
  [SETTING_KEY_AI_OPENROUTER_KEY]: '',
  [SETTING_KEY_AI_PROVIDER]: 'openrouter',
  [SETTING_KEY_AI_OPENAI_KEY]: '',
  [SETTING_KEY_AI_ANTHROPIC_KEY]: '',
  [SETTING_KEY_AI_OLLAMA_BASE_URL]: 'http://localhost:11434',
  [SETTING_KEY_CHAT_RETENTION_MODE]: '30d',
  [SETTING_KEY_WINDOW_DISMISS_MODE]: 'persistent',
  [SETTING_KEY_SHORTCUT_TOGGLE_WINDOW]: 'CommandOrControl+Shift+Space',
  [SETTING_KEY_SHORTCUT_QUICK_ADD]: 'CommandOrControl+Shift+Q',
  [SETTING_KEY_UI_FONT_SANS]: 'geist',
  [SETTING_KEY_UI_FONT_MONO]: 'geist-mono',
  [SETTING_KEY_APP_BOOTSTRAP_COMPLETED]: 'false',
  [SETTING_KEY_APP_LAUNCH_AT_LOGIN]: 'false',
  [SETTING_KEY_AI_ENABLED]: 'true',
  [SETTING_KEY_AI_SHOW_ALL_MODELS]: 'false',
  [SETTING_KEY_REMINDERS_SYNC_ENABLED]: 'false',
  [SETTING_KEY_REMINDERS_SYNC_FILTER]: 'due_date_only',
  [SETTING_KEY_REMINDERS_IMPORT_ENABLED]: 'true',
  [SETTING_KEY_NOTIFICATIONS_ENABLED]: 'true',
  [SETTING_KEY_NOTIFICATIONS_DEFAULT_OFFSET]: 'at_due',
  [SETTING_KEY_NOTIFICATIONS_SOUND]: 'true',
};
