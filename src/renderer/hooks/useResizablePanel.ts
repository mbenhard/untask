import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

type UseResizablePanelOptions = {
  panelRef: RefObject<HTMLElement | null>;
  storageKey: string;
  minWidth: number;
  maxWidth: number;
  viewportPadding: number;
};

type HandleProps = {
  onPointerDown: (e: React.PointerEvent) => void;
  onDoubleClick: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  role: string;
  'aria-label': string;
  'aria-orientation': 'vertical';
  'aria-valuenow': number | undefined;
  'aria-valuemin': number;
  'aria-valuemax': number;
  tabIndex: number;
};

type UseResizablePanelReturn = {
  width: number | null;
  isResizing: boolean;
  isResizingRef: RefObject<boolean>;
  handleProps: HandleProps;
};

const STEP = 20;

export function useResizablePanel({
  panelRef,
  storageKey,
  minWidth,
  maxWidth,
  viewportPadding,
}: UseResizablePanelOptions): UseResizablePanelReturn {
  const [width, setWidth] = useState<number | null>(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored === null) return null;
    const parsed = Number(stored);
    return Number.isFinite(parsed) ? parsed : null;
  });

  const [isResizing, setIsResizing] = useState(false);
  const isResizingRef = useRef(false);
  const currentWidthRef = useRef(width);

  // Keep ref in sync with state
  useEffect(() => {
    currentWidthRef.current = width;
  }, [width]);

  const clampWidth = useCallback(
    (value: number) => {
      const maxAllowed = Math.min(maxWidth, window.innerWidth - viewportPadding);
      return Math.round(Math.max(minWidth, Math.min(maxAllowed, value)));
    },
    [minWidth, maxWidth, viewportPadding],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startWidth =
        currentWidthRef.current ?? panelRef.current?.offsetWidth ?? 400;

      isResizingRef.current = true;
      setIsResizing(true);
      document.body.classList.add('cursor-col-resize');

      const onPointerMove = (moveEvent: PointerEvent): void => {
        const delta = startX - moveEvent.clientX;
        const newWidth = clampWidth(startWidth + delta);
        currentWidthRef.current = newWidth;
        if (panelRef.current) {
          panelRef.current.style.width = `${newWidth}px`;
        }
      };

      const onPointerUp = (): void => {
        isResizingRef.current = false;
        setIsResizing(false);
        document.body.classList.remove('cursor-col-resize');
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);

        const finalWidth = currentWidthRef.current;
        setWidth(finalWidth);
        if (finalWidth !== null) {
          localStorage.setItem(storageKey, String(finalWidth));
        }
      };

      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
    },
    [panelRef, storageKey, clampWidth],
  );

  const onDoubleClick = useCallback(() => {
    setWidth(null);
    currentWidthRef.current = null;
    localStorage.removeItem(storageKey);
  }, [storageKey]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const current =
          currentWidthRef.current ?? panelRef.current?.offsetWidth ?? 400;
        const delta = e.key === 'ArrowLeft' ? STEP : -STEP;
        const newWidth = clampWidth(current + delta);
        setWidth(newWidth);
        currentWidthRef.current = newWidth;
        localStorage.setItem(storageKey, String(newWidth));
      }
      if (e.key === 'Home') {
        e.preventDefault();
        onDoubleClick();
      }
    },
    [panelRef, storageKey, clampWidth, onDoubleClick],
  );

  // Clamp width when viewport shrinks
  useEffect(() => {
    const onResize = (): void => {
      if (currentWidthRef.current === null) return;
      const clamped = clampWidth(currentWidthRef.current);
      if (clamped !== currentWidthRef.current) {
        setWidth(clamped);
        currentWidthRef.current = clamped;
        localStorage.setItem(storageKey, String(clamped));
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [storageKey, clampWidth]);

  const handleProps: HandleProps = {
    onPointerDown,
    onDoubleClick,
    onKeyDown,
    role: 'separator',
    'aria-label': 'Resize chat panel',
    'aria-orientation': 'vertical',
    'aria-valuenow': width ?? undefined,
    'aria-valuemin': minWidth,
    'aria-valuemax': maxWidth,
    tabIndex: 0,
  };

  return { width, isResizing, isResizingRef, handleProps };
}
