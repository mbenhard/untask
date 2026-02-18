# Traditional App Behavior Fixes

**Date:** 2026-02-18
**Issue:** App window didn't show on launch; required clicking dock icon. Close button quit the app entirely.

## Summary

Implemented 5 changes to make Flusk behave like a traditional macOS desktop app.

## Changes

### 1. Show Window on Launch

**Problem:** Window created with `show: false` but never shown on startup.

**File:** `src/main/index.ts`

**Change:** Added `summonWindow()` call after `bootstrap()` in `app.whenReady()` callback.

```diff
 app.whenReady().then(() => {
   applyDevBranding();
   void emitIdentityContextDebugSnapshot();
   bootstrap();
   applyLaunchAtLogin();
   startDailyBackupScheduler();
+  summonWindow();
```

---

### 2. Close Button Hides Instead of Quits

**Problem:** Clicking red X button destroyed the window and triggered app quit on macOS.

**File:** `src/main/index.ts`

**Change:** Added `close` event handler that prevents default behavior and hides window instead.

```diff
 const createMainWindow = (): BrowserWindow => {
   // ... window creation ...
   restoreWindowBounds(window);

+  window.on('close', (event) => {
+    event.preventDefault();
+    hideWindow();
+  });
+
   // ... load URL ...
 };
```

**Import added:**
```diff
-import { initSummonController, summonWindow } from './window/summonController';
+import {
+  initSummonController,
+  summonWindow,
+  hideWindow,
+  restoreWindowBounds,
+} from './window/summonController';
```

---

### 3. Restore Window Position Immediately

**Problem:** Window bounds were restored on first `summonWindow()` call, causing visible repositioning.

**File:** `src/main/index.ts`, `src/main/window/summonController.ts`

**Change:** Moved bounds restoration into `createMainWindow()` so window appears at correct position from the start.

**summonController.ts** - extracted new function:
```typescript
export function restoreWindowBounds(window: BrowserWindow): void {
  const stored = parseBoundsJson(getSetting(BOUNDS_KEY));
  const bounds = resolveTargetBounds(stored, DEFAULT_WIDTH, DEFAULT_HEIGHT);
  window.setBounds(bounds);
}
```

**index.ts** - call in createMainWindow:
```diff
   webPreferences: { ... },
 });

+restoreWindowBounds(window);
+
+window.on('close', (event) => { ... });
```

**summonController.ts** - removed from summonWindow:
```diff
 export function summonWindow(): void {
   if (!win || win.isDestroyed()) return;

   suppressBlur();

-  if (!hasEverSummoned) {
-    const stored = parseBoundsJson(getSetting(BOUNDS_KEY));
-    const bounds = resolveTargetBounds(stored, DEFAULT_WIDTH, DEFAULT_HEIGHT);
-    win.setBounds(bounds);
-    hasEverSummoned = true;
-  }
-
   if (!win.isVisible()) {
     win.show();
   }
```

Also removed unused `hasEverSummoned` variable.

---

### 4. Add Cmd+W to Hide Window

**Problem:** No keyboard shortcut to hide/close window; no application menu.

**File:** `src/main/shortcuts.ts`

**Change:** Added application menu with Window > Close (Cmd+W) shortcut.

```typescript
import { type BrowserWindow, globalShortcut, Menu } from 'electron';
import { toggleWindow, showQuickAdd, hideWindow } from './window/summonController';

function setupApplicationMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Untask',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        {
          label: 'Close',
          accelerator: 'CmdOrCtrl+W',
          click: hideWindow,
        },
        { role: 'minimize' },
        { role: 'front' },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

export const registerGlobalShortcuts = (_mainWindow: BrowserWindow): void => {
  setupApplicationMenu();
  // ... existing shortcut registration ...
};
```

---

### 5. Verified Default Dismiss Mode

**File:** `src/main/window/dismissMode.ts`

**Status:** No change needed. Already defaults to `'persistent'` mode.

```typescript
export const DEFAULT_WINDOW_DISMISS_MODE: WindowDismissMode = 'persistent';
```

---

## Test Updates

**File:** `src/main/shortcuts.test.ts`

Added `Menu` mock to fix test failures:

```diff
 vi.mock('electron', () => ({
   globalShortcut: { ... },
+  Menu: {
+    buildFromTemplate: vi.fn(() => ({})),
+    setApplicationMenu: vi.fn(),
+  },
 }));
```

---

## Behavior Summary

| Before | After |
|--------|-------|
| Window hidden on launch | Window visible immediately |
| Red X quits app | Red X hides window (app stays running) |
| Window position loads late | Window position restored before show |
| No Cmd+W support | Cmd+W hides window |
| No app menu | Standard macOS app menu |

---

## Notes

- The `quick-hide` mode (auto-hide on blur) remains available as a user setting but defaults to `persistent`
- App still quits via `Cmd+Q`, dock menu "Quit", or tray menu "Quit"
- Close button behavior now matches standard macOS apps (Safari, Finder, etc.)
