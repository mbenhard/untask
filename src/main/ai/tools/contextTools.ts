import { z } from 'zod';

import type { ChipAction } from '../../../types/chat';
import { toErrorMessage } from '../../lib/errors';
import { updateMemorySection } from '../memory';
import type { ToolRegistryEntry, ToolExecutionEnvelope } from './types';

// ─── Schemas ────────────────────────────────────────────────────

export const updateMemoryInputSchema = z.object({
  section: z.string().min(1),
  content: z.string().min(1),
  mode: z.enum(['merge', 'replace']).default('merge'),
});

export const emitChipsInputSchema = z.object({
  chips: z.array(z.object({
    label: z.string().min(1).max(40),
    responseText: z.string().optional(),
  })).min(1).max(4),
});

// ─── Helpers ────────────────────────────────────────────────────

const normalizeChipActions = (chips: Array<{ label: string; responseText?: string }>): ChipAction[] =>
  chips.map((chip) => {
    const responseText = chip.responseText?.trim().length
      ? chip.responseText.trim()
      : chip.label.trim();

    return {
      label: chip.label,
      type: 'response',
      responseText: responseText.length > 0 ? responseText : chip.label,
    };
  });

// ─── Tool definitions ───────────────────────────────────────────

export const updateMemoryTool = {
  name: 'update_memory',
  description: "Update a section of your Memory. Adds new knowledge or replaces existing entries in the specified section. Keep entries atomic (one fact per line). If the section doesn't exist, it's created. Announce what you're saving to Marcus. If Memory exceeds 8000 tokens, you'll get a warning to consolidate.",
  schema: updateMemoryInputSchema,
  execute: async (input: z.infer<typeof updateMemoryInputSchema>): Promise<ToolExecutionEnvelope> => {
    try {
      const result = updateMemorySection(input.section, input.content, input.mode, 'ai');

      const response: { status: 'success'; message: string; data: Record<string, unknown> } = {
        status: 'success',
        message: `Memory section "${input.section}" updated (mode: ${input.mode}).`,
        data: { section: input.section, mode: input.mode },
      };

      if (result.tokenWarning) {
        response.message += ` Warning: ${result.tokenWarning}`;
        response.data.tokenWarning = result.tokenWarning;
      }

      return response;
    } catch (error) {
      return {
        status: 'error' as const,
        message: toErrorMessage(error, 'Failed to update Memory.'),
      };
    }
  },
} satisfies ToolRegistryEntry<'update_memory', typeof updateMemoryInputSchema>;

export const emitChipsTool = {
  name: 'emit_chips',
  description: 'Attach interactive response chips to your current message. This is the ONLY way to present tappable options — never write options as text bullets or numbered lists. Chips let Marcus answer with a tap instead of typing. Call AFTER writing your text, not instead of it. 2-4 chips when used. Only emit chips at genuine decision points, not after routine actions.',
  schema: emitChipsInputSchema,
  execute: async (input: z.infer<typeof emitChipsInputSchema>): Promise<ToolExecutionEnvelope> => {
    const normalizedChips = normalizeChipActions(input.chips as Array<{ label: string; responseText?: string }>);

    // No-op execution. The renderer reads the tool call args directly.
    return {
      status: 'success',
      message: `${normalizedChips.length} chips attached.`,
      data: { chips: normalizedChips },
    };
  },
} satisfies ToolRegistryEntry<'emit_chips', typeof emitChipsInputSchema>;
