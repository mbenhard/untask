import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '../stores/appStore';
import { useNotesStore } from '../stores/notesStore';
import {
  isExplicitNotesNavigationInFlight,
  navigateToNotes,
} from './notesNavigation';

describe('navigateToNotes', () => {
  beforeEach(() => {
    useAppStore.setState({
      activeView: 'today',
      manualNavigationVersion: 0,
      chatOverlayState: 'peek',
      chatView: 'threads',
      unreadProactive: false,
      newTaskTrigger: 0,
      aiEnabled: true,
    });
  });

  it('enters notes view and runs default enter flow', async () => {
    const enterNotesView = vi.fn(async () => undefined);
    useNotesStore.setState({
      enterNotesView: enterNotesView as never,
    });

    await navigateToNotes({ type: 'default' });

    expect(useAppStore.getState().activeView).toBe('notes');
    expect(enterNotesView).toHaveBeenCalledTimes(1);
  });

  it('routes explicit create intent to createNote', async () => {
    let resolveCreate: (() => void) | null = null;
    const createNote = vi.fn(async () => new Promise<void>((resolve) => {
      resolveCreate = resolve;
    }));
    useNotesStore.setState({
      createNote: createNote as never,
    });

    const createPromise = navigateToNotes({ type: 'create' });
    await Promise.resolve();

    expect(isExplicitNotesNavigationInFlight()).toBe(true);
    resolveCreate?.();
    await createPromise;
    expect(useAppStore.getState().activeView).toBe('notes');
    expect(createNote).toHaveBeenCalledTimes(1);
    expect(isExplicitNotesNavigationInFlight()).toBe(false);
  });

  it('routes explicit open intent to openNote', async () => {
    const openNote = vi.fn(async () => undefined);
    useNotesStore.setState({
      openNote: openNote as never,
    });

    await navigateToNotes({ type: 'open', noteId: 'note-123' });

    expect(useAppStore.getState().activeView).toBe('notes');
    expect(openNote).toHaveBeenCalledWith('note-123');
  });
});
