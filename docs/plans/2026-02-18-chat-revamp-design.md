# Chat Window Revamp: Threads + Bird Mascot

**Date**: 2026-02-18
**Status**: Design

## Summary

Two changes to the chat panel:

1. **Threads as a view** — Replace the `ThreadDropdown` popover with a full-panel thread list view. The chat panel switches between "thread list" and "conversation" views.
2. **Bird mascot as AI avatar** — Use the existing bird mascot SVG (from `icons/animation/`) as the assistant identity at three scales: empty state centerpiece, streaming indicator, and inline message avatar.

No changes to design language, layout proportions, or interaction patterns beyond what's described here.

---

## 1. View Switching

### Current behavior

The chat panel (`motion.aside` in `AppShell.tsx`) has one view: the conversation. Threads are accessed via a `ThreadDropdown` popover triggered by clicking the thread title in the header. The dropdown is absolute-positioned (`right-0 top-full z-40 w-[312px]`) with search, time-grouped list, and per-item archive/delete actions.

### New behavior

The panel body switches between two views based on a `chatView` state:

```
type ChatView = 'threads' | 'conversation'
```

**Thread List View** (`chatView === 'threads'`):
- Renders the existing `ThreadDropdown` content (search bar, time-grouped conversation list, new thread button, archive/delete hover actions) as the full panel body instead of a floating dropdown.
- The content fills the same area that `ChatView` + `ChatInput` normally occupy.
- No changes to the list's internal behavior (search filtering, keyboard navigation, grouping logic).

**Conversation View** (`chatView === 'conversation'`):
- Same as current: `ChatView` message list + `ChatInput` footer.
- No changes to message rendering, step display, chip bar, or input behavior.

### State management

Add `chatView` to the app store (alongside `chatOverlayState`):

```typescript
// In app store
chatView: 'threads' | 'conversation'
setChatView: (view: 'threads' | 'conversation') => void
```

**Default on open — derived in `openChatOverlay`:**

The `openChatOverlay` action in `appStore.ts` currently just sets `chatOverlayState: 'open'`. It needs to also derive and set `chatView`:

```typescript
openChatOverlay: () => {
  // Need access to chatStore's activeConversationId.
  // Import useChatStore.getState or pass it via a parameter.
  const hasActiveConversation = useChatStore.getState().activeConversationId !== null;
  set({
    chatOverlayState: 'open',
    unreadProactive: false,
    chatView: hasActiveConversation ? 'conversation' : 'threads',
  });
}
```

This means `appStore.openChatOverlay` gains a cross-store dependency on `chatStore`. Since both are vanilla zustand stores (not React hooks), `useChatStore.getState()` is safe to call from inside `appStore`'s action.

**Transitions:**
- Selecting a thread from the list → `setChatView('conversation')` + `setActiveConversation(id)`
- Creating a new thread → `await createConversation()` then `setChatView('conversation')` (must await since `createConversation` is async)
- Pressing back arrow in conversation header → `setChatView('threads')`
- Collapsing the panel → no explicit reset needed; `openChatOverlay` re-derives on next open

### View transition animation

Simple crossfade using `AnimatePresence` with `mode="wait"`:

```tsx
<AnimatePresence mode="wait">
  {chatView === 'threads' ? (
    <motion.div key="threads" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0 }}>
      <ThreadListView ... />
    </motion.div>
  ) : (
    <motion.div key="conversation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0 }}>
      <ChatView ... />
      <ChatInput ... />
    </motion.div>
  )}
</AnimatePresence>
```

No horizontal slide — crossfade is simpler and consistent with the app's existing motion style.

**Duration**: Use `duration: 0` to match the app's existing view transition convention (see `overlayTransition` in `AppShell.tsx`). The crossfade is effectively instant — `AnimatePresence` still handles mount/unmount correctly with zero-duration transitions.

### Focus management on view switch

The existing `useEffect` in `AppShell.tsx` focuses the chat input when `chatOverlayState` becomes `'open'`. This doesn't re-fire when switching from threads → conversation within an already-open panel.

Add a second effect:

```typescript
// Focus chat input when switching to conversation view while panel is already open
useEffect(() => {
  if (chatOverlayState === 'open' && chatView === 'conversation') {
    const frameId = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frameId);
  }
}, [chatView, chatOverlayState]);
```

When switching to thread list view, `ThreadListView` handles its own search input auto-focus on mount (existing behavior from `ThreadDropdown`).

---

## 2. Header Changes

### Thread List View header

```
[  Threads                          X ]
```

- Left: title text "Threads" in the same monospace style as the current thread title
- Right: close icon button (Lucide `X`, 16px) to collapse panel to peek state
- No dropdown trigger — the list IS the view

### Conversation View header

```
[ <-  Thread Title                  X ]
```

- Left: back button (Lucide `ArrowLeft` or `ChevronLeft`, 16px) — navigates to thread list view
- Center-left: thread title, truncated, same monospace style as current
- Right: close icon button (same `X` as thread list view)

### What's removed

- `ChevronDown` icon on the thread title (no longer a dropdown trigger)
- `threadDropdownOpen` state in `AppShell.tsx`
- "Collapse" text button → replaced by `X` icon button
- All popover positioning logic (`absolute right-0 top-full z-40`)

---

## 3. Bird Mascot Component

### Source assets

Two SVGs in `icons/animation/`:
- `head.svg` — bird body with eye cutout, `viewBox="0 0 122.89 166.04"`
- `feet.svg` — stick legs with clawed toes, `viewBox="0 0 40.72 50.38"`

Six animation variants defined in `bop.html` as CSS keyframes on the body element.

### React component

New file: `flusk/src/renderer/components/chat/BirdMascot.tsx`

```tsx
type BirdMascotProps = {
  size: number;           // px, controls overall height
  animated?: boolean;     // default false
  variant?: 'float' | 'bop' | 'wobble' | 'double-tap' | 'snap' | 'smooth-bop'; // default 'smooth-bop'
  className?: string;     // color control via currentColor/fill
};
```

**Rendering rules by size:**

| Size range | What renders | Why |
|------------|-------------|-----|
| <= 20px | Body SVG only | Feet are illegible at this scale |
| > 20px | Body + feet + shadow | Full character composition |

**Color:** SVG paths use `fill="currentColor"` so the component inherits text color from its parent via `className`. No hardcoded `#303030`.

**Animation:** CSS `@keyframes` for the selected variant, applied to the body wrapper `div`. Uses `transform-origin: center bottom`. Shadow counter-animates (scale/opacity). Only runs when `animated={true}`.

**Reduced motion:** When `prefers-reduced-motion: reduce`, the component renders static regardless of `animated` prop.

**Composition structure (for sizes > 20px):**

```
<div className="bird-mascot" style={{ width: size * 0.75, height: size }}>
  <div className="bird-body">   <!-- head.svg inline, z-index: 2 -->
  <div className="bird-feet">   <!-- feet.svg inline, z-index: 1, margin-top: -10% overlap -->
  <div className="bird-shadow">  <!-- CSS radial-gradient ellipse -->
</div>
```

---

## 4. Bird Integration Points

### 4a. Empty state (48-64px, static)

**File:** `ChatView.tsx`, `EmptyState` component

Replace:
```tsx
// Current
<span className="font-mono text-sm font-medium tracking-[0.08em] text-muted-foreground/60">
  flusk
</span>
<p className="max-w-[260px] text-center text-xs ...">
  Your personal assistant. ...
</p>
```

With:
```tsx
<BirdMascot size={56} className="text-muted-foreground/50" />
<p className="max-w-[260px] text-center text-xs ...">
  Your personal assistant. ...
</p>
```

The bird replaces the "flusk" monospace label. Description text and suggestion pills remain.

### 4b. Streaming indicator (24-28px, animated)

**File:** `ChatView.tsx`, `StreamingIndicator` component

Replace the "Thinking_" animation:
```tsx
// Current
<motion.span animate={{ opacity: [0.2, 0.5, 0.2] }}>Thinking</motion.span>
<motion.span animate={{ opacity: [0, 0.5, 0] }}>_</motion.span>
```

With:
```tsx
<BirdMascot
  size={26}
  animated
  variant="smooth-bop"
  className="text-muted-foreground/50"
/>
```

The `smooth-bop` variant (v6) has a calm rise-hold-land rhythm that reads as "working on it" without being distracting. The shadow bobbing reinforces the grounded feel.

**Reduced motion fallback:** The `StreamingIndicator` component should conditionally render based on `prefersReducedMotion` (which it already receives as a prop):
- Normal: `<BirdMascot size={26} animated variant="smooth-bop" />`
- Reduced motion: `<BirdMascot size={26} />` (static bird, no animation — NOT the old "Thinking..." text)

The `BirdMascot` component itself also respects `prefers-reduced-motion` as a safety net, but the explicit conditional in `StreamingIndicator` keeps the intent clear.

### 4c. Message avatar (16-18px, static)

**File:** `ChatView.tsx`, assistant message rendering

Add a tiny static bird to the left of each assistant message:

```tsx
// Before the message content, for role === 'assistant'
<BirdMascot size={16} className="text-muted-foreground/40 shrink-0 mt-0.5" />
```

Positioned inline, aligned to the first line of text. Body-only at this size (no feet). Uses low-opacity fill so it doesn't compete with message content.

User messages remain unchanged (no avatar).

---

## 5. Component Refactoring

### ThreadDropdown.tsx -> ThreadListView.tsx

Rename and refactor:

**Remove:**
- `open` prop and conditional rendering
- Absolute positioning styles (`absolute right-0 top-full z-40 w-[312px]`)
- Outside-click-to-close behavior (parent handled this)
- Container `max-h-[420px]` constraint (now fills the panel body naturally)

**Keep:**
- Search input with auto-focus on mount
- Time-grouped conversation list (Today, Yesterday, This Week, This Month, Older)
- Keyboard navigation (ArrowUp/Down/Enter)
- Per-item hover actions (archive, delete)
- Active item highlighting
- Loading skeleton state
- `onSelect`, `onCreate`, `onArchive`, `onDelete` callbacks
- "New Thread" button stays inside the list body (top of the list, same position as in the current dropdown)

**Change:**
- Escape key: instead of calling `onClose()` (which closed the dropdown), call a new `onCollapse` callback that collapses the entire panel. This replaces the `onClose` prop.

**Add:**
- The component now fills `flex-1 min-h-0 overflow-hidden` in the panel layout
- Search bar sits fixed at top, list scrolls below it

### AppShell.tsx changes

**Remove:**
- `threadDropdownOpen` state
- `setThreadDropdownOpen` callbacks
- `setThreadDropdownOpen(false)` call inside `collapseChatOverlay`
- `<ThreadDropdown>` render and its absolute-position container
- "Collapse" text button
- The `useEffect` that resets `threadDropdownOpen` when `chatOverlayState` changes (line 246-250)

**Add:**
- `chatView` state from app store
- Conditional header rendering (thread list header vs conversation header)
- `<AnimatePresence>` wrapping the two views
- Back button click handler → `setChatView('threads')`
- Close icon button (replaces "Collapse" text)

### ChatView.tsx changes

**Modify:**
- `EmptyState`: replace "flusk" label with `<BirdMascot size={56} />`
- `StreamingIndicator`: replace "Thinking_" with `<BirdMascot size={26} animated />`
- Assistant message rendering: add `<BirdMascot size={16} />` inline avatar

---

## 6. Files Affected

| File | Change |
|------|--------|
| `components/chat/BirdMascot.tsx` | **New** — Bird mascot React component |
| `components/chat/ThreadListView.tsx` | **New** (refactored from ThreadDropdown) — Full-panel thread list |
| `components/chat/ThreadDropdown.tsx` | **Delete** — replaced by ThreadListView |
| `components/chat/ChatView.tsx` | **Modify** — bird in empty state, streaming indicator, message avatar |
| `components/layout/AppShell.tsx` | **Modify** — view switching, header redesign, remove dropdown logic |
| `stores/appStore.ts` | **Modify** — add `chatView` state + `setChatView` action |

---

## 7. What Does NOT Change

- Chat input behavior (submit, attachments, pending note context)
- Message rendering (markdown, steps, tool actions, chip bar)
- Conversation CRUD (create, archive, delete logic)
- Panel sizing, positioning, peek/open states
- Click-outside-to-collapse behavior
- Keyboard shortcuts (Cmd+K toggle)
- Error states, confirmation dialogs
- Framer Motion library usage
- Any non-chat UI
