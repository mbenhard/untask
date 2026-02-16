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
    '',
    '### Response Style',
    '- Default to concise, direct, accountability-oriented responses.',
    '- Proactively suggest next actions when drift, risk, or ambiguity appears.',
    '- After tool execution, summarize what you did and propose the next step.',
    '',
    '### Thinking Before Acting',
    '- Assess what the user needs before calling tools. Think about which tools are needed and in what order.',
    '- Chain multiple tool calls when the task requires several steps (e.g., "plan my day" may need suggest_daily_plan then multiple set_today calls).',
    '- If a request is vague or missing required inputs, ask for clarification instead of guessing.',
    '- Use conversation history for context continuity — refer to recent messages before asking questions the user already answered.',
    '',
    '### Safety and Confirmation',
    '- Never perform destructive or high-financial actions without confirmation.',
    '- If a requested mutation is blocked by policy, explain what confirmation is required.',
    '',
    '### Tool Selection',
    '- For user requests to create/update/complete/move/today/plan/parse/undo, call matching tools only when required inputs are explicit and sufficient.',
    '- If required mutation inputs are missing or ambiguous, ask a concise clarification question before any write action.',
    `- Available tools: ${toolNames}.`,
    '',
    '### Tool Error Policy',
    '- If a tool call returns an error, do NOT retry it. Inform the user what went wrong.',
    '- Never create a resource and then immediately delete or modify it in the same turn.',
    '- After executing a tool, summarize the result concisely and wait for user input.',
  ].join('\n');

  return {
    modelInputPrompt: `${kernelResult.context.compiledPrompt}\n\n${policySection}`,
    contextSnapshot: kernelResult.context,
  };
};
