import { useCallback, useEffect, useState } from 'react';

import {
  AlertTriangle,
  FileText,
  Image as ImageIcon,
  FileCode,
  Package,
  Paperclip,
  Plus,
  MoreHorizontal,
  FolderOpen,
  ExternalLink,
  Trash2,
} from 'lucide-react';

import type { AttachmentRecord } from '../../../types/ipc';
import { cn } from '../../lib/utils';
import { Popover, PopoverContent } from '../ui';

// ─── File type icons ─────────────────────────────────────────

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico']);
const PDF_EXTS = new Set(['.pdf']);
const CODE_EXTS = new Set(['.js', '.ts', '.jsx', '.tsx', '.py', '.rb', '.go', '.rs', '.c', '.cpp', '.h', '.java', '.kt', '.swift', '.sh', '.bash', '.zsh', '.css', '.scss', '.html', '.xml', '.json', '.yaml', '.yml', '.toml', '.md', '.sql']);
const ARCHIVE_EXTS = new Set(['.zip', '.gz', '.tar', '.7z', '.rar', '.bz2', '.xz', '.dmg', '.iso']);

function getFileIcon(filename: string) {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return ImageIcon;
  if (PDF_EXTS.has(ext)) return FileText;
  if (CODE_EXTS.has(ext)) return FileCode;
  if (ARCHIVE_EXTS.has(ext)) return Package;
  return Paperclip;
}

// ─── Helpers ─────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function deduplicateNames(attachments: AttachmentRecord[]): Map<string, string> {
  const nameCount = new Map<string, number>();
  const result = new Map<string, string>();

  for (const att of attachments) {
    const count = (nameCount.get(att.originalName) ?? 0) + 1;
    nameCount.set(att.originalName, count);

    if (count === 1) {
      result.set(att.id, att.originalName);
    } else {
      const dotIdx = att.originalName.lastIndexOf('.');
      if (dotIdx > 0) {
        const base = att.originalName.slice(0, dotIdx);
        const ext = att.originalName.slice(dotIdx);
        result.set(att.id, `${base} (${count})${ext}`);
      } else {
        result.set(att.id, `${att.originalName} (${count})`);
      }
    }
  }
  return result;
}

function truncateMiddle(name: string, maxLen = 40): string {
  if (name.length <= maxLen) return name;
  const dotIdx = name.lastIndexOf('.');
  const ext = dotIdx > 0 ? name.slice(dotIdx) : '';
  const base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
  const keep = maxLen - ext.length - 3; // 3 for "..."
  if (keep < 4) return name.slice(0, maxLen - 3) + '...';
  const front = Math.ceil(keep / 2);
  const back = Math.floor(keep / 2);
  return base.slice(0, front) + '...' + base.slice(-back) + ext;
}

// ─── Overflow Menu ───────────────────────────────────────────

const AttachmentOverflowMenu = ({
  attachment,
  onOpen,
  onReveal,
  onDelete,
}: {
  attachment: AttachmentRecord;
  onOpen: (storedName: string) => void;
  onReveal: (storedName: string) => void;
  onDelete: (id: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setConfirmDelete(false);
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="rounded-sm p-0.5 text-muted-foreground/60 opacity-0 transition-all hover:bg-accent hover:text-foreground group-hover/att-row:opacity-100"
          aria-label="Attachment actions"
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      </Popover.Trigger>
      <PopoverContent
        className="w-auto min-w-[120px] p-1"
        align="end"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => {
            onOpen(attachment.storedName);
            setOpen(false);
          }}
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ExternalLink className="size-3" />
          Open
        </button>
        <button
          type="button"
          onClick={() => {
            onReveal(attachment.storedName);
            setOpen(false);
          }}
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <FolderOpen className="size-3" />
          Show in Finder
        </button>
        <div className="my-1 h-px bg-border/40" />
        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-destructive transition-colors hover:bg-destructive/10"
          >
            <Trash2 className="size-3" />
            Delete
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              onDelete(attachment.id);
              setOpen(false);
              setConfirmDelete(false);
            }}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            <Trash2 className="size-3" />
            Confirm delete
          </button>
        )}
      </PopoverContent>
    </Popover.Root>
  );
};

// ─── Attachment Row ──────────────────────────────────────────

const AttachmentRow = ({
  attachment,
  displayName,
  isMissing,
  onOpen,
  onReveal,
  onDelete,
}: {
  attachment: AttachmentRecord;
  displayName: string;
  isMissing: boolean;
  onOpen: (storedName: string) => void;
  onReveal: (storedName: string) => void;
  onDelete: (id: string) => void;
}) => {
  const Icon = getFileIcon(attachment.originalName);
  const truncated = truncateMiddle(displayName);

  return (
    <div
      className={cn(
        'group/att-row flex items-center gap-2 rounded-sm px-2 py-1 text-[11px] font-mono transition-colors hover:bg-accent/40',
        isMissing && 'opacity-50',
      )}
    >
      {isMissing ? (
        <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />
      ) : (
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      )}
      <span
        className={cn(
          'min-w-0 flex-1 truncate',
          isMissing ? 'text-muted-foreground line-through' : 'text-foreground/80',
        )}
        title={displayName}
      >
        {truncated}
      </span>
      <span className="shrink-0 text-muted-foreground/60">
        {isMissing ? 'File missing' : formatFileSize(attachment.size)}
      </span>
      <AttachmentOverflowMenu
        attachment={attachment}
        onOpen={onOpen}
        onReveal={onReveal}
        onDelete={onDelete}
      />
    </div>
  );
};

// ─── Main Component ──────────────────────────────────────────

export type AttachmentListProps = {
  taskId: string;
  attachments: AttachmentRecord[];
  onAttachmentsChange: () => void;
};

export const AttachmentList = ({
  taskId,
  attachments,
  onAttachmentsChange,
}: AttachmentListProps) => {
  const [expanded, setExpanded] = useState(false);
  const [missingFiles, setMissingFiles] = useState<Set<string>>(new Set());

  const COLLAPSE_THRESHOLD = 5;
  const shouldCollapse = attachments.length > COLLAPSE_THRESHOLD;
  const visibleAttachments =
    shouldCollapse && !expanded
      ? attachments.slice(0, COLLAPSE_THRESHOLD)
      : attachments;
  const hiddenCount = attachments.length - COLLAPSE_THRESHOLD;

  const displayNames = deduplicateNames(attachments);

  // Check for missing files on mount and when attachments change
  useEffect(() => {
    const missing = new Set<string>();
    for (const att of attachments) {
      if (att.exists === false) {
        missing.add(att.id);
      }
    }
    setMissingFiles(missing);
  }, [attachments]);

  const handleAdd = useCallback(async () => {
    const result = await window.untask?.attachments.pickAndSaveForTask({
      taskId,
    });
    if (!result || result.canceled) return;
    onAttachmentsChange();
  }, [taskId, onAttachmentsChange]);

  const handleOpen = useCallback((storedName: string) => {
    void window.untask?.attachments.open({ id: storedName });
  }, []);

  const handleReveal = useCallback((storedName: string) => {
    void window.untask?.attachments.reveal({ id: storedName });
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      void window.untask?.attachments.deleteRecord({ id }).then(() => {
        onAttachmentsChange();
      });
    },
    [onAttachmentsChange],
  );

  if (attachments.length === 0) return null;

  return (
    <div className="border-t border-border/30 px-3 py-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
          Attachments ({attachments.length})
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void handleAdd();
          }}
          className="rounded-sm p-0.5 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Add attachment"
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      <div className="-mx-2">
        {visibleAttachments.map((att) => (
          <AttachmentRow
            key={att.id}
            attachment={att}
            displayName={displayNames.get(att.id) ?? att.originalName}
            isMissing={missingFiles.has(att.id)}
            onOpen={handleOpen}
            onReveal={handleReveal}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {shouldCollapse && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-1 text-[10px] font-mono text-muted-foreground/60 transition-colors hover:text-muted-foreground"
        >
          Show {hiddenCount} more
        </button>
      )}
    </div>
  );
};
