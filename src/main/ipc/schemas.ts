import { z } from 'zod';

export const settingsMemoryUpdateSchema = z
  .object({
    identity: z.string().optional(),
    memory: z.string().optional(),
  })
  .refine(
    (value) =>
      value.identity !== undefined ||
      value.memory !== undefined,
    {
      message: 'At least one memory field must be provided.',
    },
  );

export const settingsReadJournalSchema = z.object({
  category: z.enum(['pattern', 'progress', 'preference', 'summary']).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  days_back: z.number().int().min(1).max(90).optional(),
  daysBack: z.number().int().min(1).max(90).optional(),
});

export const resolvePendingActionSchema = z.object({
  actionId: z.string().min(1),
  decision: z.enum(['approve', 'reject']),
});

export const taskDeleteRequestSchema = z.union([
  z.string().min(1),
  z.object({
    id: z.string().min(1),
    cascade: z.boolean().optional(),
  }),
]);

export const taskCompleteRequestSchema = z.union([
  z.string().min(1),
  z.object({
    id: z.string().min(1),
    completeChildren: z.boolean().optional(),
  }),
]);

export const chatSendSchema = z.object({
  content: z.string(),
  modelId: z.string().nullable().optional(),
  conversationId: z.string().min(1).optional(),
  images: z.array(z.string().min(1)).optional(),
  noteContext: z
    .object({
      noteId: z.string().min(1),
      title: z.string().min(1),
      markdown: z.string().min(1),
    })
    .optional(),
});

export const chatHistoryRequestSchema = z.object({
  conversationId: z.string().min(1),
});

export const chatListThreadsSchema = z.object({
  includeArchived: z.boolean().optional(),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).max(10_000).optional(),
});

export const chatCreateThreadSchema = z.object({
  title: z.string().min(1).max(120).optional(),
});

export const chatThreadMutationSchema = z.object({
  conversationId: z.string().min(1),
});

export const noteIdSchema = z.string().min(1);

export const noteSaveSchema = z.object({
  id: z.string().min(1),
  content: z.string(),
});

export const memoryHistoryRequestSchema = z.object({
  layer: z.enum(['soul', 'profile', 'patterns', 'identity', 'memory']).optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export const undoMemoryEventRequestSchema = z.object({
  eventId: z.string().min(1).optional(),
  steps: z.number().int().min(1).max(20).optional(),
});

export const launchAtLoginSchema = z.boolean();

export const backupExportRequestSchema = z.object({
  destination: z.string().min(1),
  passphrase: z.string().optional(),
});

export const backupImportRequestSchema = z.object({
  source: z.string().min(1),
  passphrase: z.string().optional(),
});

export const backupDialogRequestSchema = z.object({
  passphrase: z.string().optional(),
});

export const apiKeyProviderSchema = z.string().min(1).max(64).regex(/^[a-z0-9_-]+$/);
export const apiKeyValueSchema = z.string().min(1).max(512);
export const setApiKeySchema = z.object({ provider: apiKeyProviderSchema, key: apiKeyValueSchema });
export const providerOnlySchema = z.object({ provider: apiKeyProviderSchema });
export const validateApiKeySchema = z.object({ provider: apiKeyProviderSchema, key: apiKeyValueSchema });
