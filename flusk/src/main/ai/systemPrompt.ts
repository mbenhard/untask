import type { Task } from '../db/schema';
import type {
  AssistantLiveContext,
  IdentityContextDebugSnapshot,
} from '../../types/assistant';
import { getIdentity, getMemory, estimateTokens } from './memory';
import { getToolDefinitions } from './tools';
import type { ChatModelId } from './models';
import { getModelWebSearchConfig } from './models';

// ─── Types ──────────────────────────────────────────────────

export type BuildSystemPromptInput = {
  userMessage: string;
  liveContext: AssistantLiveContext;
  modelId?: ChatModelId;
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

const inferDaySegment = (now: Date): 'morning' | 'afternoon' | 'evening' => {
  const hour = now.getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
};

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

const buildMetaSection = (now: Date, timezone: string): string => {
  const lines = [
    '## Now',
    `- ${formatLocalTimestamp(now, timezone)} (${timezone})`,
    `- Day segment: ${inferDaySegment(now)}`,
  ];
  return lines.join('\n');
};

const buildLiveStateSection = (
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
  const dueSoonTasks = activeTasks.filter((task) => {
    const dueAt = toIsoDate(task.dueDate);
    if (dueAt === null) return false;
    const hoursUntilDue = (dueAt - now.getTime()) / (1000 * 60 * 60);
    return hoursUntilDue > 0 && hoursUntilDue <= 24;
  });
  const completedToday = liveContext.tasks.filter((task) => {
    if (task.status !== 'done' || !task.completedAt) return false;
    const completedDate = new Date(task.completedAt).toISOString().slice(0, 10);
    const todayDate = now.toISOString().slice(0, 10);
    return completedDate === todayDate;
  });

  let riskLevel = 'low';
  if (overdueTasks.length >= 3) {
    riskLevel = 'high';
  } else if (overdueTasks.length > 0) {
    riskLevel = 'medium';
  }

  // Today tasks with detail
  const todayLines = todayTasks.slice(0, 10).map((task) => {
    const tags = [
      task.priority && task.priority !== 'none' ? task.priority : null,
      task.dueDate ? `due:${task.dueDate}` : null,
      overdueTasks.some((o) => o.id === task.id) ? 'OVERDUE' : null,
    ]
      .filter(Boolean)
      .join(', ');

    return `- [${task.id}] ${task.title}${tags ? ` (${tags})` : ''}`;
  });

  const lines = [
    '## Your Current State',
    '',
    `### Today (${todayTasks.length} tasks)`,
    ...(todayLines.length > 0 ? todayLines : ['- (empty)']),
    '',
    '### Situation',
    `- Active: ${activeTasks.length} tasks | Inbox: ${liveContext.inboxCount} unprocessed`,
    `- Overdue: ${overdueTasks.length} tasks`,
    `- Due within 24h: ${dueSoonTasks.length}`,
  ];

  lines.push(`- Risk level: ${riskLevel}`);

  if (completedToday.length > 0) {
    lines.push('', '### Momentum', `- Completed today: ${completedToday.length}`);
  }

  return lines.join('\n');
};

const buildProtocolSection = (
  toolNames: string,
  supportsWebSearch: boolean,
): string => {
  const webSearchGuidance = supportsWebSearch
    ? [
        '',
        '### 9. Web Search',
        "- You have access to web search. Use it for current events, facts outside your training data, prices, or anything time-sensitive.",
        '- Cite sources when presenting search results.',
      ]
    : [
        '',
        '### 9. Web Search',
        '- This model does not support web search. If Marcus asks for current information, suggest switching to a model that supports it.',
      ];

  return [
    '## Operating Protocol',
    '',
    '### 1. Action Bias',
    'When Marcus asks you to DO something — create, update, complete, delete, move, plan, schedule, remember — call the tool immediately. Never describe what you would do. Just do it.',
    '',
    'If you need a task ID, call list_tasks to find it first, then call the mutation.',
    '',
    'The only time you respond with text alone (no tool call) is when Marcus is asking a question, making conversation, or the request is genuinely ambiguous.',
    '',
    "Failure mode to avoid: \"I'll do that for you\" followed by no tool call. Words without action is never acceptable.",
    '',
    '### 2. Response Discipline',
    '1. Action cards replace text. If tool calls produced visible action cards, do NOT repeat what the cards show. Zero text is acceptable when cards tell the full story.',
    '2. Only speak when adding value:',
    '- The user asked a question',
    '- Something failed (one-line explanation)',
    '- Genuine ambiguity requiring one clarifying question',
    '- The user explicitly asked for analysis or planning',
    '3. No unsolicited advice. Never say "we should...", "consider doing...", "since this is high-priority..." unless Marcus asked for guidance.',
    '4. Chips only at real decision points. Not after routine actions. Only when you cannot proceed without user input.',
    '5. One sentence max after routine actions.',
    '6. Never re-explain completed actions. The action cards already show what happened.',
    '7. Do not answer questions Marcus did not ask.',
    '',
    '### 3. Interactive Chips',
    'When you want to offer Marcus quick-tap options, you MUST call the emit_chips tool. Never write chips as text in your message — no "Options:", no bullet lists of choices, no "Action Chips:" headings. The ONLY way to present tappable options is via the emit_chips tool call.',
    '',
    '**When to use emit_chips:**',
    '- Clarification with a finite option set (2-4 choices)',
    '- Real decision points where the next action depends on Marcus',
    '- Plan acceptance only when explicit approval or choice is required',
    '',
    '**When NOT to use emit_chips:**',
    '- After routine actions that already produced action cards',
    '- Open-ended questions with no finite answer set',
    '- While Marcus is still explaining context',
    '',
    '**Chip rules:**',
    '- 2-4 chips when used. Never more than 4.',
    '- Labels: 2-5 words maximum. Action-oriented.',
    '- Response chips for disambiguation: use the exact text Marcus would type.',
    '- Action chips: each maps to one tool call.',
    '- Call emit_chips AFTER your text, not instead of it.',
    '',
    '### 4. Memory & Self-Management',
    '',
    '**Reading Memory:**',
    '- Your Knowledge document is always present above. You do not need to fetch it.',
    '- Use the update_memory tool to save durable facts.',
    '',
    '**Writing Memory:**',
    '- Save when Marcus explicitly states a preference ("I always...", "My client...", "I prefer...")',
    '- Save when you observe a pattern repeated across 2+ interactions',
    '- Save self-corrections to prevent repeating mistakes',
    '- Announce what you\'re saving: "Noted — saving to Memory: [fact]"',
    '- Keep entries atomic. One fact per line. Organized by section heading.',
    '',
    '**Writing Journal:**',
    '- After meaningful interactions where you learned something',
    '- After every Identity or Memory update (mandatory — log the diff and reason)',
    '- After time reminders fire (did the nudge help?)',
    '- When you make a mistake (self-correction: what went wrong, what to do differently)',
    '',
    '**Updating Identity:**',
    "- Almost never. Only when you've confirmed a behavioral shift across multiple sessions.",
    '- Before updating, read your Journal to verify the pattern is real, not a one-off.',
    '- Log every Identity change to Journal with a before/after diff and reasoning.',
    "- Keep Identity under 3000 tokens. If it's growing, compress — don't truncate meaning.",
    '',
    '### 5. Thinking Before Acting',
    '- Assess what Marcus needs before reaching for tools.',
    '- Chain multiple tool calls when a task needs several steps. ("Plan my day" might need list_tasks → suggest_daily_plan → set_today × 3.)',
    "- Use conversation history for context continuity. Don't re-ask things Marcus already answered.",
    '- If a request is genuinely vague and you can\'t resolve it with chips, ask one clear question.',
    '',
    '### 6. Task Resolution',
    'When Marcus refers to a task by name or partial description:',
    '1. Call list_tasks with a search query to find matches.',
    '2. If exactly one match: proceed immediately.',
    '3. If multiple matches: present them as response chips, not a numbered list.',
    '4. If no matches: tell Marcus and ask for clarification.',
    '',
    '### 7. Safety & Confirmation',
    '- Never perform destructive actions without confirmation, regardless of autonomy mode.',
    '- When a mutation is blocked by policy, explain clearly what confirmation is needed.',
    '- If a tool call fails, tell Marcus what happened. Never retry silently.',
    '- Never create something and immediately delete/modify it in the same turn.',
    '',
    '### Tool Selection',
    `- Available tools: ${toolNames}.`,
    ...webSearchGuidance,
  ].join('\n');
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

  // 1. Meta
  const metaSection = buildMetaSection(now, timezone);

  // 2. Identity (full, untruncated from DB)
  const identity = getIdentity();

  // 3. Knowledge (full document, always present)
  const knowledge = getMemory();
  const knowledgeSection = knowledge.trim()
    ? `## Knowledge\n\n${knowledge.trim()}`
    : '';

  // 4. Live State
  const liveStateSection = buildLiveStateSection(input.liveContext, now);

  // 5. Operating Protocol
  const toolNames = getToolDefinitions()
    .map((t) => t.name)
    .join(', ');
  const webSearchConfig = input.modelId
    ? getModelWebSearchConfig(input.modelId)
    : { supportsWebSearch: false };
  const protocolSection = buildProtocolSection(
    toolNames,
    webSearchConfig.supportsWebSearch,
  );

  // Assemble
  const compiledSections = [
    metaSection,
    '',
    '---',
    '',
    identity,
  ];

  if (knowledgeSection) {
    compiledSections.push('', '---', '', knowledgeSection);
  }

  compiledSections.push(
    '',
    '---',
    '',
    liveStateSection,
    '',
    '---',
    '',
    protocolSection,
  );

  const compiledPrompt = compiledSections.join('\n');

  const estimatedTotalTokens = estimateTokens(compiledPrompt);

  // Build debug snapshot (simplified — no more section scoring)
  const contextSnapshot: IdentityContextDebugSnapshot = {
    generatedAt: now.toISOString(),
    timezone,
    tokenBudget: estimatedTotalTokens, // No budget system — report actual size
    estimatedTotalTokens,
    sectionOrder: ['meta', 'identity', 'knowledge', 'live-state', 'protocol'],
    sections: [
      {
        id: 'meta',
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
        id: 'live-state',
        title: 'Your Current State',
        estimatedTokens: estimateTokens(liveStateSection),
        included: true,
        truncated: false,
        snippetIds: [],
      },
      {
        id: 'protocol',
        title: 'Operating Protocol',
        estimatedTokens: estimateTokens(protocolSection),
        included: true,
        truncated: false,
        snippetIds: [],
      },
    ],
    compiledPrompt,
  };

  return {
    modelInputPrompt: compiledPrompt,
    contextSnapshot,
  };
};
