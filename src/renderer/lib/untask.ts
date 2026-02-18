import type { UntaskApi } from '../../types/preload';

export const getUntask = (): UntaskApi => {
  if (!window.untask) {
    throw new Error('Untask API not available');
  }

  return window.untask;
};
