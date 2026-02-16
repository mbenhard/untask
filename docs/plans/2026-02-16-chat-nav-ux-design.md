# Chat & Navigation UX Improvements

## Problem

Three UX issues in the current app window:

1. **Chat requires typing to activate** — clicking the chat input only focuses it; the chat panel doesn't appear until you type text
2. **Chat blocks tab navigation** — when chat mode is active, it overlays all tab content; clicking tabs changes state invisibly underneath
3. **Tab animations are ugly and slow** — 200ms directional slide (200px horizontal + opacity) feels sluggish

## Changes

### 1. Tab click exits chat mode

**Files:** `appStore.ts`, possibly `AppShell.tsx`

When `setView()` is called while `isChatMode` is true, also call `exitChatMode()`. This applies to:
- Clicking tab buttons in TitleBar
- Keyboard shortcuts (1/2/3) — these already work when the input is not focused; no change needed there

**Not changing:** The 1/2/3 shortcuts stay blocked when a text input is focused — otherwise you couldn't type numbers in the chat input.

**Edge case:** If user has unsent draft text in the input, it stays. Refocusing the input later reopens chat with the draft intact.

### 2. Chat activates on focus

**Files:** `ChatInput.tsx`

Change `onFocus` to call `enterChatMode()` unconditionally (remove the text-length check). Keep `enterChatMode()` in `handleChange` — it's needed to reopen chat when the user types after a tab-switch exit (input stays focused but chat was closed, so onFocus doesn't re-fire). The call is a no-op when already in chat mode.

Ways to close chat:
- Press Escape
- Click any tab (from change #1)

Cmd+K focuses the input, which now automatically opens chat — no additional logic needed.

### 3. Quick fade tab transitions

**Files:** `AppShell.tsx`, `appStore.ts` (cleanup)

Replace directional slide with simple 100ms opacity crossfade:
- `viewVariants`: `enter: { opacity: 0 }`, `center: { opacity: 1 }`, `exit: { opacity: 0 }`
- Duration: 100ms easeOut
- Remove `transitionDirection`, `getDirection`, `previousViewIndex` logic
- Keep `AnimatePresence mode="wait"`
- Reduced motion users: keep existing ~120ms fade (already close enough)

Chat-to-tab transition uses the same fade for consistency.
