import { BrowserWindow } from 'electron';

import type { ProactiveTriggerType } from '../../types/assistant';
import type { ChatStreamEvent } from '../../types/chat';
import { IPC_CHANNELS } from '../../types/ipc';

// ─── Stream event emitter ───────────────────────────────────

const emitToAllWindows = (event: ChatStreamEvent): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.CHAT_STREAM_EVENT, event);
    }
  }
};

// ─── Trigger message template ───────────────────────────────

const TRIGGER_TEMPLATE =
  '[PROACTIVE TRIGGER: time_reminder]\n' +
  'The following task is due now. Remind the user briefly ' +
  'and suggest immediate action. Include chips.';

const buildTriggerMessage = (
  taskContext: { id: string; title: string },
): string => {
  return `${TRIGGER_TEMPLATE}\nTask: "${taskContext.title}" (ID: ${taskContext.id})`;
};

// ─── Types ──────────────────────────────────────────────────

export type FireAiReminderDeps = {
  startProactiveTurn: (input: {
    triggerMessage: string;
    triggerType: ProactiveTriggerType;
    emit: (event: ChatStreamEvent) => void;
  }) => Promise<void>;
};

// ─── Single exported function ───────────────────────────────

/**
 * Fire an AI-powered reminder for a single task.
 * Builds a trigger message, calls startProactiveTurn, and streams to all windows.
 */
export async function fireAiReminder(
  taskContext: { id: string; title: string },
  deps: FireAiReminderDeps,
): Promise<void> {
  const message = buildTriggerMessage(taskContext);

  try {
    await deps.startProactiveTurn({
      triggerMessage: message,
      triggerType: 'time_reminder',
      emit: emitToAllWindows,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[proactive-loop] failed to fire time_reminder:', error);
  }
}
