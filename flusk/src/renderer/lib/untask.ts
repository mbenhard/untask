import type { FluskApi } from '../../types/preload';

export const getUntask = (): FluskApi => {
  if (!window.flusk) {
    throw new Error('Untask API not available');
  }

  return window.flusk;
};
