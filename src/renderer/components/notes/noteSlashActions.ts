import type { BlockNoteEditor } from '@blocknote/core';

type BlockLike = {
  id: string;
};

type CursorPositionLike = {
  block: BlockLike;
};

type TaskTitleEditor = Pick<
  BlockNoteEditor,
  'getSelectedText' | 'getTextCursorPosition' | 'blocksToMarkdownLossy' | 'document'
> & {
  document: BlockLike[];
  getTextCursorPosition: () => CursorPositionLike;
  blocksToMarkdownLossy: (blocks: BlockLike[]) => string;
};

const MARKDOWN_PREFIX_PATTERN =
  /^(?:-\s*\[[ xX]\]\s+|\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+|#{1,6}\s+)/;
const SLASH_COMMAND_PATTERN = /^\/(?:task|process)\b[:\s-]*/i;
const GENERIC_SLASH_PATTERN = /^\/\w+\b[:\s-]*/;

export const normalizeTaskTitle = (raw: string): string =>
  raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(' ')
    .replace(SLASH_COMMAND_PATTERN, '')
    .replace(GENERIC_SLASH_PATTERN, '')
    .replace(MARKDOWN_PREFIX_PATTERN, '')
    .replace(/\s+/g, ' ')
    .trim();

const markdownFromBlock = (editor: TaskTitleEditor, block: BlockLike): string => {
  try {
    return editor.blocksToMarkdownLossy([block]).trim();
  } catch {
    return '';
  }
};

const findCurrentBlockIndex = (documentBlocks: BlockLike[], blockId: string): number =>
  documentBlocks.findIndex((block) => block.id === blockId);

const findPreviousNonEmptyBlockTitle = (
  editor: TaskTitleEditor,
  documentBlocks: BlockLike[],
  currentIndex: number,
): string => {
  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const candidate = normalizeTaskTitle(markdownFromBlock(editor, documentBlocks[index]));
    if (candidate.length > 0) {
      return candidate;
    }
  }
  return '';
};

export const resolveTaskTitleFromEditor = (editor: TaskTitleEditor): string => {
  const selected = normalizeTaskTitle(editor.getSelectedText());
  if (selected.length > 0) {
    return selected;
  }

  const currentBlock = editor.getTextCursorPosition().block;
  const fromCurrent = normalizeTaskTitle(markdownFromBlock(editor, currentBlock));
  if (fromCurrent.length > 0) {
    return fromCurrent;
  }

  const documentBlocks = Array.isArray(editor.document) ? editor.document : [];
  if (documentBlocks.length === 0) {
    return '';
  }

  const currentIndex = findCurrentBlockIndex(documentBlocks, currentBlock.id);
  if (currentIndex !== -1) {
    return findPreviousNonEmptyBlockTitle(editor, documentBlocks, currentIndex);
  }

  // Fallback: if cursor block cannot be found in the top-level document,
  // still scan from the end for a usable title.
  return findPreviousNonEmptyBlockTitle(editor, documentBlocks, documentBlocks.length);
};
