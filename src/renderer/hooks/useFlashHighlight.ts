import { useCallback, type RefObject } from 'react';

const FLASH_CLASS = 'field-changed-pulse';

/**
 * Returns a `flash()` function that adds a brief highlight animation
 * to the referenced element. Call it after a successful mutation to
 * give inline visual feedback without a toast.
 */
export const useFlashHighlight = (ref: RefObject<HTMLElement | null>) =>
  useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // Restart animation if already playing
    el.classList.remove(FLASH_CLASS);
    void el.offsetWidth; // force reflow
    el.classList.add(FLASH_CLASS);
    const onEnd = () => {
      el.classList.remove(FLASH_CLASS);
      el.removeEventListener('animationend', onEnd);
    };
    el.addEventListener('animationend', onEnd);
  }, [ref]);
