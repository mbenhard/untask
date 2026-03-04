import * as chrono from 'chrono-node';

// ─── Types ────────────────────────────────────────────────

export type TokenType = 'tag' | 'status' | 'priority' | 'due' | 'today';

export type DetectedToken = {
  type: TokenType | 'slash';  // 'slash' = user typed / for the command menu
  partial: string;            // text after the trigger, e.g. 'per' for '#per'
};

export type ExtractedToken = {
  type: TokenType;
  value: string;
};

export type ParsedInput = {
  cleanTitle: string;
  tokens: ExtractedToken[];
};

export type HighlightRange = {
  start: number;
  end: number;
  type: TokenType;
};

export type SuggestionItem = {
  label: string;
  value: string;
  type: TokenType | 'slash';
  shorthand?: string;       // symbol alias shown in / menu
  detail?: string;          // e.g. usage count, options list
  isCreate?: boolean;       // "Create #newtag" item
};

export type SuggestionData = {
  tags?: { tag: string; count: number }[];
  statuses?: { id: string; label: string }[];
};

// ─── Slash command definitions (for / menu) ───────────────

type SlashCommandDef = {
  type: TokenType;
  trigger: string;
  label: string;
  shorthand?: string;
  hasValue: boolean;
  options?: string[];
};

const SLASH_COMMANDS: SlashCommandDef[] = [
  { type: 'tag',      trigger: '/tag',    label: 'Tag',      shorthand: '#',  hasValue: true },
  { type: 'status',   trigger: '/status', label: 'Status',   shorthand: '@',  hasValue: true },
  { type: 'priority', trigger: '/p',      label: 'Priority', shorthand: '!!', hasValue: true, options: ['high', 'medium', 'low'] },
  { type: 'due',      trigger: '/due',    label: 'Due date',                  hasValue: true },
  { type: 'today',    trigger: '/today',  label: 'Today',                     hasValue: false },
];

// ─── Status mapping ───────────────────────────────────────

const STATUS_ALIASES: Record<string, string> = {
  inbox: 'inbox',
  backlog: 'active',
  active: 'active',
  'in progress': 'in_progress',
  in_progress: 'in_progress',
  'on hold': 'waiting',
  on_hold: 'waiting',
  waiting: 'waiting',
  review: 'review',
  someday: 'someday',
};

function resolveStatusId(raw: string): string {
  const lower = raw.toLowerCase().replace(/_/g, '_');
  return STATUS_ALIASES[lower] ?? lower;
}

// ─── Priority mapping ─────────────────────────────────────

const BANG_PRIORITY: Record<string, string> = {
  '1': 'high',
  '2': 'medium',
  '3': 'low',
};

function normalizePriority(val: string): string | null {
  const v = val.toLowerCase();
  if (v === 'med') return 'medium';
  if (['high', 'medium', 'low', 'none'].includes(v)) return v;
  return BANG_PRIORITY[v] ?? null;
}

// ─── Date parsing ─────────────────────────────────────────

export function parseDate(input: string): string | null {
  const results = chrono.parse(input, new Date(), { forwardDate: true });
  if (results.length === 0) return null;
  const d = results[0].start.date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ─── Detection (for popover while typing) ─────────────────

/**
 * Detect if the cursor is inside a token trigger.
 * Returns the token type and partial text, or null.
 */
export function detectToken(text: string, cursorPos: number): DetectedToken | null {
  const before = text.slice(0, cursorPos);

  // Walk backwards to find the start of the current word
  let wordStart = before.length;
  while (wordStart > 0 && before[wordStart - 1] !== ' ') {
    wordStart--;
  }
  const word = before.slice(wordStart);

  // !! priority
  if (word.startsWith('!!')) {
    const partial = word.slice(2);
    if (partial.length <= 1 && !/\s/.test(partial)) {
      return { type: 'priority', partial };
    }
    return null;
  }

  // # tag
  if (word.startsWith('#') && word.length >= 1) {
    return { type: 'tag', partial: word.slice(1) };
  }

  // @ status
  if (word.startsWith('@') && word.length >= 1) {
    return { type: 'status', partial: word.slice(1) };
  }

  // / slash command
  if (word.startsWith('/')) {
    // If there's a space in the word, user is typing the value — don't show command menu
    if (word.includes(' ')) return null;
    return { type: 'slash', partial: word.slice(1) };
  }

  return null;
}

// ─── Extraction (on submit) ──────────────────────────────

const TOKEN_REGEXES: { type: TokenType; regex: RegExp; extract: (match: RegExpMatchArray) => ExtractedToken | null }[] = [
  // /today
  {
    type: 'today',
    regex: /(?<=^|\s)\/today(?=\s|$)/g,
    extract: () => ({ type: 'today', value: 'true' }),
  },
  // /p <value>
  {
    type: 'priority',
    regex: /(?<=^|\s)\/p\s+(high|medium|med|low|none)(?=\s|$)/gi,
    extract: (m) => {
      const val = normalizePriority(m[1]);
      return val ? { type: 'priority', value: val } : null;
    },
  },
  // /due <date text> — captures until next token trigger or end
  {
    type: 'due',
    regex: /(?<=^|\s)\/due\s+(.+?)(?=\s*(?:\/|#|@|!!)|$)/gi,
    extract: (m) => {
      const parsed = parseDate(m[1].trim());
      return parsed ? { type: 'due', value: parsed } : null;
    },
  },
  // /tag <value>
  {
    type: 'tag',
    regex: /(?<=^|\s)\/tag\s+(\S+)(?=\s|$)/gi,
    extract: (m) => ({ type: 'tag', value: m[1].toLowerCase() }),
  },
  // /status <value>
  {
    type: 'status',
    regex: /(?<=^|\s)\/status\s+(\S+)(?=\s|$)/gi,
    extract: (m) => ({ type: 'status', value: resolveStatusId(m[1]) }),
  },
  // #tag
  {
    type: 'tag',
    regex: /(?<=^|\s)#(\w+)(?=\s|$)/g,
    extract: (m) => ({ type: 'tag', value: m[1].toLowerCase() }),
  },
  // @status
  {
    type: 'status',
    regex: /(?<=^|\s)@(\w+)(?=\s|$)/g,
    extract: (m) => ({ type: 'status', value: resolveStatusId(m[1]) }),
  },
  // !!N priority
  {
    type: 'priority',
    regex: /(?<=^|\s)!!([1-3])(?=\s|$)/g,
    extract: (m) => {
      const val = BANG_PRIORITY[m[1]];
      return val ? { type: 'priority', value: val } : null;
    },
  },
];

export function extractTokens(text: string): ParsedInput {
  const tokens: ExtractedToken[] = [];
  let remaining = text;

  const removals: { start: number; end: number }[] = [];

  for (const pattern of TOKEN_REGEXES) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(remaining)) !== null) {
      const token = pattern.extract(match);
      if (token) {
        removals.push({ start: match.index, end: match.index + match[0].length });
        tokens.push(token);
      }
    }
  }

  // Remove matched regions from title (in reverse order to preserve indices)
  removals.sort((a, b) => b.start - a.start);
  for (const { start, end } of removals) {
    remaining = remaining.slice(0, start) + remaining.slice(end);
  }

  // Deduplicate: tags keep all unique, status/priority last wins
  const uniqueTags = new Set<string>();
  const deduped: ExtractedToken[] = [];
  let lastStatus: ExtractedToken | null = null;
  let lastPriority: ExtractedToken | null = null;

  for (const t of tokens) {
    if (t.type === 'tag') {
      if (!uniqueTags.has(t.value)) {
        uniqueTags.add(t.value);
        deduped.push(t);
      }
    } else if (t.type === 'status') {
      lastStatus = t;
    } else if (t.type === 'priority') {
      lastPriority = t;
    } else {
      deduped.push(t); // today, due — keep all
    }
  }
  if (lastStatus) deduped.push(lastStatus);
  if (lastPriority) deduped.push(lastPriority);

  return {
    cleanTitle: remaining.replace(/\s{2,}/g, ' ').trim(),
    tokens: deduped,
  };
}

// ─── Highlight ranges (for overlay mirror) ────────────────

/**
 * Return character ranges where tokens appear in the text.
 * Used by the overlay mirror to render highlighted spans.
 */
export function highlightRanges(text: string): HighlightRange[] {
  const ranges: HighlightRange[] = [];

  const HIGHLIGHT_PATTERNS: { type: TokenType; regex: RegExp }[] = [
    { type: 'today',    regex: /(?<=^|\s)\/today(?=\s|$)/g },
    { type: 'priority', regex: /(?<=^|\s)\/p\s+(?:high|medium|med|low|none)(?=\s|$)/gi },
    { type: 'due',      regex: /(?<=^|\s)\/due\s+.+?(?=\s*(?:\/|#|@|!!)|$)/gi },
    { type: 'tag',      regex: /(?<=^|\s)\/tag\s+\S+(?=\s|$)/gi },
    { type: 'status',   regex: /(?<=^|\s)\/status\s+\S+(?=\s|$)/gi },
    { type: 'tag',      regex: /(?<=^|\s)#\w+(?=\s|$)/g },
    { type: 'status',   regex: /(?<=^|\s)@\w+(?=\s|$)/g },
    { type: 'priority', regex: /(?<=^|\s)!![1-3](?=\s|$)/g },
  ];

  for (const pattern of HIGHLIGHT_PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      ranges.push({
        start: match.index,
        end: match.index + match[0].length,
        type: pattern.type,
      });
    }
  }

  return ranges.sort((a, b) => a.start - b.start);
}

// ─── Suggestions (for popover) ────────────────────────────

export function getSuggestions(
  detected: DetectedToken,
  data?: SuggestionData,
): SuggestionItem[] {
  const { type, partial } = detected;

  if (type === 'slash') {
    // Show command menu filtered by partial
    return SLASH_COMMANDS
      .filter((cmd) => {
        const trigger = cmd.trigger.slice(1); // remove leading /
        return trigger.startsWith(partial.toLowerCase()) || partial === '';
      })
      .map((cmd) => ({
        label: cmd.label,
        value: cmd.trigger,
        type: 'slash' as const,
        shorthand: cmd.shorthand,
        detail: cmd.options?.join(', '),
      }));
  }

  if (type === 'tag') {
    const tags = data?.tags ?? [];
    const lower = partial.toLowerCase();
    const matches = tags
      .filter((t) => t.tag.startsWith(lower))
      .map((t) => ({
        label: t.tag,
        value: t.tag,
        type: 'tag' as const,
        detail: String(t.count),
      }));

    // If no prefix matches and partial is non-empty, add "Create" option
    if (lower && matches.length === 0) {
      matches.push({
        label: lower,
        value: lower,
        type: 'tag' as const,
        detail: 'create',
        isCreate: true,
      });
    }

    return matches;
  }

  if (type === 'status') {
    const statuses = data?.statuses ?? [];
    const lower = partial.toLowerCase();
    return statuses
      .filter((s) => s.label.toLowerCase().startsWith(lower) || s.id.startsWith(lower))
      .map((s) => ({
        label: s.label,
        value: s.id,
        type: 'status' as const,
      }));
  }

  if (type === 'priority') {
    const options = [
      { label: 'High', value: 'high', shorthand: '!!1' },
      { label: 'Medium', value: 'medium', shorthand: '!!2' },
      { label: 'Low', value: 'low', shorthand: '!!3' },
    ];
    if (!partial) return options.map((o) => ({ ...o, type: 'priority' as const }));
    return options
      .filter((o) => o.shorthand.endsWith(partial) || o.value.startsWith(partial.toLowerCase()))
      .map((o) => ({ ...o, type: 'priority' as const }));
  }

  return [];
}
