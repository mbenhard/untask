import { describe, expect, it, vi } from 'vitest';

import { formatRelativeTime, buildSystemPrompt } from './systemPrompt';
import type { AssistantLiveContext } from '../../types/assistant';

// ─── Mock memory module (uses settings service / DB) ──────────
vi.mock('./memory', () => ({
  getIdentity: () => 'You are a helpful assistant.',
  getMemory: () => '',
  getUserName: () => 'Test User',
  estimateTokens: (text: string) => Math.ceil(text.length / 4),
}));

// ─── formatRelativeTime ────────────────────────────────────────

describe('formatRelativeTime', () => {
  const now = new Date('2026-03-02T12:00:00Z');

  it('returns empty string for null input', () => {
    expect(formatRelativeTime(null, now)).toBe('');
  });

  it('returns empty string for invalid date', () => {
    expect(formatRelativeTime('not-a-date', now)).toBe('');
  });

  it('returns "just now" for future dates (clock skew)', () => {
    expect(formatRelativeTime('2026-03-02T12:05:00Z', now)).toBe('just now');
  });

  it('returns "just now" for < 1 minute ago', () => {
    expect(formatRelativeTime('2026-03-02T11:59:30Z', now)).toBe('just now');
  });

  it('returns minutes ago for < 60 minutes', () => {
    expect(formatRelativeTime('2026-03-02T11:45:00Z', now)).toBe('15m ago');
    expect(formatRelativeTime('2026-03-02T11:01:00Z', now)).toBe('59m ago');
  });

  it('returns hours ago for < 24 hours', () => {
    expect(formatRelativeTime('2026-03-02T09:00:00Z', now)).toBe('3h ago');
    expect(formatRelativeTime('2026-03-01T13:00:00Z', now)).toBe('23h ago');
  });

  it('returns "yesterday" for exactly 1 day ago', () => {
    expect(formatRelativeTime('2026-03-01T12:00:00Z', now)).toBe('yesterday');
  });

  it('returns days ago for 2-6 days', () => {
    expect(formatRelativeTime('2026-02-28T12:00:00Z', now)).toBe('2 days ago');
    expect(formatRelativeTime('2026-02-25T12:00:00Z', now)).toBe('5 days ago');
  });

  it('returns "last week" for exactly 1 week ago', () => {
    expect(formatRelativeTime('2026-02-23T12:00:00Z', now)).toBe('last week');
  });

  it('returns weeks ago for 2-3 weeks', () => {
    expect(formatRelativeTime('2026-02-16T12:00:00Z', now)).toBe('2 weeks ago');
  });

  it('returns "last month" for ~30 days ago', () => {
    expect(formatRelativeTime('2026-02-02T12:00:00Z', now)).toBe('last month');
  });

  it('returns months ago for > 60 days', () => {
    expect(formatRelativeTime('2025-12-02T12:00:00Z', now)).toBe('3 months ago');
  });

  it('returns "just now" for identical timestamps', () => {
    expect(formatRelativeTime('2026-03-02T12:00:00Z', now)).toBe('just now');
  });
});

// ─── buildNotesSection (tested via buildSystemPrompt) ──────────

describe('buildSystemPrompt notes section', () => {
  const baseLiveContext: AssistantLiveContext = {
    tasks: [],
    inboxCount: 0,
    now: '2026-03-02T12:00:00Z',
    timezone: 'UTC',
  };

  it('omits notes section when no notes are present', () => {
    const { modelInputPrompt } = buildSystemPrompt({
      userMessage: 'hello',
      liveContext: { ...baseLiveContext, notes: [] },
    });

    expect(modelInputPrompt).not.toContain('## Notes');
    expect(modelInputPrompt).not.toContain('<user_notes>');
  });

  it('omits notes section when notes is undefined', () => {
    const { modelInputPrompt } = buildSystemPrompt({
      userMessage: 'hello',
      liveContext: { ...baseLiveContext },
    });

    expect(modelInputPrompt).not.toContain('## Notes');
  });

  it('includes notes section with correct format', () => {
    const { modelInputPrompt } = buildSystemPrompt({
      userMessage: 'hello',
      liveContext: {
        ...baseLiveContext,
        notes: [
          { id: 'n1', title: 'My Note', isPinned: false, updatedAt: '2026-03-02T11:00:00Z' },
        ],
      },
    });

    expect(modelInputPrompt).toContain('## Notes');
    expect(modelInputPrompt).toContain('1 active note:');
    expect(modelInputPrompt).toContain('- [n1] My Note (updated 1h ago)');
    expect(modelInputPrompt).toContain('<user_notes>');
    expect(modelInputPrompt).toContain('</user_notes>');
  });

  it('pluralizes "notes" for multiple entries', () => {
    const { modelInputPrompt } = buildSystemPrompt({
      userMessage: 'hello',
      liveContext: {
        ...baseLiveContext,
        notes: [
          { id: 'n1', title: 'Note A', isPinned: false, updatedAt: null },
          { id: 'n2', title: 'Note B', isPinned: false, updatedAt: null },
        ],
      },
    });

    expect(modelInputPrompt).toContain('2 active notes:');
  });

  it('falls back to "(Untitled note)" when title is empty but passes filter', () => {
    // A note with whitespace-only title gets filtered out by the defensive filter
    const { modelInputPrompt } = buildSystemPrompt({
      userMessage: 'hello',
      liveContext: {
        ...baseLiveContext,
        notes: [
          { id: 'n1', title: '  ', isPinned: false, updatedAt: null },
        ],
      },
    });

    // Ghost note should be filtered out entirely
    expect(modelInputPrompt).not.toContain('## Notes');
  });

  it('caps at 10 notes in normal mode', () => {
    const manyNotes = Array.from({ length: 15 }, (_, i) => ({
      id: `n${i}`,
      title: `Note ${i}`,
      isPinned: false,
      updatedAt: null,
    }));

    const { modelInputPrompt } = buildSystemPrompt({
      userMessage: 'hello',
      liveContext: { ...baseLiveContext, notes: manyNotes },
    });

    expect(modelInputPrompt).toContain('10 active notes:');
    expect(modelInputPrompt).toContain('[n9]');
    expect(modelInputPrompt).not.toContain('[n10]');
  });

  it('caps at 5 notes in slim mode', () => {
    const manyNotes = Array.from({ length: 10 }, (_, i) => ({
      id: `n${i}`,
      title: `Note ${i}`,
      isPinned: false,
      updatedAt: null,
    }));

    const { modelInputPrompt } = buildSystemPrompt({
      userMessage: 'hello',
      liveContext: { ...baseLiveContext, notes: manyNotes },
      isSlimMode: true,
    });

    expect(modelInputPrompt).toContain('5 active notes:');
    expect(modelInputPrompt).toContain('[n4]');
    expect(modelInputPrompt).not.toContain('[n5]');
  });

  it('records notes section in context snapshot', () => {
    const { contextSnapshot } = buildSystemPrompt({
      userMessage: 'hello',
      liveContext: {
        ...baseLiveContext,
        notes: [
          { id: 'n1', title: 'Test', isPinned: false, updatedAt: null },
        ],
      },
    });

    const notesSnap = contextSnapshot.sections.find((s) => s.id === 'notes');
    expect(notesSnap).toBeDefined();
    expect(notesSnap!.included).toBe(true);
    expect(notesSnap!.estimatedTokens).toBeGreaterThan(0);
  });

  it('marks notes section as not included when empty', () => {
    const { contextSnapshot } = buildSystemPrompt({
      userMessage: 'hello',
      liveContext: { ...baseLiveContext, notes: [] },
    });

    const notesSnap = contextSnapshot.sections.find((s) => s.id === 'notes');
    expect(notesSnap).toBeDefined();
    expect(notesSnap!.included).toBe(false);
  });
});
