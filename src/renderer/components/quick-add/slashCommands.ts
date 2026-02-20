import * as chrono from 'chrono-node';

export type SlashCommandType = 'priority' | 'due' | 'today';

export type SlashCommandDef = {
  type: SlashCommandType;
  trigger: string;
  label: string;
  hasValue: boolean;
  options?: string[];
};

export const SLASH_COMMANDS: SlashCommandDef[] = [
  { type: 'priority', trigger: '/p', label: 'Priority', hasValue: true, options: ['high', 'medium', 'low', 'none'] },
  { type: 'due', trigger: '/due', label: 'Due date', hasValue: true },
  { type: 'today', trigger: '/today', label: 'Today', hasValue: false },
];

export type ChipToken = {
  type: SlashCommandType;
  label: string;
  value: string;
};

export type ParsedInput = {
  cleanTitle: string;
  chips: ChipToken[];
};

// Match a slash command token anywhere in the text.
// Token format: /command or /command value
// Returns the first complete token found and its position.
const TOKEN_PATTERNS: { type: SlashCommandType; regex: RegExp; hasValue: boolean }[] = [
  { type: 'today', regex: /\/today(?=\s|$)/, hasValue: false },
  { type: 'priority', regex: /\/p\s+(high|medium|med|low|none)(?=\s|$)/i, hasValue: true },
  { type: 'due', regex: /\/due\s+(.+?)(?=\s*\/|$)/, hasValue: true },
];

function normalizePriority(val: string): string {
  const v = val.toLowerCase();
  if (v === 'med') return 'medium';
  return v;
}

export function parseDate(input: string): string | null {
  const results = chrono.parse(input, new Date(), { forwardDate: true });
  if (results.length === 0) return null;
  const d = results[0].start.date();
  // Return YYYY-MM-DD format
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function extractTokens(text: string): ParsedInput {
  const chips: ChipToken[] = [];
  let remaining = text;

  for (const pattern of TOKEN_PATTERNS) {
    const match = remaining.match(pattern.regex);
    if (!match) continue;

    if (pattern.type === 'today') {
      chips.push({ type: 'today', label: 'Today', value: 'true' });
      remaining = remaining.slice(0, match.index!) + remaining.slice(match.index! + match[0].length);
    } else if (pattern.type === 'priority') {
      const val = normalizePriority(match[1]);
      chips.push({ type: 'priority', label: `Priority: ${val}`, value: val });
      remaining = remaining.slice(0, match.index!) + remaining.slice(match.index! + match[0].length);
    } else if (pattern.type === 'due') {
      const rawDate = match[1].trim();
      const parsed = parseDate(rawDate);
      if (parsed) {
        chips.push({ type: 'due', label: `Due: ${rawDate}`, value: parsed });
        remaining = remaining.slice(0, match.index!) + remaining.slice(match.index! + match[0].length);
      }
    }
  }

  return {
    cleanTitle: remaining.replace(/\s{2,}/g, ' ').trim(),
    chips,
  };
}

// Get slash command suggestions for an in-progress token.
// Returns matching commands based on the partial input after `/`.
export type Suggestion = {
  command: SlashCommandDef;
  matchText: string;
};

export function getSuggestions(partialToken: string): Suggestion[] {
  // partialToken starts with '/' e.g. '/p', '/du', '/'
  const lower = partialToken.toLowerCase();
  return SLASH_COMMANDS
    .filter((cmd) => cmd.trigger.startsWith(lower) || lower === '/')
    .map((cmd) => ({ command: cmd, matchText: cmd.trigger }));
}

// Detect if the cursor is currently typing a slash command.
// Returns the partial token (e.g. '/p', '/du') or null.
export function detectSlashToken(text: string, cursorPos: number): string | null {
  // Walk backwards from cursor to find a '/'
  const beforeCursor = text.slice(0, cursorPos);
  const slashIdx = beforeCursor.lastIndexOf('/');
  if (slashIdx === -1) return null;

  // Must be at start of text or preceded by whitespace
  if (slashIdx > 0 && beforeCursor[slashIdx - 1] !== ' ') return null;

  const partial = beforeCursor.slice(slashIdx);
  // Only return if it's still a command prefix (no space means still typing command name)
  // If there's a space, the user is typing the value — don't show command suggestions
  if (partial.includes(' ')) return null;

  return partial;
}
