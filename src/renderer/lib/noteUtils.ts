// ─── Shared note utilities for the renderer process ────────

type BlockContent = { type?: string; text?: string };
type Block = {
  type?: string;
  content?: BlockContent[];
  children?: Block[];
};

const extractBlockText = (block: Block): string => {
  if (!block.content || !Array.isArray(block.content)) return '';
  return block.content
    .filter((c) => c.type === 'text' && c.text)
    .map((c) => c.text)
    .join('')
    .trim();
};

const AUTO_TITLE_MAX_LENGTH = 120;

/**
 * Derive an auto-title from note content when stored title is empty.
 * Returns the first non-empty text block's text, capped at 120 chars.
 * Handles both BlockNote JSON and legacy markdown content.
 */
export const deriveAutoTitle = (content: string): string => {
  if (!content.trim()) return '';

  try {
    const blocks = JSON.parse(content) as Block[];
    if (!Array.isArray(blocks)) return '';

    for (const block of blocks) {
      if (block.type === 'image' || block.type === 'file') continue;
      const text = extractBlockText(block);
      if (text) {
        return text.length > AUTO_TITLE_MAX_LENGTH
          ? text.slice(0, AUTO_TITLE_MAX_LENGTH) + '\u2026'
          : text;
      }
    }
    return '';
  } catch {
    const firstLine = content.split('\n').find((l) => l.trim());
    if (!firstLine) return '';
    const cleaned = firstLine.replace(/^#+\s*/, '').trim();
    return cleaned.length > AUTO_TITLE_MAX_LENGTH
      ? cleaned.slice(0, AUTO_TITLE_MAX_LENGTH) + '\u2026'
      : cleaned;
  }
};

/**
 * Get the display title for a note.
 * If stored title is empty, derive from content. Falls back to 'Empty note'.
 */
export const getDisplayTitle = (title: string, content: string): string => {
  if (title) return title;
  return deriveAutoTitle(content) || 'Empty note';
};

/**
 * Get the content preview line, skipping the first text block
 * if auto-title is active (to avoid duplicating the title in the preview).
 */
export const getContentPreview = (
  title: string,
  content: string,
): string => {
  if (!content.trim()) return 'Empty note';
  const isAutoTitle = !title;

  try {
    const blocks = JSON.parse(content) as Block[];
    if (!Array.isArray(blocks)) return 'Empty note';

    let skippedFirst = false;
    for (const block of blocks) {
      const isNonTextBlock = block.type === 'image' || block.type === 'file';
      if (isNonTextBlock) {
        // Non-text blocks can serve as preview when there's no text preview
        if (!isAutoTitle || skippedFirst) {
          return block.type === 'image' ? '[Image]' : '[File]';
        }
        continue;
      }

      const text = extractBlockText(block);
      if (!text) continue;

      // Skip the first text block if it was used for auto-title
      if (isAutoTitle && !skippedFirst) {
        skippedFirst = true;
        continue;
      }

      return text;
    }

    // If we only skipped non-text blocks and found nothing, check for non-text content
    if (!isAutoTitle) {
      for (const block of blocks) {
        if (block.type === 'image') return '[Image]';
        if (block.type === 'file') return '[File]';
      }
    }

    return isAutoTitle ? '' : 'Empty note';
  } catch {
    // Legacy markdown
    const lines = content.split('\n').filter((l) => l.trim());
    const start = isAutoTitle ? 1 : 0;
    return lines[start]?.replace(/^#+\s*/, '').trim() || '';
  }
};

/**
 * Regex pattern matching auto-generated date titles from old versions.
 * e.g. "Feb 20, 18:49"
 */
export const DATE_TITLE_PATTERN = /^[A-Z][a-z]{2} \d{1,2}, \d{2}:\d{2}$/;

/**
 * Check if a title looks like an old auto-generated date title.
 */
export const isDateBasedTitle = (title: string): boolean =>
  DATE_TITLE_PATTERN.test(title);
