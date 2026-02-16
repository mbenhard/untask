import type { FluskApi } from '../../types/preload';

export const getFlusk = (): FluskApi => {
  if (!window.flusk) {
    throw new Error('Flusk API not available');
  }

  return window.flusk;
};
