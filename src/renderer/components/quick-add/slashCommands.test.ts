import { describe, expect, it } from 'vitest';

import {
  detectSlashToken,
  extractTokens,
  getSuggestions,
  parseDate,
} from './slashCommands';

describe('slashCommands', () => {
  describe('detectSlashToken', () => {
    it('detects slash at start of text', () => {
      expect(detectSlashToken('/p', 2)).toBe('/p');
    });

    it('detects slash after whitespace', () => {
      expect(detectSlashToken('buy milk /d', 11)).toBe('/d');
    });

    it('returns null when no slash is present', () => {
      expect(detectSlashToken('buy milk', 8)).toBeNull();
    });

    it('returns null when slash is mid-word', () => {
      expect(detectSlashToken('http://example', 14)).toBeNull();
    });

    it('returns null after a space (value-typing phase)', () => {
      expect(detectSlashToken('/due tomorrow', 13)).toBeNull();
    });
  });

  describe('getSuggestions', () => {
    it('returns all commands for bare slash', () => {
      const results = getSuggestions('/');
      expect(results.length).toBe(3);
    });

    it('filters to priority for /p', () => {
      const results = getSuggestions('/p');
      expect(results.length).toBe(1);
      expect(results[0].command.type).toBe('priority');
    });

    it('filters to due and today for /t', () => {
      const results = getSuggestions('/t');
      expect(results.length).toBe(1);
      expect(results[0].command.type).toBe('today');
    });

    it('filters to due for /du', () => {
      const results = getSuggestions('/du');
      expect(results.length).toBe(1);
      expect(results[0].command.type).toBe('due');
    });
  });

  describe('extractTokens', () => {
    it('extracts /today token', () => {
      const result = extractTokens('buy milk /today');
      expect(result.cleanTitle).toBe('buy milk');
      expect(result.chips).toHaveLength(1);
      expect(result.chips[0].type).toBe('today');
    });

    it('extracts /p high token', () => {
      const result = extractTokens('buy milk /p high');
      expect(result.cleanTitle).toBe('buy milk');
      expect(result.chips).toHaveLength(1);
      expect(result.chips[0].type).toBe('priority');
      expect(result.chips[0].value).toBe('high');
    });

    it('normalizes /p med to medium', () => {
      const result = extractTokens('/p med fix the bug');
      expect(result.chips[0].value).toBe('medium');
    });

    it('extracts /due tomorrow', () => {
      const result = extractTokens('buy milk /due tomorrow');
      expect(result.cleanTitle).toBe('buy milk');
      expect(result.chips).toHaveLength(1);
      expect(result.chips[0].type).toBe('due');
      // Should be a YYYY-MM-DD string
      expect(result.chips[0].value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('extracts multiple tokens', () => {
      const result = extractTokens('/p high /today fix the bug');
      expect(result.cleanTitle).toBe('fix the bug');
      expect(result.chips).toHaveLength(2);
    });

    it('returns empty chips when no tokens', () => {
      const result = extractTokens('just a normal title');
      expect(result.cleanTitle).toBe('just a normal title');
      expect(result.chips).toHaveLength(0);
    });
  });

  describe('parseDate', () => {
    it('parses "tomorrow"', () => {
      const result = parseDate('tomorrow');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('parses "today"', () => {
      const result = parseDate('today');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('returns null for non-date strings', () => {
      expect(parseDate('foobar')).toBeNull();
    });

    it('parses ISO date', () => {
      const result = parseDate('2026-03-15');
      expect(result).toBe('2026-03-15');
    });
  });
});
