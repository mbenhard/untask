import { app, BrowserWindow, net } from 'electron';

import { getSetting, setSetting } from './settingsService';

// ─── Setting keys ─────────────────────────────────────────────
const SETTING_KEY_LAST_UPDATE_CHECK = 'app.last_update_check' as const;
const SETTING_KEY_UPDATE_CHECK_ENABLED = 'app.update_check_enabled' as const;

// ─── GitHub repository placeholder ───────────────────────────
const GITHUB_OWNER = 'mbenhard';
const GITHUB_REPO = 'untask';
const RELEASES_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const MIN_CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes throttle

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  releaseNotes?: string;
}

// ─── In-memory cache ─────────────────────────────────────────
let cachedUpdateInfo: UpdateInfo | null = null;
let checkIntervalHandle: ReturnType<typeof setInterval> | null = null;
let lastCheckTime = 0;

// ─── Renderer notification ────────────────────────────────────

let updateChannel: string | null = null;

/**
 * Call this from the main process once the IPC channel name is known.
 * The update checker will push results to all open windows on that channel.
 */
export const setUpdateChannel = (channel: string): void => {
  updateChannel = channel;
};

const notifyRenderer = (info: UpdateInfo): void => {
  if (!updateChannel) return;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(updateChannel, info);
    }
  }
};

// ─── Semver comparison ───────────────────────────────────────

/**
 * Returns true if `candidate` is strictly newer than `current`.
 * Only handles simple X.Y.Z numeric semver. Pre-release suffixes are ignored.
 */
const isNewerVersion = (current: string, candidate: string): boolean => {
  const parse = (v: string): number[] =>
    v
      .replace(/^v/, '')
      .split('.')
      .map((part) => parseInt(part, 10))
      .filter((n) => !isNaN(n));

  const cur = parse(current);
  const cand = parse(candidate);

  const len = Math.max(cur.length, cand.length);
  for (let i = 0; i < len; i++) {
    const a = cur[i] ?? 0;
    const b = cand[i] ?? 0;
    if (b > a) return true;
    if (b < a) return false;
  }

  return false;
};

// ─── Check logic ─────────────────────────────────────────────

/**
 * Fetches the latest GitHub release and compares it to the running version.
 * Uses `net.fetch` (Electron's network layer) per Electron best practice.
 *
 * @param force If true, ignores the 15-minute throttle interval.
 */
export const checkForUpdates = async (force = false): Promise<UpdateInfo> => {
  const currentVersion = app.getVersion();

  // Throttle check if not forced
  if (!force && Date.now() - lastCheckTime < MIN_CHECK_INTERVAL_MS) {
    if (cachedUpdateInfo) {
      if (cachedUpdateInfo.hasUpdate) notifyRenderer(cachedUpdateInfo);
      return cachedUpdateInfo;
    }
  }
  lastCheckTime = Date.now();

  const updateCheckEnabled = getSetting(SETTING_KEY_UPDATE_CHECK_ENABLED);
  if (updateCheckEnabled === 'false') {
    const info: UpdateInfo = {
      hasUpdate: false,
      currentVersion,
      latestVersion: currentVersion,
      releaseUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`,
    };
    cachedUpdateInfo = info;
    return info;
  }

  try {
    const response = await net.fetch(RELEASES_API_URL, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `${app.getName()}/${currentVersion}`,
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API returned ${response.status}`);
    }

    const data = (await response.json()) as {
      tag_name?: string;
      html_url?: string;
      body?: string;
    };

    const latestVersion = (data.tag_name ?? '').replace(/^v/, '');
    const releaseUrl =
      data.html_url ?? `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;
    const releaseNotes = typeof data.body === 'string' ? data.body : undefined;

    const hasUpdate = latestVersion.length > 0 && isNewerVersion(currentVersion, latestVersion);

    const info: UpdateInfo = {
      hasUpdate,
      currentVersion,
      latestVersion: latestVersion || currentVersion,
      releaseUrl,
      releaseNotes,
    };

    cachedUpdateInfo = info;
    setSetting(SETTING_KEY_LAST_UPDATE_CHECK, new Date().toISOString());

    if (info.hasUpdate) {
      notifyRenderer(info);
    }

    return info;
  } catch (error) {
    // On network error, return no-update state so the UI stays clean.
    // Do not update the cache so a stale positive result is preserved.
    console.warn('[update-checker] Failed to check for updates:', error);

    const fallback: UpdateInfo = {
      hasUpdate: false,
      currentVersion,
      latestVersion: currentVersion,
      releaseUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`,
    };

    if (!cachedUpdateInfo) {
      cachedUpdateInfo = fallback;
    }

    return cachedUpdateInfo;
  }
};

/**
 * Returns the cached UpdateInfo from the last successful check, or null if
 * no check has been completed yet.
 */
export const getUpdateInfo = (): UpdateInfo | null => cachedUpdateInfo;

// ─── Scheduler ───────────────────────────────────────────────

/**
 * Starts the background update checker.
 * Performs an initial async check and then rechecks every 6 hours.
 * Does NOT block app startup.
 */
export const startUpdateChecker = (): void => {
  // Async fire-and-forget on startup
  void checkForUpdates();

  checkIntervalHandle = setInterval(() => {
    void checkForUpdates();
  }, CHECK_INTERVAL_MS);
};

/**
 * Stops the periodic update checker (call on `will-quit`).
 */
export const stopUpdateChecker = (): void => {
  if (checkIntervalHandle !== null) {
    clearInterval(checkIntervalHandle);
    checkIntervalHandle = null;
  }
};
