import type {
  AssistantLiveContext,
  AssistantMemorySnapshot,
  IdentityContextDebugSnapshot,
} from '../../types/assistant';
import { orchestrateChatWithIdentityKernel } from '../assistant/identityKernel';
import { getToolDefinitions } from './tools';

export type BuildSystemPromptInput = {
  userMessage: string;
  tokenBudget?: number;
  memory?: Partial<AssistantMemorySnapshot>;
  liveContext?: Partial<AssistantLiveContext>;
};

export type BuiltSystemPrompt = {
  modelInputPrompt: string;
  contextSnapshot: IdentityContextDebugSnapshot;
};

export const buildSystemPrompt = async (
  input: BuildSystemPromptInput,
): Promise<BuiltSystemPrompt> => {
  const kernelResult = await orchestrateChatWithIdentityKernel({
    userMessage: input.userMessage,
    tokenBudget: input.tokenBudget,
    memory: input.memory,
    liveContext: input.liveContext,
  });

  if (!kernelResult.ok) {
    throw new Error(
      `Identity kernel unavailable for system prompt assembly: ${kernelResult.diagnostics.join(
        '; ',
      )}`,
    );
  }

  const toolNames = getToolDefinitions()
    .map((toolDefinition) => toolDefinition.name)
    .join(', ');

  const policySection = [
    '## Runtime Tool Policy',
    '- Default to concise, direct, accountability-oriented responses.',
    '- Proactively suggest next actions when drift, risk, or ambiguity appears.',
    '- Never perform destructive or high-financial actions without confirmation.',
    '- If a requested mutation is blocked by policy, explain what confirmation is required.',
    '- For user requests to create/update/complete/move/today/plan/parse/undo, call matching tools only when required inputs are explicit and sufficient.',
    '- If required mutation inputs are missing or ambiguous, ask a concise clarification question before any write action.',
    '- After tool execution, provide a short outcome summary and the next action.',
    `- Available tools: ${toolNames}.`,
  ].join('\n');

  return {
    modelInputPrompt: `${kernelResult.context.compiledPrompt}\n\n${policySection}`,
    contextSnapshot: kernelResult.context,
  };
};
