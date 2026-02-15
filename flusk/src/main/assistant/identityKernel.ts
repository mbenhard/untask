import type {
  AssistantLiveContext,
  AssistantMemorySnapshot,
  ChatKernelOrchestrationRequest,
  ChatKernelOrchestrationResult,
  IdentityContextDebugSnapshot,
  IdentityKernelStatus,
} from '../../types/assistant';
import {
  type IdentityContracts,
  compileIdentityContext,
  loadIdentityContractsWithSources,
} from './contextCompiler';
import { evaluateMemoryPromotion } from './memoryPolicy';
import { evaluateProactiveTriggerPolicy } from './proactivePolicy';

const IDENTITY_KERNEL_UNAVAILABLE = 'IDENTITY_KERNEL_UNAVAILABLE';

const EMPTY_MEMORY: AssistantMemorySnapshot = {
  soul: '',
  profile: '',
  patterns: '',
  journalEntries: [],
};

const EMPTY_LIVE_CONTEXT: AssistantLiveContext = {
  tasks: [],
  inboxCount: 0,
};

class IdentityKernelUnavailableError extends Error {
  public readonly code = IDENTITY_KERNEL_UNAVAILABLE;

  public readonly diagnostics: string[];

  constructor(message: string, diagnostics: string[]) {
    super(message);
    this.name = 'IdentityKernelUnavailableError';
    this.diagnostics = diagnostics;
  }
}

const assertKernelEnabled = (): void => {
  if (process.env.FLUSK_DISABLE_IDENTITY_KERNEL === '1') {
    throw new IdentityKernelUnavailableError(
      'Identity kernel is disabled by configuration (FLUSK_DISABLE_IDENTITY_KERNEL=1).',
      ['Kernel disabled via environment flag.'],
    );
  }
};

const assertContextCompilerReady = (contracts: IdentityContracts): IdentityContextDebugSnapshot => {
  try {
    return compileIdentityContext({
      contracts,
      memory: EMPTY_MEMORY,
      liveContext: EMPTY_LIVE_CONTEXT,
      request: 'identity kernel readiness check',
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown context compiler error.';

    throw new IdentityKernelUnavailableError(
      'Identity context compiler failed readiness checks.',
      [message],
    );
  }
};

const validateContracts = async (): Promise<IdentityContracts> => {
  assertKernelEnabled();

  const loaded = await loadIdentityContractsWithSources(process.cwd());
  const contracts: IdentityContracts = {
    soul: loaded.soul,
    charter: loaded.charter,
  };
  const diagnostics: string[] = [];

  if (loaded.source.soul === 'fallback') {
    diagnostics.push(
      'Soul contract file is missing or empty at docs/assistant/SOUL.md.',
    );
  }
  if (loaded.source.charter === 'fallback') {
    diagnostics.push(
      'Charter contract file is missing or empty at docs/assistant/CHARTER.md.',
    );
  }
  if (contracts.soul.trim().length === 0) {
    diagnostics.push('Soul contract is empty.');
  }
  if (contracts.charter.trim().length === 0) {
    diagnostics.push('Charter contract is empty.');
  }

  if (diagnostics.length > 0) {
    throw new IdentityKernelUnavailableError(
      'Identity contracts are unavailable or invalid.',
      diagnostics,
    );
  }

  assertContextCompilerReady(contracts);

  return contracts;
};

export const getIdentityKernelStatus = async (): Promise<IdentityKernelStatus> => {
  try {
    await validateContracts();
    return { ready: true, diagnostics: [] };
  } catch (error) {
    if (error instanceof IdentityKernelUnavailableError) {
      return { ready: false, diagnostics: error.diagnostics };
    }

    const message =
      error instanceof Error ? error.message : 'Unknown kernel status error.';

    return { ready: false, diagnostics: [message] };
  }
};

export const orchestrateChatWithIdentityKernel = async (
  request: ChatKernelOrchestrationRequest,
): Promise<ChatKernelOrchestrationResult> => {
  try {
    const contracts = await validateContracts();
    const memory: AssistantMemorySnapshot = {
      ...EMPTY_MEMORY,
      ...request.memory,
      journalEntries: request.memory?.journalEntries ?? EMPTY_MEMORY.journalEntries,
    };
    const liveContext: AssistantLiveContext = {
      ...EMPTY_LIVE_CONTEXT,
      ...request.liveContext,
      tasks: request.liveContext?.tasks ?? EMPTY_LIVE_CONTEXT.tasks,
    };

    const context = compileIdentityContext({
      contracts,
      memory,
      liveContext,
      request: request.userMessage,
      tokenBudget: request.tokenBudget,
    });

    const proactive = evaluateProactiveTriggerPolicy({
      liveContext,
      now: liveContext.now,
      timezone: liveContext.timezone,
      applyCooldown: true,
      recordSelection: true,
    });
    const memoryDecision = request.memoryObservation
      ? evaluateMemoryPromotion(request.memoryObservation)
      : undefined;

    return {
      ok: true,
      kernelStatus: { ready: true, diagnostics: [] },
      context,
      proactiveRecommendation: proactive.recommendation,
      proactiveEvaluations: proactive.evaluations,
      memoryDecision,
    };
  } catch (error) {
    if (error instanceof IdentityKernelUnavailableError) {
      return {
        ok: false,
        errorCode: IDENTITY_KERNEL_UNAVAILABLE,
        message: error.message,
        diagnostics: error.diagnostics,
      };
    }

    const message =
      error instanceof Error ? error.message : 'Unknown identity kernel failure.';

    return {
      ok: false,
      errorCode: IDENTITY_KERNEL_UNAVAILABLE,
      message: 'Identity kernel failed unexpectedly while preparing chat orchestration.',
      diagnostics: [message],
    };
  }
};
