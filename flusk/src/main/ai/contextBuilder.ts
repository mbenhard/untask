import type {
  AssistantLiveContext,
  AssistantMemorySnapshot,
  IdentityContextDebugSnapshot,
} from '../../types/assistant';
import { compileIdentityContext, loadIdentityContracts } from '../assistant/contextCompiler';
import { listTasks } from '../services/taskService';
import { buildAssistantMemorySnapshot } from './memory';

export type BuildCanonicalRuntimeContextInput = {
  memory?: Partial<AssistantMemorySnapshot>;
  liveContext?: Partial<AssistantLiveContext>;
  journalLimit?: number;
};

export type CanonicalRuntimeContext = {
  memory: AssistantMemorySnapshot;
  liveContext: AssistantLiveContext;
};

export type BuildIdentityContextInput = BuildCanonicalRuntimeContextInput & {
  userMessage?: string;
  tokenBudget?: number;
  baseDir?: string;
};

const buildLiveContextSnapshot = (): AssistantLiveContext => {
  const tasks = listTasks();

  return {
    tasks,
    inboxCount: tasks.filter((task) => task.status === 'inbox').length,
    now: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
};

export const buildCanonicalRuntimeContext = (
  input: BuildCanonicalRuntimeContextInput = {},
): CanonicalRuntimeContext => {
  const memory = {
    ...buildAssistantMemorySnapshot({
      journalLimit: input.journalLimit ?? 24,
    }),
    ...(input.memory ?? {}),
  };
  const liveContext = {
    ...buildLiveContextSnapshot(),
    ...(input.liveContext ?? {}),
  };

  return {
    memory,
    liveContext,
  };
};

export const buildIdentityContext = async (
  input: BuildIdentityContextInput,
): Promise<IdentityContextDebugSnapshot> => {
  const contracts = await loadIdentityContracts(input.baseDir ?? process.cwd());
  const runtimeContext = buildCanonicalRuntimeContext(input);

  return compileIdentityContext({
    contracts,
    memory: runtimeContext.memory,
    liveContext: runtimeContext.liveContext,
    request: input.userMessage,
    tokenBudget: input.tokenBudget,
  });
};
