import type { Task } from '../db/schema';
import type {
  AssistantLiveContext,
  IdentityContextDebugSnapshot,
} from '../../types/assistant';
import { getIdentity, estimateTokens } from './memory';
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
  const staleClientTasks = activeTasks.filter((task) => {
    const touchedAt = toIsoDate(task.lastClientTouchAt);
    if (touchedAt === null) return false;
    return (now.getTime() - touchedAt) / (1000 * 60 * 60 * 24) >= 7;
  });
  const completedToday = liveContext.tasks.filter((task) => {
    if (task.status !== 'done' || !task.completedAt) return false;
    const completedDate = new Date(task.completedAt).toISOString().slice(0, 10);
    const todayDate = now.toISOString().slice(0, 10);
    return completedDate === todayDate;
  });

  const overdueValueAtRisk = overdueTasks.reduce(
    (sum, task) => sum + (task.valueAtRisk ?? 0),
    0,
  );

  let riskLevel = 'low';
  if (overdueTasks.length >= 3 || staleClientTasks.length >= 2 || overdueValueAtRisk >= 2000) {
    riskLevel = 'high';
  } else if (overdueTasks.length > 0 || staleClientTasks.length > 0 || overdueValueAtRisk > 0) {
    riskLevel = 'medium';
  }

  // Today tasks with detail
  const todayLines = todayTasks.slice(0, 10).map((task) => {
    const tags = [
      task.priority && task.priority !== 'none' ? task.priority : null,
      task.dueDate ? `due:${task.dueDate}` : null,
      overdueTasks.some((o) => o.id === task.id) ? 'OVERDUE' : null,
      typeof task.valueAtRisk === 'number' && task.valueAtRisk > 0
        ? `$${task.valueAtRisk} at risk`
        : null,
    ]
      .filter(Boolean)
      .join(', ');

    return `- [${task.id}] ${task.title}${tags ? ` (${tags})` : ''}`;
  });

  const lines = [
    '## Your Current State',
    '',
    `### Today (${todayTasks.length} tasks)`,
    ...(todayLines.length > 0 ? todayLines : ['- (empty — you should propose a plan)']),
    '',
    '### Situation',
    `- Active: ${activeTasks.length} tasks | Inbox: ${liveContext.inboxCount} unprocessed`,
    `- Overdue: ${overdueTasks.length} tasks${overdueValueAtRisk > 0 ? ` ($${overdueValueAtRisk} at risk)` : ''}`,
    `- Due within 24h: ${dueSoonTasks.length}`,
  ];

  if (staleClientTasks.length > 0) {
    lines.push(`- Stale client touchpoints: ${staleClientTasks.length} (>7 days)`);
  }

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
    '### 2. Response Shape',
    '- Lead with what you did or what matters most.',
    '- Follow with the next recommended action.',
    '- End with chips when applicable.',
    '- Maximum 3-4 sentences for routine operations. Longer only for planning or analysis.',
    '',
    "GOOD: \"Moved Autogeber Invoice to Monday. That frees today for the Lorinčík handoff — want me to add it to Today?\"",
    "BAD: \"Sure! I'd be happy to help you move that task. Let me go ahead and reschedule the Autogeber Invoice to next Monday for you. Is there anything else you'd like me to do?\"",
    '',
    '### 3. Interactive Chips',
    'You can attach chips to your messages for quick interactions. Use the emit_chips tool to attach them.',
    '',
    '**When to use chips:**',
    '- ALWAYS when you need clarification and there\'s a finite set of options',
    '- ALWAYS after completing an action (offer logical next steps)',
    '- ALWAYS when presenting choices or alternatives',
    '- When suggesting a plan (offer accept/modify/reject)',
    '',
    '**When NOT to use chips:**',
    '- Open-ended questions with no finite answer set',
    '- Simple confirmations where yes/no is enough (just ask)',
    '- When the user is in the middle of explaining something',
    '',
    '**Chip rules:**',
    '- 2-4 chips per message. Never more than 4.',
    '- Labels: 2-5 words maximum. Action-oriented.',
    '- Response chips for disambiguation: use the exact text Marcus would type.',
    '- Action chips for next steps: each maps to one tool call.',
    '',
    '### 4. Memory & Self-Management',
    '',
    '**Reading Memory:**',
    '- Call read_memory when a client, project, or preference is relevant to the current request',
    '- Call read_memory during planning or scheduling to check for known workflows',
    "- Don't read Memory on every message — only when the context demands it",
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
    '- After proactive interventions (did the nudge help?)',
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
    '### 7. Proactive Behavior',
    'You are not a passive tool. You monitor the situation and speak first when:',
    '- The Today list is empty during working hours → propose a plan',
    '- Tasks are overdue and accumulating → surface the top blocker',
    '- A client touchpoint has gone stale (>7 days) → suggest a brief update',
    '- High-value work is idle → nudge toward the revenue-critical task',
    '- A deadline is approaching (within 48h) and priority is low → escalate and explain why',
    '',
    'When speaking proactively:',
    '- Be brief. One observation, one recommendation, chips for action.',
    "- Don't nag. If Marcus dismisses a nudge, respect it. Wait at least 2 hours before nudging the same topic.",
    '- Always include an [Undo] chip when you autonomously changed something.',
    '',
    '### 8. Safety & Confirmation',
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

  // 3. Live State
  const liveStateSection = buildLiveStateSection(input.liveContext, now);

  // 4. Operating Protocol
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
  const compiledPrompt = [
    metaSection,
    '',
    '---',
    '',
    identity,
    '',
    '---',
    '',
    liveStateSection,
    '',
    '---',
    '',
    protocolSection,
  ].join('\n');

  const estimatedTotalTokens = estimateTokens(compiledPrompt);

  // Build debug snapshot (simplified — no more section scoring)
  const contextSnapshot: IdentityContextDebugSnapshot = {
    generatedAt: now.toISOString(),
    timezone,
    tokenBudget: estimatedTotalTokens, // No budget system — report actual size
    estimatedTotalTokens,
    sectionOrder: ['meta', 'identity', 'live-state', 'protocol'],
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
