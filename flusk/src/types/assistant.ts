export type { Task, AiJournal } from './models';
import type { Task, AiJournal } from './models';

export type AssistantMemorySnapshot = {
  soul: string;
  profile: string;
  patterns: string;
  journalEntries: AiJournal[];
};

export type AssistantLiveContext = {
  tasks: Task[];
  inboxCount: number;
  now?: string;
  timezone?: string;
};

export type IdentityContextCompileRequest = {
  request?: string;
  tokenBudget?: number;
  memory?: Partial<AssistantMemorySnapshot>;
  liveContext?: Partial<AssistantLiveContext>;
};

export type IdentityContextSectionSnapshot = {
  id: string;
  title: string;
  estimatedTokens: number;
  included: boolean;
  truncated: boolean;
  snippetIds: string[];
};

export type IdentityContextDebugSnapshot = {
  generatedAt: string;
  timezone: string;
  tokenBudget: number;
  estimatedTotalTokens: number;
  sectionOrder: string[];
  sections: IdentityContextSectionSnapshot[];
  compiledPrompt: string;
};

export type MemoryLayer = 'profile' | 'patterns' | 'journal';

export type MemoryImpactSignal =
  | 'financial'
  | 'client_commitment'
  | 'hard_deadline'
  | 'identity_preference';

export type MemoryPromotionAction =
  | 'promote_profile'
  | 'promote_patterns'
  | 'journal_only'
  | 'needs_confirmation';

export type MemoryPromotionReason =
  | 'high_impact_assumption'
  | 'low_confidence'
  | 'ambiguous_statement'
  | 'user_confirmed'
  | 'user_rejected'
  | 'invalid_observation'
  | 'unknown_pending_decision';

export type MemoryPromotionEvaluationRequest = {
  observation: string;
  candidateLayer?: Exclude<MemoryLayer, 'journal'>;
  confidence?: number;
  impactSignals?: MemoryImpactSignal[];
  sourceMessage?: string;
};

export type MemoryPromotionDecision = {
  action: MemoryPromotionAction;
  proposedLayer: MemoryLayer;
  proposedEntry: string;
  confidence: number;
  requiresConfirmation: boolean;
  reasons: MemoryPromotionReason[];
  impactSignals: MemoryImpactSignal[];
  confirmationId?: string;
  confirmationPrompt?: string;
};

export type MemoryPromotionConfirmRequest = {
  confirmationId: string;
  approved: boolean;
};

export type MemoryPromotionConfirmResult = {
  resolved: boolean;
  decision: MemoryPromotionDecision;
};

export type ProactiveTriggerType =
  | 'empty_today_list'
  | 'overdue_accumulation'
  | 'stale_client_touchpoint'
  | 'value_at_risk_idle';

export type ProactiveTriggerAction = {
  label: string;
  command: string;
};

export type ProactiveTriggerRecommendation = {
  trigger: ProactiveTriggerType;
  severity: 'low' | 'medium' | 'high';
  message: string;
  actions: ProactiveTriggerAction[];
  generatedAt: string;
};

export type ProactiveTriggerEvaluation = {
  trigger: ProactiveTriggerType;
  eligible: boolean;
  suppressedByCooldown: boolean;
  reason?: string;
  score: number;
};

export type ProactiveTriggerRequest = {
  liveContext: AssistantLiveContext;
  applyCooldown?: boolean;
  recordSelection?: boolean;
  now?: string;
  timezone?: string;
};

export type ProactiveTriggerResult = {
  recommendation?: ProactiveTriggerRecommendation;
  evaluations: ProactiveTriggerEvaluation[];
};

export type IdentityKernelStatus = {
  ready: boolean;
  diagnostics: string[];
};

export type ChatKernelOrchestrationRequest = {
  userMessage: string;
  tokenBudget?: number;
  memory?: Partial<AssistantMemorySnapshot>;
  liveContext?: Partial<AssistantLiveContext>;
  memoryObservation?: MemoryPromotionEvaluationRequest;
};

export type ChatKernelOrchestrationSuccess = {
  ok: true;
  kernelStatus: IdentityKernelStatus;
  context: IdentityContextDebugSnapshot;
  proactiveRecommendation?: ProactiveTriggerRecommendation;
  proactiveEvaluations: ProactiveTriggerEvaluation[];
  memoryDecision?: MemoryPromotionDecision;
};

export type ChatKernelOrchestrationFailure = {
  ok: false;
  errorCode: 'IDENTITY_KERNEL_UNAVAILABLE';
  message: string;
  diagnostics: string[];
};

export type ChatKernelOrchestrationResult =
  | ChatKernelOrchestrationSuccess
  | ChatKernelOrchestrationFailure;
