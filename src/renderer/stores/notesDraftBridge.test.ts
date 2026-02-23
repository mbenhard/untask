import { beforeEach, describe, expect, it } from 'vitest';

import {
  getActiveNoteDraftContent,
  setActiveNoteDraft,
} from './notesDraftBridge';

describe('notesDraftBridge', () => {
  beforeEach(() => {
    setActiveNoteDraft(null, '');
  });

  it('returns content only for the active note id', () => {
    setActiveNoteDraft('note-1', '{"type":"paragraph"}');

    expect(getActiveNoteDraftContent('note-1')).toBe('{"type":"paragraph"}');
    expect(getActiveNoteDraftContent('note-2')).toBeNull();
  });

  it('clears the draft when note id is null', () => {
    setActiveNoteDraft('note-1', '{"type":"paragraph"}');
    setActiveNoteDraft(null, '');

    expect(getActiveNoteDraftContent('note-1')).toBeNull();
  });
});
