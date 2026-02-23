import type { Block, PartialBlock } from '@blocknote/core';

/**
 * Detect whether a stored string is BlockNote JSON (array of block objects)
 * vs plain markdown/text.
 */
export const isBlockNoteJson = (content: string): boolean => {
  if (!content.trim()) {
    return false;
  }

  try {
    const parsed = JSON.parse(content) as Array<{ type?: string }>;
    return Array.isArray(parsed) && (parsed.length === 0 || parsed[0]?.type !== undefined);
  } catch {
    return false;
  }
};

/**
 * Parse a stored JSON string into BlockNote PartialBlock[].
 * Returns null if the string is empty or not valid JSON array.
 */
export const parseStoredBlocks = (content: string): PartialBlock[] | null => {
  if (!content.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(content) as PartialBlock[];
    if (!Array.isArray(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
};

export type InitialEditorContent = {
  initialBlocks?: PartialBlock[];
  legacyMarkdown: string | null;
};

/**
 * Resolve persisted content into editor initialization data.
 * JSON content is passed as initial blocks; non-JSON content is treated as legacy markdown.
 */
export const resolveInitialEditorContent = (content: string): InitialEditorContent => {
  const trimmed = content.trim();
  if (!trimmed) {
    return { initialBlocks: undefined, legacyMarkdown: null };
  }

  if (!isBlockNoteJson(content)) {
    return { initialBlocks: undefined, legacyMarkdown: content };
  }

  const blocks = parseStoredBlocks(content);
  return {
    initialBlocks: blocks ?? undefined,
    legacyMarkdown: null,
  };
};

/**
 * Check whether a JSON blocks string represents an empty document
 * (only empty paragraph blocks with no text content).
 */
export const isEmptyDocument = (json: string): boolean => {
  if (!json.trim()) {
    return true;
  }

  try {
    const blocks = JSON.parse(json) as Block[];
    if (!Array.isArray(blocks)) {
      return true;
    }

    return blocks.every(
      (block) =>
        block.type === 'paragraph' &&
        (!block.content || (Array.isArray(block.content) && block.content.length === 0)),
    );
  } catch {
    return true;
  }
};
