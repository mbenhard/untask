import { describe, expect, it } from 'vitest';

import { normalizeTaskTitle, resolveTaskTitleFromEditor } from './noteSlashActions';

type MockBlock = { id: string };

const createMockEditor = (input: {
  selectedText?: string;
  blocks: MockBlock[];
  cursorIndex: number;
  markdownById: Record<string, string>;
}) => ({
  getSelectedText: () => input.selectedText ?? '',
  getTextCursorPosition: () => ({ block: input.blocks[input.cursorIndex] }),
  blocksToMarkdownLossy: (blocks: MockBlock[]) =>
    blocks.map((block) => input.markdownById[block.id] ?? '').join('\n'),
  document: input.blocks,
});

describe('noteSlashActions', () => {
  it('normalizes markdown and slash-command prefixes from task titles', () => {
    expect(normalizeTaskTitle('/task - [ ] Follow up with Client A')).toBe('Follow up with Client A');
    expect(normalizeTaskTitle('## Ship milestone notes')).toBe('Ship milestone notes');
    expect(normalizeTaskTitle('1.   Send invoice')).toBe('Send invoice');
  });

  it('prefers selected text when resolving task title', () => {
    const editor = createMockEditor({
      selectedText: '  /task Prepare kickoff recap  ',
      blocks: [{ id: 'a' }, { id: 'b' }],
      cursorIndex: 1,
      markdownById: {
        a: '- older block',
        b: '',
      },
    });

    expect(resolveTaskTitleFromEditor(editor as never)).toBe('Prepare kickoff recap');
  });

  it('falls back to previous non-empty block when current block is empty', () => {
    const editor = createMockEditor({
      blocks: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      cursorIndex: 2,
      markdownById: {
        a: '',
        b: '- [ ] Draft summary email',
        c: '',
      },
    });

    expect(resolveTaskTitleFromEditor(editor as never)).toBe('Draft summary email');
  });

  it('returns empty string when no resolvable title exists', () => {
    const editor = createMockEditor({
      blocks: [{ id: 'a' }, { id: 'b' }],
      cursorIndex: 1,
      markdownById: {
        a: '',
        b: '/task',
      },
    });

    expect(resolveTaskTitleFromEditor(editor as never)).toBe('');
  });
});
