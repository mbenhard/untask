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
  conversationId: z.string().min(1).optional(),
  expectedFingerprint: z.string().min(1).optional(),
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

export const backupImportRequestSchema = z.object({
  source: z.string().min(1),
  passphrase: z.string().optional(),
});

export const backupOffsiteReadManifestRequestSchema = z.object({
  source: z.string().min(1),
});

export const backupOffsiteRestoreRequestSchema = z.object({
  source: z.string().min(1),
});

export const backupDeleteRequestSchema = z.object({
  path: z.string().min(1),
});

export const backupRevealRequestSchema = z.object({
  path: z.string().min(1),
});

export const backupSettingsSchema = z.object({
  destination: z.string(),
  frequency: z.enum(['hourly', 'daily', 'weekly']),
  retention: z.number().int().min(1).max(50),
});

// ─── Task handler schemas ─────────────────────────────────────────────────────

const taskStatusValues = [
  'inbox', 'active', 'in_progress', 'waiting', 'review', 'someday', 'cancelled', 'done',
] as const;

export const taskIdSchema = z.string().min(1);

export const taskListFilterSchema = z.object({
  status: z.enum(taskStatusValues).optional(),
  parentId: z.string().nullable().optional(),
  today: z.boolean().optional(),
  priority: z.enum(['none', 'low', 'medium', 'high']).optional(),
  client: z.string().optional(),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(500).optional(),
}).optional();

export const taskReorderSchema = z.array(z.string().min(1)).min(1).max(500);

export const taskStatusConfigSchema = z.object({
  enabled: z.array(z.enum(taskStatusValues)),
  order: z.array(z.enum(taskStatusValues)),
});

export const apiKeyProviderSchema = z.string().min(1).max(64).regex(/^[a-z0-9_-]+$/);
export const apiKeyValueSchema = z.string().min(1).max(512);
export const setApiKeySchema = z.object({ provider: apiKeyProviderSchema, key: apiKeyValueSchema });
export const providerOnlySchema = z.object({ provider: apiKeyProviderSchema });
export const validateApiKeySchema = z.object({ provider: apiKeyProviderSchema, key: apiKeyValueSchema });
