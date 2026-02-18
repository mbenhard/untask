import { useEffect, useRef } from 'react';
import { ExternalLink, FolderOpen, Trash2 } from 'lucide-react';
import { cn } from '../../lib/utils';

type FileContextMenuProps = {
  x: number;
  y: number;
  onOpen: () => void;
  onReveal: () => void;
  onDelete: () => void;
  onClose: () => void;
};

export const FileContextMenu = ({
  x,
  y,
  onOpen,
  onReveal,
  onDelete,
  onClose,
}: FileContextMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Adjust position so menu doesn't overflow viewport
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const el = menuRef.current;

    if (rect.right > window.innerWidth) {
      el.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
      el.style.top = `${y - rect.height}px`;
    }
  }, [x, y]);

  const itemClass = cn(
    'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs',
    'text-muted-foreground hover:bg-accent hover:text-foreground transition-colors duration-100',
  );

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[160px] rounded-md border border-border/60 bg-popover p-1 shadow-md"
      style={{ left: x, top: y }}
    >
      <button type="button" className={itemClass} onClick={onOpen}>
        <ExternalLink className="size-3.5" />
        <span>Open</span>
      </button>

      <button type="button" className={itemClass} onClick={onReveal}>
        <FolderOpen className="size-3.5" />
        <span>Show in Finder</span>
      </button>

      <div className="my-1 h-px bg-border/60" />

      <button
        type="button"
        className={cn(itemClass, 'hover:bg-destructive/10 hover:text-destructive')}
        onClick={onDelete}
      >
        <Trash2 className="size-3.5" />
        <span>Delete</span>
      </button>
    </div>
  );
};
