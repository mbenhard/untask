type BlockNoteInline = {
  type?: string;
  text?: string;
};

type BlockNoteBlock = {
  type?: string;
  content?: BlockNoteInline[];
  children?: BlockNoteBlock[];
};

const inlineHasText = (inline: unknown): boolean => {
  if (!inline || typeof inline !== 'object') return false;
  const candidate = inline as BlockNoteInline;
  return candidate.type === 'text'
    ? typeof candidate.text === 'string' && candidate.text.trim().length > 0
    : typeof candidate.text === 'string' && candidate.text.trim().length > 0;
};

const blockHasText = (block: BlockNoteBlock): boolean => {
  if (Array.isArray(block.content) && block.content.some(inlineHasText)) {
    return true;
  }

  if (Array.isArray(block.children) && block.children.some(blockHasText)) {
    return true;
  }

  return false;
};

export const hasNoteContent = (body: string | null | undefined): boolean => {
  if (!body || !body.trim()) return false;

  try {
    const blocks = JSON.parse(body) as BlockNoteBlock[];
    if (!Array.isArray(blocks) || blocks.length === 0) return false;
    return blocks.some(blockHasText);
  } catch {
    return false;
  }
};
