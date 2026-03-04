import { describe, expect, it } from 'vitest';
import {
  detectToken,
  extractTokens,
  getSuggestions,
  parseDate,
  highlightRanges,
} from './slashCommands';

describe('detectToken', () => {
  // --- # tag trigger ---
  it('detects # at start of text', () => {
    expect(detectToken('#per', 4)).toEqual({ type: 'tag', partial: 'per' });
  });
  it('detects # after space', () => {
    expect(detectToken('buy milk #wo', 12)).toEqual({ type: 'tag', partial: 'wo' });
  });
  it('does not detect # mid-word', () => {
    expect(detectToken('test#tag', 8)).toBeNull();
  });
  it('detects bare # with empty partial', () => {
    expect(detectToken('task #', 6)).toEqual({ type: 'tag', partial: '' });
  });

  // --- @ status trigger ---
  it('detects @ at start', () => {
    expect(detectToken('@ba', 3)).toEqual({ type: 'status', partial: 'ba' });
  });
  it('detects @ after space', () => {
    expect(detectToken('task @wa', 8)).toEqual({ type: 'status', partial: 'wa' });
  });
  it('does not detect @ mid-word', () => {
    expect(detectToken('email@test', 10)).toBeNull();
  });

  // --- !! priority trigger ---
  it('detects !! at start', () => {
    expect(detectToken('!!', 2)).toEqual({ type: 'priority', partial: '' });
  });
  it('returns null for completed !!1 (complete token)', () => {
    expect(detectToken('task !!1', 8)).toBeNull();
  });
  it('returns null for completed !!high (complete token)', () => {
    expect(detectToken('task !!high', 11)).toBeNull();
  });
  it('detects partial !!h', () => {
    expect(detectToken('task !!h', 8)).toEqual({ type: 'priority', partial: 'h' });
  });
  it('does not detect single !', () => {
    expect(detectToken('task !x', 7)).toBeNull();
  });

  // --- / slash command trigger ---
  it('detects / for command menu', () => {
    expect(detectToken('task /', 6)).toEqual({ type: 'slash', partial: '' });
  });
  it('detects /p partial', () => {
    expect(detectToken('/p', 2)).toEqual({ type: 'slash', partial: 'p' });
  });
  it('detects /tag partial', () => {
    expect(detectToken('/tag', 4)).toEqual({ type: 'slash', partial: 'tag' });
  });
  it('returns null when slash has value (space after command)', () => {
    expect(detectToken('/due tomorrow', 13)).toBeNull();
  });

  // --- No trigger ---
  it('returns null for plain text', () => {
    expect(detectToken('buy milk', 8)).toBeNull();
  });
});

describe('extractTokens', () => {
  // --- Existing slash commands ---
  it('extracts /today', () => {
    const r = extractTokens('buy milk /today');
    expect(r.cleanTitle).toBe('buy milk');
    expect(r.tokens).toContainEqual({ type: 'today', value: 'true' });
  });
  it('extracts /p high', () => {
    const r = extractTokens('buy milk /p high');
    expect(r.cleanTitle).toBe('buy milk');
    expect(r.tokens).toContainEqual({ type: 'priority', value: 'high' });
  });
  it('extracts /due tomorrow', () => {
    const r = extractTokens('buy milk /due tomorrow');
    expect(r.cleanTitle).toBe('buy milk');
    expect(r.tokens.find(t => t.type === 'due')?.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // --- New token types ---
  it('extracts #tag token', () => {
    const r = extractTokens('buy milk #personal');
    expect(r.cleanTitle).toBe('buy milk');
    expect(r.tokens).toContainEqual({ type: 'tag', value: 'personal' });
  });
  it('extracts multiple #tags', () => {
    const r = extractTokens('task #work #urgent');
    expect(r.cleanTitle).toBe('task');
    expect(r.tokens.filter(t => t.type === 'tag')).toHaveLength(2);
  });
  it('extracts @status token', () => {
    const r = extractTokens('task @backlog');
    expect(r.cleanTitle).toBe('task');
    expect(r.tokens).toContainEqual({ type: 'status', value: 'active' });
  });
  it('extracts @In_Progress with underscore', () => {
    const r = extractTokens('task @In_Progress');
    expect(r.cleanTitle).toBe('task');
    expect(r.tokens).toContainEqual({ type: 'status', value: 'in_progress' });
  });
  it('extracts !!1 as priority high', () => {
    const r = extractTokens('task !!1');
    expect(r.cleanTitle).toBe('task');
    expect(r.tokens).toContainEqual({ type: 'priority', value: 'high' });
  });
  it('extracts !!2 as priority medium', () => {
    const r = extractTokens('task !!2');
    expect(r.cleanTitle).toBe('task');
    expect(r.tokens).toContainEqual({ type: 'priority', value: 'medium' });
  });
  it('extracts !!3 as priority low', () => {
    const r = extractTokens('task !!3');
    expect(r.cleanTitle).toBe('task');
    expect(r.tokens).toContainEqual({ type: 'priority', value: 'low' });
  });
  it('extracts !!high as priority high', () => {
    const r = extractTokens('task !!high');
    expect(r.cleanTitle).toBe('task');
    expect(r.tokens).toContainEqual({ type: 'priority', value: 'high' });
  });
  it('extracts !!medium as priority medium', () => {
    const r = extractTokens('task !!medium');
    expect(r.cleanTitle).toBe('task');
    expect(r.tokens).toContainEqual({ type: 'priority', value: 'medium' });
  });
  it('extracts !!low as priority low', () => {
    const r = extractTokens('task !!low');
    expect(r.cleanTitle).toBe('task');
    expect(r.tokens).toContainEqual({ type: 'priority', value: 'low' });
  });
  it('does not extract !!4 (invalid)', () => {
    const r = extractTokens('task !!4');
    expect(r.cleanTitle).toBe('task !!4');
    expect(r.tokens).toHaveLength(0);
  });
  it('extracts mixed tokens', () => {
    const r = extractTokens('buy milk #personal !!1 @backlog /today');
    expect(r.cleanTitle).toBe('buy milk');
    expect(r.tokens).toHaveLength(4);
  });
  it('does not extract # mid-word', () => {
    const r = extractTokens('C#sharp');
    expect(r.cleanTitle).toBe('C#sharp');
    expect(r.tokens).toHaveLength(0);
  });
  it('deduplicates #tags', () => {
    const r = extractTokens('task #work #work');
    expect(r.tokens.filter(t => t.type === 'tag')).toHaveLength(1);
  });
  it('last @status wins', () => {
    const r = extractTokens('task @backlog @waiting');
    const statuses = r.tokens.filter(t => t.type === 'status');
    expect(statuses).toHaveLength(1);
    expect(statuses[0].value).toBe('waiting');
  });
  it('last !! wins', () => {
    const r = extractTokens('task !!1 !!3');
    const priorities = r.tokens.filter(t => t.type === 'priority');
    expect(priorities).toHaveLength(1);
    expect(priorities[0].value).toBe('low');
  });
  it('/tag works as alias for #', () => {
    const r = extractTokens('task /tag personal');
    expect(r.cleanTitle).toBe('task');
    expect(r.tokens).toContainEqual({ type: 'tag', value: 'personal' });
  });
  it('/status works as alias for @', () => {
    const r = extractTokens('task /status backlog');
    expect(r.cleanTitle).toBe('task');
    expect(r.tokens).toContainEqual({ type: 'status', value: 'active' });
  });
});

describe('highlightRanges', () => {
  it('returns ranges for recognized tokens', () => {
    const ranges = highlightRanges('buy milk #personal !!1');
    expect(ranges).toContainEqual(
      expect.objectContaining({ start: 9, end: 18, type: 'tag' })
    );
    expect(ranges).toContainEqual(
      expect.objectContaining({ start: 19, end: 22, type: 'priority' })
    );
  });
  it('returns empty array for plain text', () => {
    expect(highlightRanges('just text')).toEqual([]);
  });
  it('highlights !!high word form', () => {
    const ranges = highlightRanges('task !!high');
    expect(ranges).toContainEqual(
      expect.objectContaining({ start: 5, end: 11, type: 'priority' })
    );
  });
  it('highlights #hyphenated-tag', () => {
    const ranges = highlightRanges('task #my-tag');
    expect(ranges).toContainEqual(
      expect.objectContaining({ start: 5, end: 12, type: 'tag' })
    );
  });
});

describe('getSuggestions', () => {
  it('returns all commands for bare /', () => {
    const r = getSuggestions({ type: 'slash', partial: '' });
    expect(r.length).toBe(5); // tag, status, p, due, today
    expect(r.every((item) => item.type === 'slash')).toBe(true);
  });
  it('returns tag suggestions for #', () => {
    const r = getSuggestions(
      { type: 'tag', partial: 'per' },
      { tags: [{ tag: 'personal', count: 5 }, { tag: 'work', count: 3 }] }
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toEqual(expect.objectContaining({ label: 'personal' }));
  });
  it('returns status suggestions for @', () => {
    const r = getSuggestions(
      { type: 'status', partial: 'ba' },
      { statuses: [{ id: 'active', label: 'Backlog' }, { id: 'waiting', label: 'On Hold' }] }
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toEqual(expect.objectContaining({ label: 'Backlog' }));
  });
  it('returns priority options for !!', () => {
    const r = getSuggestions({ type: 'priority', partial: '' });
    expect(r).toHaveLength(3); // high, medium, low
  });
  it('shows "Create #newtag" when no match', () => {
    const r = getSuggestions(
      { type: 'tag', partial: 'xyz' },
      { tags: [{ tag: 'personal', count: 5 }] }
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toEqual(expect.objectContaining({ label: 'xyz', isCreate: true }));
  });
});

// Keep existing parseDate tests
describe('parseDate', () => {
  it('parses "tomorrow"', () => {
    expect(parseDate('tomorrow')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('returns null for non-date', () => {
    expect(parseDate('foobar')).toBeNull();
  });
});
