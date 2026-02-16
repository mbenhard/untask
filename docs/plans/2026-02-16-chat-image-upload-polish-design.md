# Chat Image Upload + Polish Design

**Date:** 2026-02-16
**Status:** Draft
**Scope:** Image attachments in AI chat, empty state redesign, tool-call message indicators, proactive memory behavior

---

## 1. Image Attachments

### Overview

Add image attachment support to the AI chat. Users can paste screenshots, drag files, or use a file picker to attach images to messages. The AI processes them using vision-capable models. Images are ephemeral — held in memory for the current turn, never persisted to the database.

### Primary Use Case

Screenshot an email, receipt, error, or UI → tell the AI what to do with it (create a task, summarize, extract info, etc.).

### Architecture

```
User attaches image(s)
  ↓
Held as base64 data URLs in renderer state
  ↓
Sent alongside text via existing IPC (CHAT_SEND)
  ↓
Main process builds multimodal message for AI SDK:
  { role: 'user', content: [
    { type: 'image', image: base64 },
    { type: 'text', text: userMessage }
  ]}
  ↓
AI processes and responds (existing streaming flow)
  ↓
Image data discarded after response completes
  ↓
Chat history shows "[Image attached]" placeholder (no image data stored)
```

### Input Methods

1. **Paste (Cmd+V):** Intercept paste events on the textarea. If clipboard contains image data, read as data URL, add to attachment list. Text paste works normally.

2. **Drag-and-drop:** The chat input footer area acts as a drop zone. On dragover, show a subtle border highlight. On drop, read image files and add to attachment list.

3. **File picker button:** Paperclip icon to the left of the textarea. Opens native file dialog filtered to images (png, jpg, webp, gif). Selected files added to attachment list.

### Constraints

- **Max 4 images per message**
- **Max 5MB per image, 20MB total per message**
- **Accepted types:** PNG, JPG, JPEG, WebP, GIF
- **Client-side resize:** Images larger than 2048px on any dimension are resized before encoding to keep base64 payload reasonable
- **No persistence:** Images exist only in renderer memory during composition and in the AI request payload. Not saved to SQLite.

### Model Compatibility

- **Vision-capable models** (Claude Haiku 4.5, Gemini 3 Flash): Send images as multimodal content parts via AI SDK
- **Non-vision models** (GLM-5, MiniMax, Kimi): Strip images from the message. Prepend a note to the user's text content: `"[User attached N image(s), but the current model doesn't support vision.]\n\n" + content`. This keeps the note in the user message itself — no separate system message needed.

### ChatInput UI Changes

**Layout:**

```
Without attachments:
  [paperclip] [textarea] [send/stop]

With attachments:
  [thumb1 ×] [thumb2 ×] [thumb3 ×]    ← preview strip above input border
  [paperclip] [textarea] [send/stop]
```

**Preview strip:**
- Appears above the input area, inside the chat input footer
- Thumbnails: 32px tall, rounded-md, aspect-ratio preserved
- Each has a tiny X button (top-right corner of thumbnail) to remove
- If 4 images attached, the paperclip button becomes disabled/muted
- Horizontal row, no wrapping (scrollable if needed, but 4 small thumbs should fit)

**Error states:**
- File too large: Brief inline toast/error below preview strip — "Image too large (max 5MB)" — auto-dismisses after 3s
- Wrong file type: "Only images are supported (PNG, JPG, WebP, GIF)"
- Max reached: Silently ignore additional attachments (button already disabled)

### IPC Changes

**`CHAT_SEND` payload extension:**

```typescript
// Before
{ content: string; modelId?: string }

// After
{ content: string; modelId?: string; images?: string[] }
// images = array of base64 data URLs
```

**No new IPC channels needed.** The existing send channel carries the image data.

### AI SDK Integration

```typescript
// In main/ai/chat.ts — buildUserMessage()
const userContent: UserContent = [];

if (images?.length) {
  for (const dataUrl of images) {
    userContent.push({ type: 'image', image: dataUrl });
  }
}

userContent.push({ type: 'text', text: content });

// Message format for AI SDK
{ role: 'user', content: userContent }
```

### Chat History Display

For past messages that had images attached (but images are now discarded):
- Show a small muted indicator: "N image(s) attached" below the message text
- No thumbnail, no image data — just an informational label
- Store `imageCount` in the existing `toolCalls` JSON metadata field on user messages (no schema migration needed)
- On save: `{ ...existingMeta, imageCount: images.length }`
- On render: read `imageCount` from metadata, show indicator if > 0

---

## 2. Empty State Redesign

### Current

Dashed border box with: "Start a conversation here. Ask Flusk to plan, edit tasks, or work with your notes."

### New Design

```
              flusk

  Your personal assistant. Asks before acting,
  double-checks risky changes, remembers your patterns.

  [Create a task]  [What's due today?]  [Summarize my week]
```

**Elements:**

1. **Name:** "flusk" in muted monospace, same styling as the chat panel header. Centered, small. Not a logo — just a grounding word.

2. **Personality primer:** One line describing how the AI behaves. Pulled from the soul/charter docs. Covers: asks clarifying questions, confirms before risky actions, learns patterns. Muted foreground, text-xs or text-sm. Centered.

3. **Suggestion chips:** 3 pill-shaped buttons below. Ghost variant with border. On click:
   - Pre-fill the chat input with the suggestion text
   - Auto-focus the textarea
   - Do NOT auto-send — user can edit before sending
   - Chips disappear once the first message exists in the conversation

**Suggestions (static for MVP):**
- "Create a task" → prefills "Create a task: "
- "What's due today?" → prefills "What's due today?"
- "Summarize my week" → prefills "Summarize my week"

---

## 3. Tool-Call Message Indicator

### Problem

All user messages look identical in the chat. No way to scan and see which messages triggered AI actions vs. which were simple Q&A.

### Solution

Add a small visual cue on user messages that led to tool executions:

- A tiny muted zap icon (or filled dot) at the bottom-right corner inside the user message bubble
- Only appears when the *next* assistant message in the conversation contains tool steps
- Styling: `text-muted-foreground/40`, `size-3` — barely visible unless you're looking for it
- Not interactive, purely informational
- Determined at render time by checking the subsequent message's steps array

### Implementation

```tsx
// In ChatView renderedMessages, for user messages:
const nextMessage = messages[index + 1];
const triggeredTools = nextMessage?.role === 'assistant'
  && nextMessage.steps.some(s => s.kind === 'tool');

// Inside user bubble:
{triggeredTools && (
  <Zap className="absolute bottom-1.5 right-2 size-3 text-muted-foreground/40" />
)}
```

Requires making the user bubble `relative` positioned.

---

## 4. Proactive Memory Behavior

### Problem

Chat messages are ephemeral — they can be cleared at any time, and retention modes may purge them. If the AI learns something important during a conversation (a preference, a decision, a pattern), that knowledge is lost when the chat is cleaned.

The AI needs to know **when** and **what** to save to durable memory (profile, patterns, journal) so that valuable context survives chat clearance.

### Behavior: Proactive With Confirmation

The AI should actively watch for memory-worthy information during conversation and announce saves before making them, giving the user a chance to object.

**What to save and where:**

| Signal | Memory Target | Example |
|--------|---------------|---------|
| Stable personal fact | User Profile | "I work at Acme Corp", "I'm based in Berlin" |
| Repeated preference | Patterns | Always wants tasks with deadlines, prefers morning planning |
| Decision or commitment | Journal | "Decided to postpone the launch to March" |
| Workflow habit | Patterns | "Always review tasks before EOD", "Prefers bullet-point summaries" |
| Correction of AI behavior | Patterns | "Don't suggest meetings before 10am" |

**What NOT to save:**
- Ephemeral context (what the user is working on *right now*)
- Things already captured as tasks or scratchpad notes
- Low-confidence inferences from a single data point
- Anything the user explicitly says is temporary

### Interaction Pattern

When the AI detects something worth remembering:

```
User: "I always batch my emails on Monday and Thursday mornings"

AI: "Got it — I'll remember that you batch emails on Monday
and Thursday mornings. [Saving to patterns]"
```

- The AI states what it's saving and where, in a single natural line
- Uses a tool call (`update_patterns` or `update_user_profile`) which shows as a tool step in the chat
- The user can undo via the existing action card system if they don't want it saved
- No separate confirmation dialog — the tool card IS the confirmation mechanism

### Confidence Threshold

- **Save immediately (with announcement):** Explicit statements ("I always...", "I prefer...", "Remember that..."), corrections, commitments
- **Ask first:** Inferred patterns from behavior ("I've noticed you tend to... — should I remember that?")
- **Don't save:** One-off mentions, speculative/hypothetical statements, emotional venting

### System Prompt Integration

Add to the AI's system prompt context assembly:

```
## Memory Behavior
- When the user shares stable facts, preferences, or patterns, save them
  using the appropriate tool (update_user_profile, update_patterns).
- Announce what you're saving: "I'll remember that [X]. [Saving to profile/patterns]"
- For inferred patterns (not explicitly stated), ask before saving.
- Don't save ephemeral context, things already captured as tasks, or
  low-confidence inferences.
- Chat messages may be cleared at any time. If something matters long-term,
  save it to memory — don't rely on chat history.
```

### Empty State Update

The personality primer in the empty state reflects this:

```
Your personal assistant. Asks before acting,
double-checks risky changes, and remembers
what matters — even after chats are cleared.
```

---

## 5. Files Changed (Estimated)

### New Files
- None expected — all changes fit within existing files

### Modified Files

| File | Changes |
|------|---------|
| `renderer/components/layout/ChatInput.tsx` | Add paperclip button, paste handler, drag-drop zone, preview strip |
| `renderer/components/chat/ChatView.tsx` | Empty state redesign, tool-call indicators, image-attached labels on history messages |
| `renderer/stores/chatStore.ts` | Add `pendingImages` state, extend `sendMessage` to accept images |
| `renderer/components/layout/AppShell.tsx` | Pass images through to sendMessage, handle image state |
| `preload/index.ts` | Extend chat.send type to include images array |
| `main/ipc/chat-handlers.ts` | Pass images through to AI chat function |
| `main/ai/chat.ts` | Build multimodal messages, handle vision/non-vision models |
| `main/ai/systemPrompt.ts` | Add memory behavior instructions to runtime policy section (lines ~63-102) |
| `types/chat.ts` | Extend message types with optional image metadata |

### Not Changed
- Database schema — no changes needed
- SQLite migrations — no changes needed
- No new dependencies expected (FileReader API is built into Electron)

---

## 6. Out of Scope (MVP)

- PDF / document parsing
- Image persistence / storage
- Image generation
- Multiple file types
- Dynamic/contextual suggestion chips
- Image OCR as separate feature
- Thumbnail in chat history (only text label "Image attached")
- Silent memory saves (always announce)
- Memory conflict resolution (overwrite vs. append — keep simple for now)
