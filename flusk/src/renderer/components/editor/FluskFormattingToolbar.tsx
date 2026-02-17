import { Bold, Code, Italic, Link, Strikethrough } from 'lucide-react';

import {
  useBlockNoteEditor,
  useEditorState,
  useSelectedBlocks,
} from '@blocknote/react';

import { cn } from '../../lib/utils';

/**
 * Compact formatting toolbar matching Flusk's industrial aesthetic.
 * Replaces BlockNote's default Mantine-based FormattingToolbar.
 *
 * Buttons: Bold | Italic | Strikethrough | Code | separator | Link
 */
export const FluskFormattingToolbar = () => {
  const editor = useBlockNoteEditor();
  const blocks = useSelectedBlocks(editor);

  // Track which styles are currently active on the selection
  const activeStyles = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const styles = e.getActiveStyles();
      return {
        bold: styles.bold === true,
        italic: styles.italic === true,
        strike: styles.strike === true,
        code: styles.code === true,
      };
    },
    on: 'selection',
  });

  // Hide toolbar when selection is on blocks without inline content (images, etc.)
  const hasInlineContent = blocks.some(
    (block) => block.content !== undefined,
  );

  if (!hasInlineContent) {
    return null;
  }

  const ICON_SIZE = 14;

  const buttons: Array<{
    key: string;
    icon: React.ReactNode;
    active: boolean;
    label: string;
    action: () => void;
  }> = [
    {
      key: 'bold',
      icon: <Bold size={ICON_SIZE} />,
      active: activeStyles.bold,
      label: 'Bold',
      action: () => editor.toggleStyles({ bold: true }),
    },
    {
      key: 'italic',
      icon: <Italic size={ICON_SIZE} />,
      active: activeStyles.italic,
      label: 'Italic',
      action: () => editor.toggleStyles({ italic: true }),
    },
    {
      key: 'strike',
      icon: <Strikethrough size={ICON_SIZE} />,
      active: activeStyles.strike,
      label: 'Strikethrough',
      action: () => editor.toggleStyles({ strike: true }),
    },
    {
      key: 'code',
      icon: <Code size={ICON_SIZE} />,
      active: activeStyles.code,
      label: 'Code',
      action: () => editor.toggleStyles({ code: true }),
    },
  ];

  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-popover p-0.5">
      {buttons.map((btn) => (
        <button
          key={btn.key}
          type="button"
          onClick={btn.action}
          aria-label={btn.label}
          aria-pressed={btn.active}
          className={cn(
            'size-7 flex items-center justify-center rounded-sm transition-colors duration-100',
            btn.active
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
        >
          {btn.icon}
        </button>
      ))}

      {/* Separator */}
      <div className="h-4 w-px bg-border/40 mx-0.5" aria-hidden="true" />

      <button
        type="button"
        onClick={() => {
          const url = prompt('Enter URL');
          if (url) {
            editor.createLink(url);
          }
        }}
        aria-label="Link"
        className="size-7 flex items-center justify-center rounded-sm text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-foreground"
      >
        <Link size={ICON_SIZE} />
      </button>
    </div>
  );
};
