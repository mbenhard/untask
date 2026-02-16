import type {
  AssistantLiveContext,
  AssistantMemorySnapshot,
  IdentityContextDebugSnapshot,
} from '../../types/assistant';
import { orchestrateChatWithIdentityKernel } from '../assistant/identityKernel';
import { getToolDefinitions } from './tools';
import type { ChatModelId } from './models';
import { getModelWebSearchConfig } from './models';

export type BuildSystemPromptInput = {
  userMessage: string;
  tokenBudget?: number;
  memory?: Partial<AssistantMemorySnapshot>;
  liveContext?: Partial<AssistantLiveContext>;
  modelId?: ChatModelId;
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

  const webSearchConfig = input.modelId
    ? getModelWebSearchConfig(input.modelId)
    : { supportsWebSearch: false };

  const webSearchGuidance = webSearchConfig.supportsWebSearch
    ? [
        '',
        '### Web Search',
        '- You have access to web search. Use it when the user asks about current events, facts you\'re unsure about, prices, weather, or anything outside your training data.',
        '- Cite sources when presenting search results.',
      ]
    : [
        '',
        '### Web Search',
        '- This model does not support web search. If the user asks for current information, suggest switching to Kimi K2.5 or Claude Haiku 4.5 which support web search.',
      ];

  const policySection = [
    '## Runtime Tool Policy',
    '',
    '### Action Bias',
    '- When the user asks you to DO something (create, update, complete, delete, move, plan, remember), you MUST call the appropriate tool. Never describe what you would do — just do it.',
    '- If you lack required information (like a task ID), call list_tasks to find it first, then call the mutation tool.',
    '- Only respond with text (no tool call) when the user is asking a question, making conversation, or the request is genuinely ambiguous.',
    '- NEVER say "I\'ll do that" or "Let me do that" without immediately calling a tool. Words without action is a failure mode.',
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
    '### Task Resolution',
    '- When the user refers to a task by name, description, or partial match, use list_tasks with a search query to find the matching task ID before calling mutation tools.',
    '- If multiple tasks match, present the options and ask which one.',
    '- If no tasks match, tell the user and ask for clarification.',
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
    '',
    '### Memory Behavior',
    '- When the user shares stable facts, preferences, or patterns, save them using the appropriate tool (update_user_profile, update_patterns).',
    '- Announce what you\'re saving: "I\'ll remember that [X]. [Saving to profile/patterns]"',
    '- For inferred patterns (not explicitly stated), ask before saving.',
    '- Don\'t save ephemeral context, things already captured as tasks, or low-confidence inferences.',
    '- Chat messages may be cleared at any time. If something matters long-term, save it to memory — don\'t rely on chat history.',
    ...webSearchGuidance,
  ].join('\n');

  return {
    modelInputPrompt: `${kernelResult.context.compiledPrompt}\n\n${policySection}`,
    contextSnapshot: kernelResult.context,
  };
};
