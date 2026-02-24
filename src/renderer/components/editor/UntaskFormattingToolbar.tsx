import { useEffect, useRef, useState } from 'react';

import { Bold, Check, Code, Italic, Link, Strikethrough } from 'lucide-react';

import {
  useBlockNoteEditor,
  useEditorState,
  useSelectedBlocks,
} from '@blocknote/react';

import { cn } from '../../lib/utils';
import { Input, Popover, PopoverContent } from '../ui';

const normalizeLinkUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const hasProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed);
  return hasProtocol ? trimmed : `https://${trimmed}`;
};

/**
 * Compact formatting toolbar matching Untask's industrial aesthetic.
 * Replaces BlockNote's default Mantine-based FormattingToolbar.
 *
 * Buttons: Bold | Italic | Strikethrough | Code | separator | Link
 */
export const UntaskFormattingToolbar = () => {
  const editor = useBlockNoteEditor();
  const blocks = useSelectedBlocks(editor);
  const [isLinkPopoverOpen, setIsLinkPopoverOpen] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const linkInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isLinkPopoverOpen) {
      return;
    }

    const frameId = requestAnimationFrame(() => {
      linkInputRef.current?.focus();
      linkInputRef.current?.select();
    });
    return () => cancelAnimationFrame(frameId);
  }, [isLinkPopoverOpen]);

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
  const buttonClassName =
    'size-7 flex items-center justify-center rounded-sm transition-colors duration-100';

  const buttons: Array<{
    key: string;
    icon: React.ReactNode;
    active: boolean;
    label: string;
    action: () => void;
  }> = [
    {
      key: 'bold',
      icon: <Bold size={ICON_SIZE} aria-hidden="true" />,
      active: activeStyles.bold,
      label: 'Bold',
      action: () => editor.toggleStyles({ bold: true }),
    },
    {
      key: 'italic',
      icon: <Italic size={ICON_SIZE} aria-hidden="true" />,
      active: activeStyles.italic,
      label: 'Italic',
      action: () => editor.toggleStyles({ italic: true }),
    },
    {
      key: 'strike',
      icon: <Strikethrough size={ICON_SIZE} aria-hidden="true" />,
      active: activeStyles.strike,
      label: 'Strikethrough',
      action: () => editor.toggleStyles({ strike: true }),
    },
    {
      key: 'code',
      icon: <Code size={ICON_SIZE} aria-hidden="true" />,
      active: activeStyles.code,
      label: 'Code',
      action: () => editor.toggleStyles({ code: true }),
    },
  ];

  return (
    <div className="untask-editor-toolbar flex items-center gap-0.5 rounded-md border border-border/60 bg-popover/95 p-0.5 backdrop-blur-sm">
      {buttons.map((btn) => (
        <button
          key={btn.key}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={btn.action}
          aria-label={btn.label}
          aria-pressed={btn.active}
          className={cn(
            buttonClassName,
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

      <Popover.Root open={isLinkPopoverOpen} onOpenChange={setIsLinkPopoverOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setIsLinkPopoverOpen(true)}
            aria-label="Link"
            className={cn(
              buttonClassName,
              'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <Link size={ICON_SIZE} aria-hidden="true" />
          </button>
        </Popover.Trigger>

        <PopoverContent
          align="end"
          sideOffset={6}
          className="w-72 border-border/60 bg-popover/95 p-2 backdrop-blur-sm"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <form
            className="flex items-center gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              const normalizedUrl = normalizeLinkUrl(linkInput);
              if (!normalizedUrl) {
                setIsLinkPopoverOpen(false);
                setLinkInput('');
                return;
              }

              editor.createLink(normalizedUrl);
              setIsLinkPopoverOpen(false);
              setLinkInput('');
            }}
          >
            <Input
              ref={linkInputRef}
              value={linkInput}
              onChange={(event) => setLinkInput(event.target.value)}
              placeholder="Paste or type URL"
              autoComplete="off"
              className="h-8 border-border/60 bg-background/60 px-2 text-[12px]"
            />
            <button
              type="submit"
              className="flex h-8 w-8 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Apply link"
            >
              <Check size={13} aria-hidden="true" />
            </button>
          </form>
        </PopoverContent>
      </Popover.Root>
    </div>
  );
};
