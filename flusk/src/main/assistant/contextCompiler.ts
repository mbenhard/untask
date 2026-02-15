import fs from 'node:fs/promises';
import path from 'node:path';

import type { Task } from '../db/schema';
import type {
  AssistantLiveContext,
  AssistantMemorySnapshot,
  IdentityContextDebugSnapshot,
  IdentityContextSectionSnapshot,
} from '../../types/assistant';

export type IdentityContracts = {
  soul: string;
  charter: string;
};

type IdentityContractReadResult = {
  content: string;
  source: 'file' | 'fallback';
  resolvedPath?: string;
};

export type IdentityContractsLoadResult = IdentityContracts & {
  source: {
    soul: IdentityContractReadResult['source'];
    charter: IdentityContractReadResult['source'];
  };
  resolvedPaths: {
    soul?: string;
    charter?: string;
  };
};

type CompileIdentityContextInput = {
  contracts: IdentityContracts;
  memory: AssistantMemorySnapshot;
  liveContext: AssistantLiveContext;
  request?: string;
  tokenBudget?: number;
};

type MemorySnippetSource = 'profile' | 'patterns' | 'journal';

type MemorySnippet = {
  id: string;
  source: MemorySnippetSource;
  text: string;
  createdAt?: string;
  score: number;
};

type SectionDraft = {
  id: string;
  title: string;
  content: string;
  maxTokens: number;
  required: boolean;
  snippetIds?: string[];
};

const DEFAULT_TOKEN_BUDGET = 1600;
const MIN_SECTION_TOKENS = 24;

const DEFAULT_SOUL_CONTRACT = `# Flusk Assistant Soul

You are Marcus's execution partner: direct, practical, and outcome-driven.
Keep responses concise, concrete, and accountable. Prioritize focus, commitments,
and cashflow while avoiding generic or overly polite filler.`;

const DEFAULT_CHARTER_CONTRACT = `# Flusk Assistant Charter

Act as Marcus's personal operator for capture, planning, and execution.
Default to the highest-impact unblocked action, escalate deadline/financial risk
early, and require confirmation for destructive or high-financial changes.`;

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'he',
  'in',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'that',
  'the',
  'to',
  'was',
  'were',
  'will',
  'with',
]);

const PRIORITY_RANK: Record<NonNullable<Task['priority']>, number> = {
  high: 0,
  medium: 1,
  low: 2,
  none: 3,
};

const estimateTokens = (text: string): number => {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words * 1.3));
};

const resolveNow = (value: string | undefined): Date => {
  if (!value) {
    return new Date();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const trimToTokenBudget = (text: string, tokenBudget: number): string => {
  if (tokenBudget <= 0) {
    return '';
  }

  const words = text.trim().split(/\s+/).filter(Boolean);
  const maxWords = Math.max(1, Math.floor(tokenBudget / 1.3));

  if (words.length <= maxWords) {
    return text.trim();
  }

  return `${words.slice(0, maxWords).join(' ')} ...`;
};

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));

const resolveAssistantDocsDir = (baseDir?: string): string[] => {
  const fromBase = baseDir
    ? [
        path.resolve(baseDir, 'docs', 'assistant'),
        path.resolve(baseDir, '..', 'docs', 'assistant'),
      ]
    : [];

  return [
    ...fromBase,
    path.resolve(process.cwd(), 'docs', 'assistant'),
    path.resolve(process.cwd(), '..', 'docs', 'assistant'),
  ];
};

const readContract = async (
  fileName: 'SOUL.md' | 'CHARTER.md',
  fallback: string,
  baseDir?: string,
): Promise<IdentityContractReadResult> => {
  const candidates = resolveAssistantDocsDir(baseDir);

  for (const docsDir of candidates) {
    const target = path.join(docsDir, fileName);

    try {
      const content = await fs.readFile(target, 'utf8');
      const trimmed = content.trim();

      if (trimmed.length > 0) {
        return {
          content: trimmed,
          source: 'file',
          resolvedPath: target,
        };
      }
    } catch {
      // Try the next location.
    }
  }

  return {
    content: fallback,
    source: 'fallback',
  };
};

export const loadIdentityContractsWithSources = async (
  baseDir?: string,
): Promise<IdentityContractsLoadResult> => {
  const [soul, charter] = await Promise.all([
    readContract('SOUL.md', DEFAULT_SOUL_CONTRACT, baseDir),
    readContract('CHARTER.md', DEFAULT_CHARTER_CONTRACT, baseDir),
  ]);

  return {
    soul: soul.content,
    charter: charter.content,
    source: {
      soul: soul.source,
      charter: charter.source,
    },
    resolvedPaths: {
      soul: soul.resolvedPath,
      charter: charter.resolvedPath,
    },
  };
};

export const loadIdentityContracts = async (
  baseDir?: string,
): Promise<IdentityContracts> => {
  const contracts = await loadIdentityContractsWithSources(baseDir);

  return {
    soul: contracts.soul,
    charter: contracts.charter,
  };
};

const parseMarkdownSnippets = (
  source: MemorySnippetSource,
  markdown: string,
): MemorySnippet[] => {
  const chunks = markdown
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  return chunks.map((text, index) => ({
    id: `${source}-${index + 1}`,
    source,
    text,
    score: 0,
  }));
};

const recencyScore = (createdAt: string | undefined, nowMs: number): number => {
  if (!createdAt) {
    return 0.2;
  }

  const parsed = Date.parse(createdAt);

  if (Number.isNaN(parsed)) {
    return 0.2;
  }

  const ageDays = Math.max(0, (nowMs - parsed) / (1000 * 60 * 60 * 24));
  return Math.exp(-ageDays / 21);
};

const keywordOverlapScore = (
  snippetText: string,
  contextTerms: Set<string>,
): number => {
  if (contextTerms.size === 0) {
    return 0;
  }

  const snippetTerms = new Set(tokenize(snippetText));
  let overlap = 0;

  contextTerms.forEach((term) => {
    if (snippetTerms.has(term)) {
      overlap += 1;
    }
  });

  return overlap / contextTerms.size;
};

const scoreMemorySnippets = (
  snippets: MemorySnippet[],
  contextTerms: Set<string>,
  nowMs: number,
): MemorySnippet[] =>
  snippets
    .map((snippet) => {
      const overlap = keywordOverlapScore(snippet.text, contextTerms);
      const recency = recencyScore(snippet.createdAt, nowMs);
      const sourceBoost = snippet.source === 'patterns' ? 0.05 : 0;

      return {
        ...snippet,
        score: overlap * 0.7 + recency * 0.3 + sourceBoost,
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.source.localeCompare(right.source) ||
        left.id.localeCompare(right.id),
    );

const toIsoDate = (value: string | undefined | null): number | null => {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const taskSortKey = (task: Task): [number, number, number, string] => {
  const dueAt = toIsoDate(task.dueDate) ?? Number.POSITIVE_INFINITY;
  const priority = task.priority ?? 'none';

  return [
    task.today ? 0 : 1,
    dueAt,
    PRIORITY_RANK[priority],
    task.title.toLowerCase(),
  ];
};

const sortTasks = (tasks: Task[]): Task[] =>
  [...tasks].sort((left, right) => {
    const a = taskSortKey(left);
    const b = taskSortKey(right);

    for (let index = 0; index < a.length; index += 1) {
      if (a[index] < b[index]) {
        return -1;
      }
      if (a[index] > b[index]) {
        return 1;
      }
    }

    return left.id.localeCompare(right.id);
  });

const inferTimeWindow = (now: Date): 'morning' | 'afternoon' | 'evening' => {
  const hour = now.getHours();

  if (hour < 12) {
    return 'morning';
  }
  if (hour < 18) {
    return 'afternoon';
  }

  return 'evening';
};

const formatLocalTimestamp = (now: Date, timezone: string): string =>
  (() => {
    try {
      return new Intl.DateTimeFormat('en-US', {
        dateStyle: 'full',
        timeStyle: 'short',
        timeZone: timezone,
      }).format(now);
    } catch {
      return new Intl.DateTimeFormat('en-US', {
        dateStyle: 'full',
        timeStyle: 'short',
      }).format(now);
    }
  })();

const buildLiveContextSection = (
  liveContext: AssistantLiveContext,
  now: Date,
): string => {
  const activeTasks = sortTasks(
    liveContext.tasks.filter((task) => task.status !== 'done'),
  );
  const todayTasks = activeTasks.filter((task) => task.today);
  const overdueTasks = activeTasks.filter((task) => {
    const dueAt = toIsoDate(task.dueDate);
    return dueAt !== null && dueAt < now.getTime();
  });

  const staleClientTasks = activeTasks.filter((task) => {
    const touchedAt = toIsoDate(task.lastClientTouchAt);

    if (touchedAt === null) {
      return false;
    }

    const daysSinceTouch = (now.getTime() - touchedAt) / (1000 * 60 * 60 * 24);
    return daysSinceTouch >= 7;
  });

  const overdueValueAtRisk = overdueTasks.reduce(
    (sum, task) => sum + (task.valueAtRisk ?? 0),
    0,
  );

  let riskLevel = 'low';
  if (
    overdueTasks.length >= 3 ||
    staleClientTasks.length >= 2 ||
    overdueValueAtRisk >= 2000
  ) {
    riskLevel = 'high';
  } else if (
    overdueTasks.length > 0 ||
    staleClientTasks.length > 0 ||
    overdueValueAtRisk > 0
  ) {
    riskLevel = 'medium';
  }

  const taskLines = activeTasks.slice(0, 8).map((task) => {
    const tags = [
      task.today ? 'today' : null,
      task.priority ? `priority:${task.priority}` : null,
      task.client ? `client:${task.client}` : null,
      task.dueDate ? `due:${task.dueDate}` : null,
    ]
      .filter(Boolean)
      .join(', ');

    return `- ${task.title}${tags.length > 0 ? ` (${tags})` : ''}`;
  });

  const overdueLines = overdueTasks.slice(0, 5).map((task) => {
    const valueAtRisk =
      typeof task.valueAtRisk === 'number' && task.valueAtRisk > 0
        ? `, value-at-risk:$${task.valueAtRisk}`
        : '';

    return `- ${task.title} (due:${task.dueDate ?? 'unknown'}${valueAtRisk})`;
  });

  const lines = [
    `- Active task count: ${activeTasks.length}`,
    `- Today list count: ${todayTasks.length}`,
    `- Inbox count: ${liveContext.inboxCount}`,
    `- Overdue risk: ${riskLevel} (overdue:${overdueTasks.length}, stale-client:${staleClientTasks.length}, overdue-value-at-risk:$${overdueValueAtRisk})`,
    '',
    'Active task slice:',
    ...(taskLines.length > 0 ? taskLines : ['- none']),
    '',
    'Overdue task slice:',
    ...(overdueLines.length > 0 ? overdueLines : ['- none']),
  ];

  return lines.join('\n');
};

const buildContextTerms = (
  request: string | undefined,
  liveContext: AssistantLiveContext,
): Set<string> => {
  const values = [
    request ?? '',
    ...liveContext.tasks.map((task) => task.title),
    ...liveContext.tasks
      .map((task) => task.client ?? '')
      .filter((value) => value.length > 0),
  ];

  return new Set(tokenize(values.join(' ')));
};

const selectSnippetsForBudget = (
  snippets: MemorySnippet[],
  tokenBudget: number,
): { text: string; snippetIds: string[] } => {
  if (tokenBudget <= 0 || snippets.length === 0) {
    return { text: '', snippetIds: [] };
  }

  const selected: MemorySnippet[] = [];
  let usedTokens = 0;

  for (const snippet of snippets) {
    const snippetTokens = estimateTokens(snippet.text);

    if (usedTokens + snippetTokens > tokenBudget && selected.length > 0) {
      continue;
    }

    if (snippetTokens > tokenBudget && selected.length === 0) {
      selected.push({
        ...snippet,
        text: trimToTokenBudget(snippet.text, tokenBudget),
      });
      break;
    }

    selected.push(snippet);
    usedTokens += snippetTokens;
  }

  return {
    text: selected.map((snippet) => `- ${snippet.text}`).join('\n'),
    snippetIds: selected.map((snippet) => snippet.id),
  };
};

const buildSection = (
  draft: SectionDraft,
  remainingTokens: number,
  sectionsLeft: number,
): {
  section: IdentityContextSectionSnapshot;
  content: string;
  usedTokens: number;
} => {
  if (remainingTokens <= 0 && !draft.required) {
    return {
      section: {
        id: draft.id,
        title: draft.title,
        estimatedTokens: 0,
        included: false,
        truncated: false,
        snippetIds: [],
      },
      content: '',
      usedTokens: 0,
    };
  }

  const reserveForRemaining = Math.max(
    0,
    (sectionsLeft - 1) * MIN_SECTION_TOKENS,
  );
  const available = Math.max(
    draft.required ? MIN_SECTION_TOKENS : 0,
    remainingTokens - reserveForRemaining,
  );
  const budgetForSection = Math.min(draft.maxTokens, available);
  const trimmedContent = trimToTokenBudget(draft.content, budgetForSection);
  const tokens = trimmedContent.length > 0 ? estimateTokens(trimmedContent) : 0;
  const included = trimmedContent.length > 0 || draft.required;

  if (!included) {
    return {
      section: {
        id: draft.id,
        title: draft.title,
        estimatedTokens: 0,
        included: false,
        truncated: false,
        snippetIds: [],
      },
      content: '',
      usedTokens: 0,
    };
  }

  const safeContent = trimmedContent.length > 0 ? trimmedContent : '- none';

  return {
    section: {
      id: draft.id,
      title: draft.title,
      estimatedTokens: estimateTokens(safeContent),
      included: true,
      truncated: trimmedContent !== draft.content,
      snippetIds: draft.snippetIds ?? [],
    },
    content: `## ${draft.title}\n${safeContent}`,
    usedTokens: tokens,
  };
};

export const compileIdentityContext = (
  input: CompileIdentityContextInput,
): IdentityContextDebugSnapshot => {
  const tokenBudget = input.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
  const now = resolveNow(input.liveContext.now);
  const timezone =
    input.liveContext.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const generatedAt = now.toISOString();
  const contextTerms = buildContextTerms(input.request, input.liveContext);

  const nowMs = now.getTime();
  const profileSnippets = parseMarkdownSnippets('profile', input.memory.profile);
  const patternSnippets = parseMarkdownSnippets('patterns', input.memory.patterns);
  const journalSnippets = input.memory.journalEntries.map((entry, index) => ({
    id: `journal-${index + 1}`,
    source: 'journal' as const,
    text: entry.content.trim(),
    createdAt: entry.createdAt ?? undefined,
    score: 0,
  }));

  const scoredProfile = scoreMemorySnippets(profileSnippets, contextTerms, nowMs);
  const scoredPatterns = scoreMemorySnippets(patternSnippets, contextTerms, nowMs);
  const scoredJournal = scoreMemorySnippets(journalSnippets, contextTerms, nowMs);

  const liveContextSection = buildLiveContextSection(input.liveContext, now);
  const soulOverlay = input.memory.soul.trim();
  const sections: SectionDraft[] = [
    {
      id: 'meta',
      title: 'Context Meta',
      content: [
        `- Generated at: ${generatedAt}`,
        `- Local time: ${formatLocalTimestamp(now, timezone)}`,
        `- Timezone: ${timezone}`,
        `- Day segment: ${inferTimeWindow(now)}`,
      ].join('\n'),
      maxTokens: 80,
      required: true,
    },
    {
      id: 'soul',
      title: 'Soul Contract',
      content: input.contracts.soul,
      maxTokens: 250,
      required: true,
    },
  ];

  if (soulOverlay.length > 0) {
    sections.push({
      id: 'soul-overlay',
      title: 'Soul Overlay',
      content: soulOverlay,
      maxTokens: 180,
      required: false,
    });
  }

  sections.push(
    {
      id: 'charter',
      title: 'Charter Contract',
      content: input.contracts.charter,
      maxTokens: 250,
      required: true,
    },
    {
      id: 'live-context',
      title: 'Live Context',
      content: liveContextSection,
      maxTokens: 420,
      required: true,
    },
  );

  if (input.request && input.request.trim().length > 0) {
    sections.push({
      id: 'request',
      title: 'Current User Request',
      content: `- ${input.request.trim()}`,
      maxTokens: 120,
      required: true,
    });
  }

  let remainingTokens = tokenBudget;
  const compiledSections: IdentityContextSectionSnapshot[] = [];
  const promptBlocks: string[] = [];

  for (let index = 0; index < sections.length; index += 1) {
    const draft = sections[index];
    const built = buildSection(
      draft,
      remainingTokens,
      sections.length - index,
    );

    if (built.section.included) {
      promptBlocks.push(built.content);
      remainingTokens -= built.usedTokens;
    }

    compiledSections.push(built.section);
  }

  const memoryBudget = Math.max(0, remainingTokens);
  const profileBudget = Math.floor(memoryBudget * 0.34);
  const patternBudget = Math.floor(memoryBudget * 0.33);
  const journalBudget = Math.max(0, memoryBudget - profileBudget - patternBudget);

  const profileSelection = selectSnippetsForBudget(scoredProfile, profileBudget);
  const patternSelection = selectSnippetsForBudget(scoredPatterns, patternBudget);
  const journalSelection = selectSnippetsForBudget(scoredJournal, journalBudget);

  const memoryDrafts: SectionDraft[] = [
    {
      id: 'profile-snippets',
      title: 'Profile Snippets',
      content: profileSelection.text || '- none',
      maxTokens: profileBudget,
      required: false,
      snippetIds: profileSelection.snippetIds,
    },
    {
      id: 'pattern-snippets',
      title: 'Pattern Snippets',
      content: patternSelection.text || '- none',
      maxTokens: patternBudget,
      required: false,
      snippetIds: patternSelection.snippetIds,
    },
    {
      id: 'journal-snippets',
      title: 'Journal Snippets',
      content: journalSelection.text || '- none',
      maxTokens: journalBudget,
      required: false,
      snippetIds: journalSelection.snippetIds,
    },
  ];

  for (let index = 0; index < memoryDrafts.length; index += 1) {
    const draft = memoryDrafts[index];
    const built = buildSection(
      draft,
      remainingTokens,
      memoryDrafts.length - index,
    );

    if (built.section.included) {
      promptBlocks.push(built.content);
      remainingTokens -= built.usedTokens;
    }

    compiledSections.push(built.section);
  }

  const compiledPrompt = promptBlocks.join('\n\n').trim();
  const sectionOrder = compiledSections
    .filter((section) => section.included)
    .map((section) => section.id);

  return {
    generatedAt,
    timezone,
    tokenBudget,
    estimatedTotalTokens: estimateTokens(compiledPrompt),
    sectionOrder,
    sections: compiledSections,
    compiledPrompt,
  };
};
