# Scratchpad BlockNote Redesign

## Summary

Replace `@uiw/react-md-editor` with BlockNote to get a Notion-like inline editing experience. The scratchpad becomes a full view (not a slide-up panel) with custom slash menu commands for task creation and AI send.

## Storage & Data Model

No schema migration. The existing `scratchpad.content` TEXT column stores JSON-stringified BlockNote blocks instead of raw markdown.

**Backward compatibility**: On first load, if `content` isn't valid BlockNote JSON, treat it as legacy markdown and convert via `tryParseMarkdownToBlocks()`. After the first save, it's JSON going forward.

**AI serialization**: "Send to AI" serializes blocks → markdown via `blocksToMarkdownLossy()` before passing to the chat store. The AI gets readable text, not block JSON.

## UI & Navigation

The scratchpad becomes a full view at the same level as chat and tasks:

- `AppShell` gets a `scratchpad` view state alongside `tasks`/`chat`
- TitleBar/sidebar navigation gets a scratchpad entry
- Existing keyboard shortcut navigates to the view instead of toggling an overlay

**View layout**:
- Header: title "Scratchpad", save status indicator, "Send to AI" button
- Body: full-height BlockNote editor — no sidebars, no extra chrome
- BlockNote provides floating toolbar (selection formatting), slash menu, and drag handles natively

**Theme**: Pass `resolvedTheme` from `ThemeProvider` to BlockNote's `theme` prop.

**Removed**:
- Slide-up panel component and overlay backdrop
- Framer-motion panel animations
- `useFocusTrap` usage for the scratchpad

## Custom Slash Menu Commands

Two custom items under a "Flusk" group in the slash menu:

### `/task`
- Creates a task from the current block's text
- Calls `window.flusk.tasks.create({ title: blockText, status: 'inbox' })`
- Block stays in scratchpad (capture tool, not destructive)
- Brief inline confirmation

### `/send`
- Serializes all blocks to markdown
- Passes to `chatStore.sendMessage()` with existing task-extraction prompt
- Navigates to chat view

## Out of Scope
- Block-level selection for partial sends
- Inline AI rewriting
- Multiple scratchpad pages
- Rich embeds or media blocks

## Packages

- Add: `@blocknote/core`, `@blocknote/react`, `@blocknote/mantine` (or `@blocknote/shadcn` if available)
- Remove: `@uiw/react-md-editor`

## Files Changed

| File | Change |
|------|--------|
| `package.json` | Add blocknote deps, remove @uiw/react-md-editor |
| `stores/scratchpadStore.ts` | Store BlockNote JSON, add legacy markdown detection, add markdown serialization for AI |
| `components/scratchpad/Scratchpad.tsx` | Rewrite: full view with BlockNote editor, custom slash menu |
| `components/layout/AppShell.tsx` | Add scratchpad as a full view |
| `components/layout/TitleBar.tsx` | Add scratchpad navigation entry |
| `stores/appStore.ts` | Add `scratchpad` to view states |
| `hooks/useKeyboardShortcuts.ts` | Update shortcut to navigate to view |
