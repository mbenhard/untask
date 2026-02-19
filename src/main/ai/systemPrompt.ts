import type { Task } from '../db/schema';
import { TERMINAL_STATUSES, type PredefinedStatusId } from '../../types/models';
import type {
  AssistantLiveContext,
  IdentityContextDebugSnapshot,
} from '../../types/assistant';
import { getIdentity, getMemory, getUserName, estimateTokens } from './memory';

// ─── Types ──────────────────────────────────────────────────

export type BuildSystemPromptInput = {
  userMessage: string;
  liveContext: AssistantLiveContext;
  modelId?: string;
  isSlimMode?: boolean;
};

export type BuiltSystemPrompt = {
  modelInputPrompt: string;
  contextSnapshot: IdentityContextDebugSnapshot;
};

// ─── Task helpers ───────────────────────────────────────────

const PRIORITY_RANK: Record<NonNullable<Task['priority']>, number> = {
  high: 0,
  medium: 1,
  low: 2,
  none: 3,
};

const toIsoDate = (value: string | null | undefined): number | null => {
  if (!value) return null;
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
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] < b[i]) return -1;
      if (a[i] > b[i]) return 1;
    }
    return left.id.localeCompare(right.id);
  });

// ─── Time helpers ───────────────────────────────────────────

const formatLocalTimestamp = (now: Date, timezone: string): string => {
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
};

// ─── Section builders ───────────────────────────────────────

const buildMetaSection = (now: Date, timezone: string): string =>
  `## Now\n${formatLocalTimestamp(now, timezone)} (${timezone})`;

const buildTodaySection = (
  liveContext: AssistantLiveContext,
  now: Date,
  taskLimit: number = 10,
): string => {
  const activeTasks = sortTasks(
    liveContext.tasks.filter(
      (task) => !TERMINAL_STATUSES.includes(task.status as PredefinedStatusId),
    ),
  );
  const todayTasks = activeTasks.filter((task) => task.today);
  const overdueTasks = activeTasks.filter((task) => {
    const dueAt = toIsoDate(task.dueDate);
    return dueAt !== null && dueAt < now.getTime();
  });
  const dueSoonTasks = activeTasks.filter((task) => {
    const dueAt = toIsoDate(task.dueDate);
    if (dueAt === null) return false;
    const hoursUntilDue = (dueAt - now.getTime()) / (1000 * 60 * 60);
    return hoursUntilDue > 0 && hoursUntilDue <= 24;
  });

  const todayLines = todayTasks.slice(0, taskLimit).map((task) => {
    const tags = [
      task.priority && task.priority !== 'none' ? task.priority : null,
      task.dueDate ? `due:${task.dueDate}` : null,
      overdueTasks.some((o) => o.id === task.id) ? 'OVERDUE' : null,
    ]
      .filter(Boolean)
      .join(', ');

    return `- [${task.id}] ${task.title}${tags ? ` (${tags})` : ''}`;
  });

  return [
    '## Today',
    ...(todayLines.length > 0 ? todayLines : ['- (empty)']),
    '',
    `Active: ${activeTasks.length} | Inbox: ${liveContext.inboxCount} | Overdue: ${overdueTasks.length} | Due soon: ${dueSoonTasks.length}`,
  ].join('\n');
};

// ─── Slim identity for local models ─────────────────────────

const buildSlimIdentity = (): string => {
  const name = getUserName();
  const possessive = name ? `${name}'s` : "the user's";

  return `You are ${possessive} task assistant in Untask. Terse, direct.

Clear intent -> act via tools. No narration, just do it.
Ambiguous -> one short clarifying question.
After tool calls -> action cards show results. Add text only if it adds value. Zero text is often ideal.
Use emit_chips for 2-4 quick-action options when useful.`;
};

// ─── Main builder ───────────────────────────────────────────

export const buildSystemPrompt = (
  input: BuildSystemPromptInput,
): BuiltSystemPrompt => {
  const now = input.liveContext.now
    ? new Date(input.liveContext.now)
    : new Date();
  const timezone =
    input.liveContext.timezone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone;

  const metaSection = buildMetaSection(now, timezone);

  const slim = input.isSlimMode === true;
  const identity = slim ? buildSlimIdentity() : getIdentity();

  const knowledge = slim ? '' : getMemory();
  const knowledgeSection = knowledge.trim()
    ? `## Knowledge\n\n${knowledge.trim()}`
    : '';

  const todaySection = buildTodaySection(input.liveContext, now, slim ? 5 : 10);

  const compiledSections = [
    metaSection,
    '---',
    identity,
    ...(knowledgeSection ? ['---', knowledgeSection] : []),
    '---',
    todaySection,
  ].join('\n\n');

  const estimatedTotalTokens = estimateTokens(compiledSections);

  const contextSnapshot: IdentityContextDebugSnapshot = {
    generatedAt: now.toISOString(),
    timezone,
    tokenBudget: estimatedTotalTokens,
    estimatedTotalTokens,
    sectionOrder: ['now', 'identity', 'knowledge', 'today'],
    sections: [
      {
        id: 'now',
        title: 'Now',
        estimatedTokens: estimateTokens(metaSection),
        included: true,
        truncated: false,
        snippetIds: [],
      },
      {
        id: 'identity',
        title: 'Identity',
        estimatedTokens: estimateTokens(identity),
        included: true,
        truncated: false,
        snippetIds: [],
      },
      {
        id: 'knowledge',
        title: 'Knowledge',
        estimatedTokens: estimateTokens(knowledgeSection),
        included: Boolean(knowledgeSection),
        truncated: false,
        snippetIds: [],
      },
      {
        id: 'today',
        title: 'Today',
        estimatedTokens: estimateTokens(todaySection),
        included: true,
        truncated: false,
        snippetIds: [],
      },
    ],
    compiledPrompt: compiledSections,
  };

  return {
    modelInputPrompt: compiledSections,
    contextSnapshot,
  };
};
