import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { cn } from '../../lib/utils';

type ProviderContext = { delayDuration: number };
const ProviderCtx = createContext<ProviderContext>({ delayDuration: 75 });

function TooltipProvider({
  delayDuration = 75,
  children,
}: {
  delayDuration?: number;
  children: ReactNode;
}) {
  return (
    <ProviderCtx.Provider value={{ delayDuration }}>
      {children}
    </ProviderCtx.Provider>
  );
}

type TooltipContext = {
  open: boolean;
  setOpen: (v: boolean) => void;
  x: number;
  y: number;
  updatePos: (x: number, y: number) => void;
};

const TooltipCtx = createContext<TooltipContext>({
  open: false,
  setOpen: () => {},
  x: 0,
  y: 0,
  updatePos: () => {},
});

function Tooltip({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const updatePos = useCallback((x: number, y: number) => {
    setPos({ x, y });
  }, []);

  return (
    <TooltipCtx.Provider
      value={{ open, setOpen, x: pos.x, y: pos.y, updatePos }}
    >
      {children}
    </TooltipCtx.Provider>
  );
}

function TooltipTrigger({
  asChild,
  children,
}: {
  asChild?: boolean;
  children: ReactNode;
}) {
  const { delayDuration } = useContext(ProviderCtx);
  const { setOpen, updatePos } = useContext(TooltipCtx);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      updatePos(e.clientX, e.clientY);
      if (timerRef.current == null) {
        timerRef.current = setTimeout(() => {
          setOpen(true);
        }, delayDuration);
      }
    },
    [delayDuration, setOpen, updatePos],
  );

  const onMouseLeave = useCallback(() => {
    clearTimer();
    setOpen(false);
  }, [clearTimer, setOpen]);

  const onPointerDown = useCallback(() => {
    clearTimer();
    setOpen(false);
  }, [clearTimer, setOpen]);

  const handlers = { onMouseMove, onMouseLeave, onPointerDown };

  if (asChild) {
    // Wrap the single child with a span that captures mouse events
    return (
      <span className="contents" {...handlers}>
        {children}
      </span>
    );
  }

  return <span {...handlers}>{children}</span>;
}

const PAD = 6;

function TooltipContent({
  children,
  className,
  side: _side,
  sideOffset: _sideOffset,
}: {
  children: ReactNode;
  className?: string;
  side?: string;
  sideOffset?: number;
}) {
  const { open, x, y } = useContext(TooltipCtx);
  const ref = useRef<HTMLDivElement>(null);

  // Position directly on the DOM to avoid state-driven re-render loops
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    let left = x;
    let top = y + 16;

    const rect = el.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    // Clamp to right edge
    if (left + w > window.innerWidth - PAD) {
      left = window.innerWidth - PAD - w;
    }
    // Clamp to left edge
    if (left < PAD) {
      left = PAD;
    }
    // Flip above cursor if clipping bottom
    if (top + h > window.innerHeight - PAD) {
      top = y - h - 8;
    }

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  });

  if (!open) return null;

  return createPortal(
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: x,
        top: y + 16,
        pointerEvents: 'none',
      }}
      className={cn(
        'z-50 whitespace-nowrap rounded bg-popover px-2 py-0.5 text-[10px] text-popover-foreground shadow-md animate-in fade-in-0',
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
