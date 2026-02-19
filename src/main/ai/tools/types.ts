import type { z } from 'zod';

import type {
  ChatActionCard,
  ChatToolStatus,
} from '../../../types/chat';

export type ToolExecutionEnvelope = {
  status: ChatToolStatus;
  message: string;
  data?: unknown;
  actionCard?: ChatActionCard;
};

export type ToolExecutionContext = {
  toolCallId?: string;
  onActionCard?: (card: ChatActionCard) => void;
  autonomyBypass?: boolean;
  skipInternalConfirmation?: boolean;
  activeNoteId?: string;
  mutationSignatures?: Set<string>;
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
