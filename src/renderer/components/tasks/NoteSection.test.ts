// @vitest-environment jsdom
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NoteSection } from './NoteSection';

const blockEditorHarness = vi.hoisted(() => ({
  document: [] as unknown[],
  focus: vi.fn(),
  onBlur: undefined as undefined | (() => void),
  onFocus: undefined as undefined | (() => void),
}));

const autoSaveHarness = vi.hoisted(() => ({
  handleBodyChange: vi.fn(),
  flushSave: vi.fn(),
}));

vi.mock('../../hooks/useAutoSaveBody', () => ({
  useAutoSaveBody: () => autoSaveHarness,
}));

vi.mock('../editor/BlockEditor', async () => {
  const React = await import('react');

  return {
    BlockEditor: (props: {
      editorRef?: { current: unknown };
      onFocus?: () => void;
      onBlur?: () => void;
    }) => {
      React.useEffect(() => {
        if (props.editorRef) {
          props.editorRef.current = {
            get document() {
              return blockEditorHarness.document;
            },
            focus: blockEditorHarness.focus,
            domElement: null,
          };
        }
        blockEditorHarness.onFocus = props.onFocus;
        blockEditorHarness.onBlur = props.onBlur;
        return () => {
          if (props.editorRef) {
            props.editorRef.current = null;
          }
          blockEditorHarness.onFocus = undefined;
          blockEditorHarness.onBlur = undefined;
        };
      }, [props.editorRef]);

      return React.createElement('div', {
        tabIndex: 0,
        'data-testid': 'mock-block-editor',
        onFocus: props.onFocus,
        onBlur: props.onBlur,
      });
    },
  };
});

const EMPTY_BODY = JSON.stringify([{ type: 'paragraph', content: [] }]);
const FILLED_BODY = JSON.stringify([
  { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
]);

const waitForFrames = async (count = 3) => {
  for (let index = 0; index < count; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

describe('NoteSection', () => {
  let container: HTMLDivElement;
  let root: Root;

  const renderNoteSection = (props: {
    body: string | null;
    focusRequestId?: number;
    onOpenStateChange?: (isOpen: boolean) => void;
    onBodyChange?: (hasContent: boolean) => void;
    onEditModeChange?: (editing: boolean) => void;
  }) => {
    flushSync(() => {
      root.render(
        createElement(NoteSection, {
          taskId: 'task-1',
          body: props.body,
          focusRequestId: props.focusRequestId,
          onOpenStateChange: props.onOpenStateChange,
          onBodyChange: props.onBodyChange,
          onEditModeChange: props.onEditModeChange,
        }),
      );
    });
  };

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(0), 0) as unknown as number,
    );
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    blockEditorHarness.document = [];
    blockEditorHarness.focus.mockClear();
    autoSaveHarness.flushSave.mockClear();
  });

  afterEach(() => {
    root.unmount();
    document.body.removeChild(container);
    vi.unstubAllGlobals();
  });

  it('opens and focuses when focusRequestId changes from closed state', async () => {
    const onOpenStateChange = vi.fn();

    blockEditorHarness.document = JSON.parse(EMPTY_BODY) as unknown[];
    renderNoteSection({ body: null, focusRequestId: 0, onOpenStateChange });
    expect(container.querySelector('[data-note-section="true"]')).toBeNull();

    renderNoteSection({ body: null, focusRequestId: 1, onOpenStateChange });
    await waitForFrames();

    expect(container.querySelector('[data-note-section="true"]')).not.toBeNull();
    expect(onOpenStateChange).toHaveBeenCalledWith(true);
    expect(blockEditorHarness.focus).toHaveBeenCalledTimes(1);
  });

  it('re-focuses when focusRequestId changes while already open', async () => {
    blockEditorHarness.document = JSON.parse(FILLED_BODY) as unknown[];
    renderNoteSection({ body: FILLED_BODY, focusRequestId: 0 });
    expect(container.querySelector('[data-note-section="true"]')).not.toBeNull();

    renderNoteSection({ body: FILLED_BODY, focusRequestId: 1 });
    await waitForFrames();
    renderNoteSection({ body: FILLED_BODY, focusRequestId: 2 });
    await waitForFrames();

    expect(blockEditorHarness.focus).toHaveBeenCalledTimes(2);
  });

  it('collapses when empty note loses focus', async () => {
    const onOpenStateChange = vi.fn();

    blockEditorHarness.document = JSON.parse(EMPTY_BODY) as unknown[];
    renderNoteSection({ body: null, focusRequestId: 0, onOpenStateChange });
    renderNoteSection({ body: null, focusRequestId: 1, onOpenStateChange });
    await waitForFrames();

    expect(blockEditorHarness.onBlur).toBeTypeOf('function');
    blockEditorHarness.onBlur?.();
    await waitForFrames();

    expect(container.querySelector('[data-note-section="true"]')).toBeNull();
    expect(onOpenStateChange).toHaveBeenCalledWith(false);
  });

  it('collapses on outside pointerdown when empty', async () => {
    const onOpenStateChange = vi.fn();

    blockEditorHarness.document = JSON.parse(EMPTY_BODY) as unknown[];
    renderNoteSection({ body: null, focusRequestId: 0, onOpenStateChange });
    renderNoteSection({ body: null, focusRequestId: 1, onOpenStateChange });
    await waitForFrames();

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await waitForFrames();

    expect(container.querySelector('[data-note-section="true"]')).toBeNull();
    expect(onOpenStateChange).toHaveBeenCalledWith(false);
  });

  it('does not collapse on outside pointerdown when note has content', async () => {
    const onOpenStateChange = vi.fn();

    blockEditorHarness.document = JSON.parse(FILLED_BODY) as unknown[];
    renderNoteSection({ body: FILLED_BODY, focusRequestId: 0, onOpenStateChange });
    await waitForFrames(1);

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await waitForFrames();

    expect(container.querySelector('[data-note-section="true"]')).not.toBeNull();
    expect(onOpenStateChange).not.toHaveBeenCalledWith(false);
  });
});
