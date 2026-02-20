import type { QuickAddApi } from '../preload/quickadd';

declare global {
  interface Window {
    quickAdd: QuickAddApi;
  }
}
