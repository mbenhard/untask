import { useEffect, useRef, useState } from 'react';

import type { BlockNoteEditor } from '@blocknote/core';
import { LinkToolbarExtension, TableHandlesExtension } from '@blocknote/core/extensions';
import {
  ArrowDown,
  ArrowUp,
  Bold,
  CheckSquare,
  Code,
  Copy,
  ExternalLink,
  FileText,
  FolderOpen,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Minus,
  Quote,
  SquarePen,
  Strikethrough,
  Table2,
  Trash2,
  Unlink,
} from 'lucide-react';

import { cn } from '../../lib/utils';
import { isSafeExternalHttpUrl } from './linkBehavior';
import { Input } from '../ui';

export type EditorContextMenuMode = 'off' | 'notes_contextual';
export type NativeContextFallbackModifier = 'shift';
export type ContextMenuNativeFallbackEvent = Pick<MouseEvent, 'shiftKey'>;

type BlockShape = {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: BlockShape[];
};
type BlockContentShape = Record<string, unknown> & {
  headerRows?: number;
  headerCols?: number;
};

export type EditorContextMenuTarget =
  | {
    kind: 'file';
    blockId: string;
    attachmentId: string;
  }
  | {
    kind: 'link';
    href: string;
    text: string;
    rangeFrom: number | null;
  }
  | {
    kind: 'text_selection';
    selectedText: string;
    selectedLinkUrl: string | null;
  }
  | {
    kind: 'block';
    blockId: string;
    blockType: string;
  }
  | {
    kind: 'table';
    blockId: string;
    rowIndex: number;
    colIndex: number;
  };

export type TurnIntoBlockType =
  | 'paragraph'
  | 'heading_1'
  | 'heading_2'
  | 'heading_3'
  | 'bullet_list'
  | 'numbered_list'
  | 'check_list'
  | 'quote'
  | 'code_block'
  | 'divider';

export type EditorContextAction =
  | { id: 'turn_into'; value: TurnIntoBlockType }
  | { id: 'duplicate_block' }
  | { id: 'delete_block' }
  | { id: 'move_block_up' }
  | { id: 'move_block_down' }
  | { id: 'text_bold' }
  | { id: 'text_italic' }
  | { id: 'text_strike' }
  | { id: 'text_code' }
  | { id: 'text_clear' }
  | { id: 'text_add_link'; url: string }
  | { id: 'link_open' }
  | { id: 'link_copy' }
  | { id: 'link_remove' }
  | { id: 'link_edit'; url: string; text: string }
  | { id: 'file_open' }
  | { id: 'file_reveal' }
  | { id: 'file_delete' }
  | { id: 'table_add_row' }
  | { id: 'table_remove_row' }
  | { id: 'table_add_col' }
  | { id: 'table_remove_col' }
  | { id: 'table_toggle_header_row' }
  | { id: 'table_toggle_header_col' };

type ContextActionDependencies = {
  openExternal: (href: string) => Promise<void> | void;
  copyText: (value: string) => Promise<void> | void;
  openAttachment: (id: string) => void;
  revealAttachment: (id: string) => void;
};

const toPartialBlock = (block: BlockShape): Record<string, unknown> => ({
  type: block.type,
  props: JSON.parse(JSON.stringify(block.props ?? {})),
  content: block.content === undefined ? undefined : JSON.parse(JSON.stringify(block.content)),
  children: block.children?.map(toPartialBlock),
});

const resolveTableIndices = (editor: BlockNoteEditor): { rowIndex: number; colIndex: number } => {
  const tableHandles = editor.getExtension(TableHandlesExtension);
  const state = tableHandles?.store?.state;
  const selection = tableHandles?.getCellSelection?.();

  const rowIndex =
    typeof state?.rowIndex === 'number'
      ? state.rowIndex
      : (selection?.from.row ?? 0);
  const colIndex =
    typeof state?.colIndex === 'number'
      ? state.colIndex
      : (selection?.from.col ?? 0);

  return { rowIndex, colIndex };
};

const resolveBlockFromDom = (
  editor: BlockNoteEditor,
  target: HTMLElement,
): { blockId: string; block: BlockShape } | null => {
  const blockEl = target.closest('[data-id]');
  if (!blockEl) {
    return null;
  }

  const blockId = blockEl.getAttribute('data-id');
  if (!blockId) {
    return null;
  }

  const block = editor.getBlock(blockId) as BlockShape | undefined;
  if (!block) {
    return null;
  }

  return { blockId, block };
};

export const resolveEditorContextTarget = (
  editor: BlockNoteEditor,
  target: HTMLElement,
  mode: EditorContextMenuMode,
): EditorContextMenuTarget | null => {
  const isFileArea = target.closest('.bn-file-name-with-icon, .bn-file-block-content-wrapper');
  if (isFileArea) {
    const resolvedBlock = resolveBlockFromDom(editor, target);
    if (resolvedBlock) {
      const url = (resolvedBlock.block.props as Record<string, unknown> | undefined)?.url;
      if (typeof url === 'string' && url.startsWith('untask-file://')) {
        return {
          kind: 'file',
          blockId: resolvedBlock.blockId,
          attachmentId: url.slice('untask-file://'.length),
        };
      }
    }
  }

  if (mode === 'off') {
    return null;
  }

  const anchor = target.closest<HTMLAnchorElement>('.bn-inline-content a[href]');
  if (anchor) {
    const href = anchor.getAttribute('href')?.trim() ?? '';
    if (href.length > 0) {
      const linkToolbar = editor.getExtension(LinkToolbarExtension);
      const linkAtElement = linkToolbar?.getLinkAtElement(anchor);
      return {
        kind: 'link',
        href,
        text: linkAtElement?.text ?? anchor.textContent ?? '',
        rangeFrom: linkAtElement?.range.from ?? null,
      };
    }
  }

  const selectedText = editor.getSelectedText().trim();
  if (!editor.prosemirrorState.selection.empty && selectedText.length > 0) {
    return {
      kind: 'text_selection',
      selectedText,
      selectedLinkUrl: editor.getSelectedLinkUrl() ?? null,
    };
  }

  const resolvedBlock = resolveBlockFromDom(editor, target);
  if (resolvedBlock) {
    return {
      kind: 'block',
      blockId: resolvedBlock.blockId,
      blockType: resolvedBlock.block.type,
    };
  }

  const isTableHandle = target.closest('.bn-table-handle, .bn-table-cell-handle, .bn-table-handle-menu');
  const tableHandles = editor.getExtension(TableHandlesExtension);
  if (isTableHandle && tableHandles?.store?.state?.block?.id) {
    const { rowIndex, colIndex } = resolveTableIndices(editor);
    return {
      kind: 'table',
      blockId: tableHandles.store.state.block.id,
      rowIndex,
      colIndex,
    };
  }

  return null;
};

export const shouldUseNativeContextMenu = (
  modifier: NativeContextFallbackModifier,
  event: ContextMenuNativeFallbackEvent,
): boolean => modifier === 'shift' && event.shiftKey;

const toTransformUpdate = (value: TurnIntoBlockType): Record<string, unknown> => {
  switch (value) {
    case 'heading_1':
      return { type: 'heading', props: { level: 1 } };
    case 'heading_2':
      return { type: 'heading', props: { level: 2 } };
    case 'heading_3':
      return { type: 'heading', props: { level: 3 } };
    case 'bullet_list':
      return { type: 'bulletListItem' };
    case 'numbered_list':
      return { type: 'numberedListItem' };
    case 'check_list':
      return { type: 'checkListItem' };
    case 'quote':
      return { type: 'quote' };
    case 'code_block':
      return { type: 'codeBlock' };
    case 'divider':
      return { type: 'divider' };
    case 'paragraph':
    default:
      return { type: 'paragraph' };
  }
};

const resolveTableContext = (
  editor: BlockNoteEditor,
  target: EditorContextMenuTarget,
): { blockId: string; rowIndex: number; colIndex: number } | null => {
  if (target.kind === 'table') {
    return {
      blockId: target.blockId,
      rowIndex: target.rowIndex,
      colIndex: target.colIndex,
    };
  }

  if (target.kind === 'block') {
    const block = editor.getBlock(target.blockId) as BlockShape | undefined;
    if (block?.type !== 'table') {
      return null;
    }
    const { rowIndex, colIndex } = resolveTableIndices(editor);
    return {
      blockId: target.blockId,
      rowIndex,
      colIndex,
    };
  }

  return null;
};

const defaultDependencies = (): ContextActionDependencies => ({
  openExternal: async (href) => {
    await window.untask?.shell.openExternal(href);
  },
  copyText: async (value) => {
    await navigator.clipboard.writeText(value);
  },
  openAttachment: (id) => {
    window.untask?.attachments.open({ id });
  },
  revealAttachment: (id) => {
    window.untask?.attachments.reveal({ id });
  },
});

export const executeEditorContextAction = async (
  editor: BlockNoteEditor,
  target: EditorContextMenuTarget,
  action: EditorContextAction,
  dependencies: Partial<ContextActionDependencies> = {},
): Promise<boolean> => {
  const deps = {
    ...defaultDependencies(),
    ...dependencies,
  };

  if (action.id === 'turn_into') {
    if (target.kind !== 'block') {
      return false;
    }
    editor.updateBlock(target.blockId, toTransformUpdate(action.value) as never);
    return true;
  }

  if (action.id === 'duplicate_block') {
    if (target.kind !== 'block') {
      return false;
    }
    const block = editor.getBlock(target.blockId) as BlockShape | undefined;
    if (!block) {
      return false;
    }
    editor.insertBlocks([toPartialBlock(block) as never], target.blockId, 'after');
    return true;
  }

  if (action.id === 'delete_block') {
    if (target.kind !== 'block' && target.kind !== 'file' && target.kind !== 'table') {
      return false;
    }
    editor.removeBlocks([target.blockId]);
    return true;
  }

  if (action.id === 'move_block_up' || action.id === 'move_block_down') {
    if (target.kind !== 'block') {
      return false;
    }
    editor.setTextCursorPosition(target.blockId, 'start');
    if (action.id === 'move_block_up') {
      editor.moveBlocksUp();
    } else {
      editor.moveBlocksDown();
    }
    return true;
  }

  if (action.id === 'text_bold') {
    editor.toggleStyles({ bold: true } as never);
    return true;
  }
  if (action.id === 'text_italic') {
    editor.toggleStyles({ italic: true } as never);
    return true;
  }
  if (action.id === 'text_strike') {
    editor.toggleStyles({ strike: true } as never);
    return true;
  }
  if (action.id === 'text_code') {
    editor.toggleStyles({ code: true } as never);
    return true;
  }
  if (action.id === 'text_clear') {
    const styles = editor.getActiveStyles() as Record<string, unknown>;
    const clearable = ['bold', 'italic', 'strike', 'code', 'underline', 'textColor', 'backgroundColor'];
    const stylesToRemove = clearable.reduce<Record<string, unknown>>((acc, key) => {
      if (styles[key] !== undefined) {
        acc[key] = styles[key] === false ? true : styles[key];
      }
      return acc;
    }, {});
    if (Object.keys(stylesToRemove).length > 0) {
      editor.removeStyles(stylesToRemove as never);
    }
    return true;
  }
  if (action.id === 'text_add_link') {
    editor.createLink(action.url);
    return true;
  }

  if (action.id === 'link_open') {
    const href = target.kind === 'link' ? target.href : target.kind === 'text_selection' ? target.selectedLinkUrl : null;
    if (!href || !isSafeExternalHttpUrl(href)) {
      return false;
    }
    await deps.openExternal(href);
    return true;
  }
  if (action.id === 'link_copy') {
    const href = target.kind === 'link' ? target.href : target.kind === 'text_selection' ? target.selectedLinkUrl : null;
    if (!href) {
      return false;
    }
    await deps.copyText(href);
    return true;
  }
  if (action.id === 'link_remove') {
    const linkToolbar = editor.getExtension(LinkToolbarExtension);
    if (!linkToolbar) {
      return false;
    }
    const position = target.kind === 'link' ? target.rangeFrom : null;
    linkToolbar.deleteLink(position ?? undefined);
    return true;
  }
  if (action.id === 'link_edit') {
    const linkToolbar = editor.getExtension(LinkToolbarExtension);
    if (target.kind === 'text_selection') {
      editor.createLink(action.url, action.text);
      return true;
    }
    if (!linkToolbar || target.kind !== 'link') {
      return false;
    }
    linkToolbar.editLink(action.url, action.text, target.rangeFrom ?? undefined);
    return true;
  }

  if (action.id === 'file_open') {
    if (target.kind !== 'file') {
      return false;
    }
    deps.openAttachment(target.attachmentId);
    return true;
  }
  if (action.id === 'file_reveal') {
    if (target.kind !== 'file') {
      return false;
    }
    deps.revealAttachment(target.attachmentId);
    return true;
  }
  if (action.id === 'file_delete') {
    if (target.kind !== 'file') {
      return false;
    }
    editor.removeBlocks([target.blockId]);
    return true;
  }

  const tableContext = resolveTableContext(editor, target);
  if (
    action.id === 'table_add_row'
    || action.id === 'table_remove_row'
    || action.id === 'table_add_col'
    || action.id === 'table_remove_col'
    || action.id === 'table_toggle_header_row'
    || action.id === 'table_toggle_header_col'
  ) {
    if (!tableContext) {
      return false;
    }

    const tableHandles = editor.getExtension(TableHandlesExtension);
    if (!tableHandles) {
      return false;
    }

    if (action.id === 'table_add_row') {
      tableHandles.addRowOrColumn(tableContext.rowIndex, { orientation: 'row', side: 'below' });
      return true;
    }
    if (action.id === 'table_remove_row') {
      tableHandles.removeRowOrColumn(tableContext.rowIndex, 'row');
      return true;
    }
    if (action.id === 'table_add_col') {
      tableHandles.addRowOrColumn(tableContext.colIndex, { orientation: 'column', side: 'right' });
      return true;
    }
    if (action.id === 'table_remove_col') {
      tableHandles.removeRowOrColumn(tableContext.colIndex, 'column');
      return true;
    }

    const block = editor.getBlock(tableContext.blockId) as BlockShape | undefined;
    if (!block || block.type !== 'table') {
      return false;
    }

    const content = (
      typeof block.content === 'object' && block.content !== null
        ? block.content
        : {}
    ) as BlockContentShape;
    if (action.id === 'table_toggle_header_row') {
      editor.updateBlock(tableContext.blockId, {
        content: {
          ...content,
          headerRows: content.headerRows ? undefined : 1,
        },
      } as never);
      return true;
    }

    editor.updateBlock(tableContext.blockId, {
      content: {
        ...content,
        headerCols: content.headerCols ? undefined : 1,
      },
    } as never);
    return true;
  }

  return false;
};

const normalizeLinkUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  const hasProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed);
  return hasProtocol ? trimmed : `https://${trimmed}`;
};

type EditorContextMenuProps = {
  editor: BlockNoteEditor;
  x: number;
  y: number;
  target: EditorContextMenuTarget;
  onClose: () => void;
};

const itemClass = 'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground';

export const EditorContextMenu = ({
  editor,
  x,
  y,
  target,
  onClose,
}: EditorContextMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const linkInputRef = useRef<HTMLInputElement | null>(null);
  const [showTurnIntoMenu, setShowTurnIntoMenu] = useState(false);
  const [showLinkEditor, setShowLinkEditor] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const [linkTextInput, setLinkTextInput] = useState('');

  useEffect(() => {
    const keyHandler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    const clickOutsideHandler = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('keydown', keyHandler);
    document.addEventListener('mousedown', clickOutsideHandler);
    return () => {
      document.removeEventListener('keydown', keyHandler);
      document.removeEventListener('mousedown', clickOutsideHandler);
    };
  }, [onClose]);

  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const el = menuRef.current;

    if (rect.right > window.innerWidth) {
      el.style.left = `${Math.max(8, x - rect.width)}px`;
    }
    if (rect.bottom > window.innerHeight) {
      el.style.top = `${Math.max(8, y - rect.height)}px`;
    }
  }, [x, y, showTurnIntoMenu, showLinkEditor, target.kind]);

  useEffect(() => {
    if (!showLinkEditor) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      linkInputRef.current?.focus();
      linkInputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [showLinkEditor]);

  const run = async (action: EditorContextAction) => {
    const handled = await executeEditorContextAction(editor, target, action);
    if (handled) {
      onClose();
    }
  };

  const openLinkEditor = () => {
    if (target.kind === 'link') {
      setLinkInput(target.href);
      setLinkTextInput(target.text || target.href);
    } else if (target.kind === 'text_selection') {
      setLinkInput(target.selectedLinkUrl ?? '');
      setLinkTextInput(target.selectedText);
    }
    setShowLinkEditor(true);
  };

  const isTableTarget = target.kind === 'table'
    || (target.kind === 'block' && target.blockType === 'table');
  const isTableBlockTarget = target.kind === 'block' && target.blockType === 'table';
  const showTurnInto = target.kind === 'block' && !isTableBlockTarget;
  const isBlockTarget = target.kind === 'block';
  const isTextTarget = target.kind === 'text_selection';
  const isLinkTarget = target.kind === 'link';
  const isFileTarget = target.kind === 'file';
  const hasPrimaryActionSection = isFileTarget || isLinkTarget || isTextTarget;
  const contextLinkUrl = target.kind === 'link'
    ? target.href
    : target.kind === 'text_selection'
      ? target.selectedLinkUrl
      : null;
  const canOpenContextLink = contextLinkUrl ? isSafeExternalHttpUrl(contextLinkUrl) : false;
  const disabledItemClass = 'cursor-not-allowed opacity-55 hover:bg-transparent hover:text-muted-foreground';

  return (
    <div
      ref={menuRef}
      className="untask-editor-context-menu fixed z-50 min-w-[220px] rounded-md border border-border/60 bg-popover/95 p-1 shadow-md backdrop-blur-sm"
      style={{ left: x, top: y }}
      onMouseDown={(event) => {
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {isFileTarget && (
        <>
          <button type="button" className={itemClass} onClick={() => void run({ id: 'file_open' })}>
            <ExternalLink className="size-3.5" />
            <span>Open</span>
          </button>
          <button type="button" className={itemClass} onClick={() => void run({ id: 'file_reveal' })}>
            <FolderOpen className="size-3.5" />
            <span>Show in Finder</span>
          </button>
          <div className="my-1 h-px bg-border/60" />
          <button
            type="button"
            className={cn(itemClass, 'hover:bg-destructive/10 hover:text-destructive')}
            onClick={() => void run({ id: 'file_delete' })}
          >
            <Trash2 className="size-3.5" />
            <span>Delete</span>
          </button>
        </>
      )}

      {isLinkTarget && (
        <>
          <button
            type="button"
            className={cn(itemClass, !canOpenContextLink && disabledItemClass)}
            onClick={() => void run({ id: 'link_open' })}
            disabled={!canOpenContextLink}
          >
            <ExternalLink className="size-3.5" />
            <span>Open Link</span>
          </button>
          <button type="button" className={itemClass} onClick={openLinkEditor}>
            <SquarePen className="size-3.5" />
            <span>Edit Link</span>
          </button>
          <button type="button" className={itemClass} onClick={() => void run({ id: 'link_copy' })}>
            <Copy className="size-3.5" />
            <span>Copy Link</span>
          </button>
          <button type="button" className={itemClass} onClick={() => void run({ id: 'link_remove' })}>
            <Unlink className="size-3.5" />
            <span>Remove Link</span>
          </button>
        </>
      )}

      {isTextTarget && (
        <>
          <button type="button" className={itemClass} onClick={() => void run({ id: 'text_bold' })}>
            <Bold className="size-3.5" />
            <span>Bold</span>
          </button>
          <button type="button" className={itemClass} onClick={() => void run({ id: 'text_italic' })}>
            <Italic className="size-3.5" />
            <span>Italic</span>
          </button>
          <button type="button" className={itemClass} onClick={() => void run({ id: 'text_strike' })}>
            <Strikethrough className="size-3.5" />
            <span>Strikethrough</span>
          </button>
          <button type="button" className={itemClass} onClick={() => void run({ id: 'text_code' })}>
            <Code className="size-3.5" />
            <span>Inline Code</span>
          </button>
          <button type="button" className={itemClass} onClick={openLinkEditor}>
            <SquarePen className="size-3.5" />
            <span>{target.selectedLinkUrl ? 'Edit Link' : 'Add Link'}</span>
          </button>
          {target.selectedLinkUrl && (
            <>
              <button
                type="button"
                className={cn(itemClass, !canOpenContextLink && disabledItemClass)}
                onClick={() => void run({ id: 'link_open' })}
                disabled={!canOpenContextLink}
              >
                <ExternalLink className="size-3.5" />
                <span>Open Link</span>
              </button>
              <button type="button" className={itemClass} onClick={() => void run({ id: 'link_copy' })}>
                <Copy className="size-3.5" />
                <span>Copy Link</span>
              </button>
              <button type="button" className={itemClass} onClick={() => void run({ id: 'link_remove' })}>
                <Unlink className="size-3.5" />
                <span>Remove Link</span>
              </button>
            </>
          )}
          <button type="button" className={itemClass} onClick={() => void run({ id: 'text_clear' })}>
            <Minus className="size-3.5" />
            <span>Clear Formatting</span>
          </button>
        </>
      )}

      {showLinkEditor && (
        <form
          className="mt-1 flex flex-col gap-1 border-t border-border/60 px-1 pt-2 pb-1"
          onSubmit={(event) => {
            event.preventDefault();
            const url = normalizeLinkUrl(linkInput);
            if (!url) {
              setShowLinkEditor(false);
              return;
            }
            if (target.kind === 'link') {
              void run({
                id: 'link_edit',
                url,
                text: linkTextInput.trim() || target.text || url,
              });
              return;
            }
            void run({
              id: 'text_add_link',
              url,
            });
          }}
        >
          <Input
            ref={linkInputRef}
            className="h-7 border-border/60 bg-background/60 px-2 text-[12px]"
            value={linkInput}
            onChange={(event) => setLinkInput(event.target.value)}
            placeholder="Paste or type URL"
            autoComplete="off"
          />
          {target.kind === 'link' && (
            <Input
              className="h-7 border-border/60 bg-background/60 px-2 text-[12px]"
              value={linkTextInput}
              onChange={(event) => setLinkTextInput(event.target.value)}
              placeholder="Link text"
              autoComplete="off"
            />
          )}
          <div className="flex gap-1">
            <button
              type="button"
              className="flex-1 rounded-sm px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => setShowLinkEditor(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 rounded-sm bg-accent px-2 py-1 text-[11px] text-foreground"
            >
              Apply
            </button>
          </div>
        </form>
      )}

      {(isBlockTarget || isTableTarget) && (
        <>
          {hasPrimaryActionSection && <div className="my-1 h-px bg-border/60" />}
          {isBlockTarget && (
            <>
              {showTurnInto && (
                <>
                  <button type="button" className={itemClass} onClick={() => setShowTurnIntoMenu((prev) => !prev)}>
                    <FileText className="size-3.5" />
                    <span>Turn Into</span>
                  </button>
                  {showTurnIntoMenu && (
                    <div className="mb-1 ml-1 rounded-sm border border-border/50 p-1">
                      <button type="button" className={itemClass} onClick={() => void run({ id: 'turn_into', value: 'paragraph' })}>
                        <FileText className="size-3.5" />
                        <span>Paragraph</span>
                      </button>
                      <button type="button" className={itemClass} onClick={() => void run({ id: 'turn_into', value: 'heading_1' })}>
                        <Heading1 className="size-3.5" />
                        <span>Heading 1</span>
                      </button>
                      <button type="button" className={itemClass} onClick={() => void run({ id: 'turn_into', value: 'heading_2' })}>
                        <Heading2 className="size-3.5" />
                        <span>Heading 2</span>
                      </button>
                      <button type="button" className={itemClass} onClick={() => void run({ id: 'turn_into', value: 'heading_3' })}>
                        <Heading3 className="size-3.5" />
                        <span>Heading 3</span>
                      </button>
                      <button type="button" className={itemClass} onClick={() => void run({ id: 'turn_into', value: 'bullet_list' })}>
                        <List className="size-3.5" />
                        <span>Bullet List</span>
                      </button>
                      <button type="button" className={itemClass} onClick={() => void run({ id: 'turn_into', value: 'numbered_list' })}>
                        <ListOrdered className="size-3.5" />
                        <span>Numbered List</span>
                      </button>
                      <button type="button" className={itemClass} onClick={() => void run({ id: 'turn_into', value: 'check_list' })}>
                        <CheckSquare className="size-3.5" />
                        <span>Checklist</span>
                      </button>
                      <button type="button" className={itemClass} onClick={() => void run({ id: 'turn_into', value: 'quote' })}>
                        <Quote className="size-3.5" />
                        <span>Quote</span>
                      </button>
                      <button type="button" className={itemClass} onClick={() => void run({ id: 'turn_into', value: 'code_block' })}>
                        <Code className="size-3.5" />
                        <span>Code Block</span>
                      </button>
                      <button type="button" className={itemClass} onClick={() => void run({ id: 'turn_into', value: 'divider' })}>
                        <Minus className="size-3.5" />
                        <span>Divider</span>
                      </button>
                    </div>
                  )}
                </>
              )}
              <button type="button" className={itemClass} onClick={() => void run({ id: 'move_block_up' })}>
                <ArrowUp className="size-3.5" />
                <span>Move Up</span>
              </button>
              <button type="button" className={itemClass} onClick={() => void run({ id: 'move_block_down' })}>
                <ArrowDown className="size-3.5" />
                <span>Move Down</span>
              </button>
              <button type="button" className={itemClass} onClick={() => void run({ id: 'duplicate_block' })}>
                <Copy className="size-3.5" />
                <span>Duplicate</span>
              </button>
            </>
          )}

          {isTableTarget && (
            <>
              <button type="button" className={itemClass} onClick={() => void run({ id: 'table_add_row' })}>
                <Table2 className="size-3.5" />
                <span>Add Row Below</span>
              </button>
              <button type="button" className={itemClass} onClick={() => void run({ id: 'table_remove_row' })}>
                <Table2 className="size-3.5" />
                <span>Remove Row</span>
              </button>
              <button type="button" className={itemClass} onClick={() => void run({ id: 'table_add_col' })}>
                <Table2 className="size-3.5" />
                <span>Add Column Right</span>
              </button>
              <button type="button" className={itemClass} onClick={() => void run({ id: 'table_remove_col' })}>
                <Table2 className="size-3.5" />
                <span>Remove Column</span>
              </button>
              <button type="button" className={itemClass} onClick={() => void run({ id: 'table_toggle_header_row' })}>
                <Table2 className="size-3.5" />
                <span>Toggle Header Row</span>
              </button>
              <button type="button" className={itemClass} onClick={() => void run({ id: 'table_toggle_header_col' })}>
                <Table2 className="size-3.5" />
                <span>Toggle Header Column</span>
              </button>
            </>
          )}

          <button
            type="button"
            className={cn(itemClass, 'hover:bg-destructive/10 hover:text-destructive')}
            onClick={() => void run({ id: 'delete_block' })}
          >
            <Trash2 className="size-3.5" />
            <span>Delete</span>
          </button>
        </>
      )}
    </div>
  );
};
