import { TERMINAL_STATUSES, type PredefinedStatusId, type Task } from '../../types/models';
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

// ─── Relative time helper ────────────────────────────────────

export const formatRelativeTime = (dateStr: string | null, now: Date): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';

  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return 'just now';

  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffWeeks === 1) return 'last week';
  if (diffWeeks < 4) return `${diffWeeks} weeks ago`;
  if (diffMonths <= 1) return 'last month';
  return `${diffMonths} months ago`;
};

// ─── Section builders ───────────────────────────────────────

const buildMetaSection = (now: Date, timezone: string): string =>
  `## Now\n${formatLocalTimestamp(now, timezone)} (${timezone})`;

const buildTodaySection = (
  liveContext: AssistantLiveContext,
  now: Date,
  taskLimit = 10,
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

const buildNotesSection = (
  liveContext: AssistantLiveContext,
  now: Date,
  noteLimit = 10,
): string => {
  const notes = (liveContext.notes ?? []).filter((n) => n.title.trim().length > 0);
  if (notes.length === 0) return '';

  const limited = notes.slice(0, noteLimit);

  const lines = limited.map((note) => {
    const title = note.title || '(Untitled note)';
    const relative = formatRelativeTime(note.updatedAt, now);
    const timeTag = relative ? ` (updated ${relative})` : '';
    return `- [${note.id}] ${title}${timeTag}`;
  });

  return [
    '## Notes',
    `${limited.length} active note${limited.length === 1 ? '' : 's'}:`,
    ...lines,
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
Use emit_chips for 2-4 quick-action options when useful.
Never mention internal IDs (like task, event, or subtask IDs) in chat responses. Humans do not understand them. Use human-readable names and titles instead.`;
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
  const notesSection = buildNotesSection(input.liveContext, now, slim ? 5 : 10);

  const toolingRules = [
    '## Tool use',
    '',
    'Act, don\'t narrate. When intent is clear, call the tool immediately.',
    '',
    '### Reading before acting',
    '- read_note before edit_note',
    '- list_tasks / list_notes when you need to find something by topic',
    '- Check the Notes and Today sections in context first — they may already have what you need',
    '',
    '### Be proactive',
    '- If the user\'s question likely relates to their notes or tasks, look them up — don\'t wait to be asked explicitly',
    '- If context sections look stale or incomplete, re-fetch with the relevant list tool',
    '',
    '### Accuracy',
    '- Never claim an action was completed unless the tool returned success',
    '- Never fabricate note content, task details, or IDs',
    '- If a tool errors, tell the user what happened — don\'t silently retry or guess',
    '',
    '### Efficiency',
    '- Batch related reads into one turn when possible',
    '- Don\'t call list_notes/list_tasks if the answer is already visible in your context sections',
    '- Prefer the attached note snapshot over calling read_note for the same note',
  ].join('\n');

  const formatRules = [
    '## Response format',
    'Never mention internal IDs (task, event, or subtask IDs) in chat. Use human-readable names and titles instead.',
    '',
    '### Formatting',
    '- Short paragraphs and bullet lists. Keep responses to 2-3 sentences when a short answer suffices.',
    '- No markdown tables — task data appears as cards automatically after tool calls.',
    '- Retrieval/filter requests after list_tasks: write exactly one short contextual remark only (for example: "Here are your 4 tasks for today." or "I found 3 matching tasks."). Do not repeat task titles.',
    '- Analysis/synthesis requests after list_tasks (summaries, recaps, weekly snapshots): explain patterns and priorities only; do not paste a full task list.',
    '- No headings (#, ##, etc.) — keep text flat and conversational.',
    '- Use **bold** for emphasis, `inline code` for technical terms.',
  ].join('\n');

  const compiledSections = [
    metaSection,
    '---',
    '<user_identity>',
    identity,
    '</user_identity>',
    ...(knowledgeSection
      ? ['---', '<user_knowledge>', knowledgeSection, '</user_knowledge>']
      : []),
    '---',
    '<user_tasks>',
    todaySection,
    '</user_tasks>',
    ...(notesSection
      ? ['---', '<user_notes>', notesSection, '</user_notes>']
      : []),
    '---',
    toolingRules,
    '---',
    formatRules,
  ].join('\n\n');

  const estimatedTotalTokens = estimateTokens(compiledSections);

  const contextSnapshot: IdentityContextDebugSnapshot = {
    generatedAt: now.toISOString(),
    timezone,
    tokenBudget: estimatedTotalTokens,
    estimatedTotalTokens,
    sectionOrder: ['now', 'identity', 'knowledge', 'today', 'notes', 'tooling', 'formatting'],
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
      {
        id: 'notes',
        title: 'Notes',
        estimatedTokens: estimateTokens(notesSection),
        included: Boolean(notesSection),
        truncated: false,
        snippetIds: [],
      },
      {
        id: 'tooling',
        title: 'Tool Use',
        estimatedTokens: estimateTokens(toolingRules),
        included: true,
        truncated: false,
        snippetIds: [],
      },
      {
        id: 'formatting',
        title: 'Formatting Rules',
        estimatedTokens: estimateTokens(formatRules),
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
