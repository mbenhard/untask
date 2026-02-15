export type AssistantTaskStatus = 'inbox' | 'active' | 'in_progress' | 'done';
export type AssistantTaskPriority = 'none' | 'low' | 'medium' | 'high';
export type AssistantJournalCategory =
  | 'pattern'
  | 'progress'
  | 'preference'
  | 'summary';

export type AssistantTaskSnapshot = {
  id: string;
  title: string;
  status: AssistantTaskStatus | string;
  today?: boolean;
  priority?: AssistantTaskPriority;
  dueDate?: string | null;
  client?: string | null;
  valueAtRisk?: number | null;
  lastClientTouchAt?: string | null;
};

export type AssistantJournalEntry = {
  id: string;
  content: string;
  category: AssistantJournalCategory;
  createdAt: string;
};

export type AssistantMemorySnapshot = {
  profile: string;
  patterns: string;
  journalEntries: AssistantJournalEntry[];
};

export type AssistantLiveContext = {
  tasks: AssistantTaskSnapshot[];
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
