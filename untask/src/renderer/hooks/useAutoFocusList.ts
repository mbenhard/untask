import { useEffect } from 'react';

type UseAutoFocusListOptions<T> = {
  items: T[];
  selectedIndex: number;
  isPrimary?: boolean;
  getItemId: (item: T) => string;
  containerRef: React.RefObject<HTMLElement | null>;
  itemSelector: string;
};

export function useAutoFocusList<T>({
  items,
  selectedIndex,
  isPrimary = true,
  getItemId,
  containerRef,
  itemSelector,
}: UseAutoFocusListOptions<T>): void {
  useEffect(() => {
    if (!isPrimary || items.length === 0) return;
    const container = containerRef.current;
    if (!container) return;
    const firstItemId = getItemId(items[0]);
    const el = container.querySelector<HTMLElement>(`[${itemSelector}="${firstItemId}"]`);
    el?.focus();
  }, [isPrimary, items, getItemId, containerRef, itemSelector]);

  useEffect(() => {
    if (selectedIndex < 0 || selectedIndex >= items.length) return;
    const itemId = getItemId(items[selectedIndex]);
    const container = containerRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLElement>(`[${itemSelector}="${itemId}"]`);
    if (!el) return;
    if (el === document.activeElement || el.contains(document.activeElement)) return;
    el.focus();
  }, [selectedIndex, items, getItemId, containerRef, itemSelector]);
}
