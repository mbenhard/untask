# Main UI Layout and View Navigation - Design Plan

Task 5: Implement the core application shell with three-zone navigation, frameless window chrome, view transitions, and persistent chat input.

## Decisions

- View state: single source of truth in new `useAppStore` Zustand store
- Remove `taskStore.view` and `taskStore.setView` to avoid UI/data drift
- Keep `taskStore.fetchTasks()` broad (no view-specific fetch filtering in Task 5)
- Chat mode: full replace (task view exits, chat takes content area)
- View transitions: direction-aware 200ms slide (Framer Motion)
- LiveThought: built with placeholder text, wired to AI later
- Aesthetic: Swiss minimal, luxury instrument feel, precise spacing
- Escape behavior: centralized layered dismiss in keyboard shortcut hook (not duplicated inside ChatInput)
- All file paths below are repo-root relative and include `flusk/`

## Architecture

```
AppShell (flex col, h-full)
+-- TitleBar (40px, drag region)
|   +-- [72px traffic light space]
|   +-- ViewTabs (Today | Projects | Inbox)
+-- ContentArea (flex-1, overflow-y-auto)
|   +-- [normal mode]: AnimatePresence -> TodayView / ProjectsView / InboxView
|   +-- [chat mode]: ChatConversation (placeholder)
+-- ChatInput (56px, fixed bottom)
```

## Implementation Steps

### Step 0: Start Taskmaster workflow

- Run `task-master set-status --id=5 --status=in-progress`
- After each substep, update task/subtask notes with implementation decisions and results

### Step 1: Main process - add traffic light positioning

**File:** `flusk/src/main/index.ts`

Add `trafficLightPosition: { x: 12, y: 12 }` to BrowserWindow config. Already has `frame: false` and `titleBarStyle: 'hidden'`.

### Step 2: Create appStore

**File:** `flusk/src/renderer/stores/appStore.ts` (new)

```ts
type AppStore = {
  activeView: 'today' | 'projects' | 'inbox'
  previousViewIndex: number
  isChatMode: boolean
  setView: (view: AppStore['activeView']) => void
  enterChatMode: () => void
  exitChatMode: () => void
}
```

- `previousViewIndex` tracks which direction to animate (compare old vs new index)
- `setView` updates `activeView` and stores the previous index
- `enterChatMode` / `exitChatMode` toggle `isChatMode`

### Step 3: Update taskStore

**File:** `flusk/src/renderer/stores/taskStore.ts`

- Remove `TaskView` type, `view` state, and `setView` action from task store
- Keep `fetchTasks` unchanged: load complete task set from IPC and derive views in selectors/UI
- Keep selectors per view (`selectTodayTasks`, `selectProjectTasks`, `selectInboxTasks`)
- Let `AppShell` choose which selector to render based on `appStore.activeView`

### Step 4: Create keyboard shortcuts hook

**File:** `flusk/src/renderer/hooks/useKeyboardShortcuts.ts` (new)

Global keyboard listener:
- `1` / `2` / `3`: switch views (only when no input/textarea is focused)
- `Cmd+K` / `Ctrl+K`: focus chat input
- `Escape`: layered dismiss (clear input -> exit chat mode -> could hide window later)

Implementation:
- Single `useEffect` with `keydown` on `window`
- Skip `1/2/3` while text entry is focused
- Always allow `Cmd+K` / `Ctrl+K`
- Escape ownership lives here to prevent duplicate behavior between input-local and global handlers
- Escape order for Task 5: if input has text -> clear text; else if in chat mode -> exit chat mode; else no-op

### Step 5: Create AppShell

**File:** `flusk/src/renderer/components/layout/AppShell.tsx` (new)

Root layout component:
- Flex column, full height
- Renders TitleBar, ContentArea, ChatInput
- ContentArea switches between view components and chat mode
- Uses `AnimatePresence` with `mode="wait"` for view transitions
- Passes `direction` (1 or -1) to variants based on `previousViewIndex`

Direction-aware slide variants:
```ts
const variants = {
  enter: (direction: number) => ({ x: direction * 200, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction * -200, opacity: 0 }),
}
// duration: 200ms, ease: easeOut
// prefers-reduced-motion: opacity only
```

### Step 6: Create TitleBar

**File:** `flusk/src/renderer/components/layout/TitleBar.tsx` (new)

- 40px height, full width
- CSS class `drag-region` on the container
- First 72px is empty (traffic light space)
- View tabs: three buttons with `no-drag` class
- Active tab: `text-foreground` with sliding indicator (Framer Motion `layoutId="tab-indicator"`)
- Inactive tab: `text-muted-foreground`
- Tab indicator: 2px bottom border or background pill that slides between active tabs

Sliding indicator pattern:
```tsx
{tabs.map(tab => (
  <button key={tab.id} onClick={() => setView(tab.id)} className="no-drag relative ...">
    {tab.label}
    {activeView === tab.id && (
      <motion.div
        layoutId="tab-indicator"
        className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground"
        transition={{ duration: 0.15 }}
      />
    )}
  </button>
))}
```

### Step 7: Create ChatInput

**File:** `flusk/src/renderer/components/layout/ChatInput.tsx` (new)

- Fixed bottom, 56px height, full width
- Background: `bg-card` (maps to `#262626` dark)
- 1px top border: `border-t border-border`
- 16px horizontal padding
- Uses shadcn `Input` component, restyled: no visible border, transparent background
- Placeholder: "Ask anything..."
- Right side: subtle `Cmd+K` hint text in muted-foreground
- `ref` exposed for programmatic focus from keyboard shortcut
- On focus + typing: calls `appStore.enterChatMode()`
- On Cmd+Enter: submit (placeholder, no actual send logic yet)
- Do not own Escape here; let `useKeyboardShortcuts` coordinate layered dismiss

### Step 8: Create view components

**Files:** (all new)
- `flusk/src/renderer/components/views/TodayView.tsx`
- `flusk/src/renderer/components/views/ProjectsView.tsx`
- `flusk/src/renderer/components/views/InboxView.tsx`

All are placeholder views with:
- 16px padding
- Empty state message centered in muted-foreground text
- TodayView includes LiveThought slot at top

Empty states:
- Today: "Nothing planned. Ask AI to suggest your day."
- Projects: "No projects yet."
- Inbox: "Inbox is empty."

### Step 9: Create LiveThought

**File:** `flusk/src/renderer/components/layout/LiveThought.tsx` (new)

- Full width, 8px vertical padding, `bg-secondary` background, rounded-lg
- Left: Lucide `Sparkles` icon in muted-foreground
- Center: 13px text in muted-foreground
- Right: ghost button "Plan my day" + dismiss X icon button
- Fade-in animation on mount (200ms)
- Session dismiss: `useState(true)` for visibility, clicking X sets to false
- Placeholder text: "3 overdue items and nothing planned for today yet."

### Step 10: Wire up App.tsx

**File:** `flusk/src/renderer/App.tsx`

Replace current content with `<AppShell />`. Remove `DragBar` import and `useBootstrapState` hook (bootstrap check moves inside AppShell or gets removed for now).

### Step 11: Delete DragBar

**File:** `flusk/src/renderer/components/DragBar.tsx`

Delete this file entirely. TitleBar replaces it.

### Step 12: Validate touched scope before marking done

- Run `npm run lint` in `flusk/`
- Run `npx tsc --noEmit` in `flusk/`
- Run focused smoke test via `npm run start` and execute checklist below

## File Summary

| File | Action |
|------|--------|
| `flusk/src/main/index.ts` | Edit: add trafficLightPosition |
| `flusk/src/renderer/stores/appStore.ts` | Create |
| `flusk/src/renderer/stores/taskStore.ts` | Edit: remove `view` and `setView`; keep data selectors |
| `flusk/src/renderer/hooks/useKeyboardShortcuts.ts` | Create |
| `flusk/src/renderer/components/layout/AppShell.tsx` | Create |
| `flusk/src/renderer/components/layout/TitleBar.tsx` | Create |
| `flusk/src/renderer/components/layout/ChatInput.tsx` | Create |
| `flusk/src/renderer/components/layout/LiveThought.tsx` | Create |
| `flusk/src/renderer/components/views/TodayView.tsx` | Create |
| `flusk/src/renderer/components/views/ProjectsView.tsx` | Create |
| `flusk/src/renderer/components/views/InboxView.tsx` | Create |
| `flusk/src/renderer/App.tsx` | Edit: use AppShell |
| `flusk/src/renderer/components/DragBar.tsx` | Delete |

## Testing Checklist

1. Window dragging works via title bar area
2. Traffic lights positioned correctly at 12px from top-left
3. Clicking tabs switches views with direction-aware slide animation
4. Pressing 1/2/3 switches views (not when typing in input)
5. Tab indicator slides smoothly between active tabs
6. Cmd+K focuses chat input
7. Typing in chat input triggers chat mode transition
8. Escape exits chat mode and returns to task view
9. LiveThought shows on TodayView with placeholder text
10. LiveThought dismiss (X) hides for session
11. Empty states show correctly in all three views
12. prefers-reduced-motion falls back to opacity transitions
13. Window min/max constraints still work (480x520 to 900x900)
14. No view-state drift: active tab and rendered content always match after click and keyboard navigation
15. `taskStore.fetchTasks()` still returns full data set and all three selectors behave correctly
16. `npm run lint` and `npx tsc --noEmit` pass in `flusk/`
