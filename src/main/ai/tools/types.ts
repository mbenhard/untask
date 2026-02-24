import type { z } from 'zod';

import type {
  ChatActionCard,
  ChatRequestOrigin,
  ChatToolStatus,
  ChatNoteContext,
} from '../../../types/chat';

export type ToolExecutionEnvelope = {
  status: ChatToolStatus;
  message: string;
  data?: unknown;
  actionCard?: ChatActionCard;
};

export type ToolExecutionContext = {
  toolCallId?: string;
  conversationId?: string;
  requestId?: string;
  requestOrigin?: ChatRequestOrigin;
  onActionCard?: (card: ChatActionCard) => void;
  autonomyBypass?: boolean;
  skipInternalConfirmation?: boolean;
  activeNoteId?: string;
  attachedNoteContext?: ChatNoteContext;
  allowedTools?: ReadonlySet<import('./index').AiToolName>;
  mutationSignatures?: Set<string>;
  mutationOutcomes?: Map<string, ChatToolStatus>;
};

export type ToolInputSchema = z.ZodTypeAny;

export type ToolRegistryEntry<TName extends string, TSchema extends ToolInputSchema> = {
  name: TName;
  description: string;
  schema: TSchema;
  execute: (
    input: z.infer<TSchema>,
    context: ToolExecutionContext,
  ) => Promise<ToolExecutionEnvelope>;
};
