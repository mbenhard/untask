import { defineConfig } from 'vite';
import { viteAliases } from './vite.aliases';

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: viteAliases,
  },
  build: {
    rollupOptions: {
      // Keep native and heavy server-side deps external for Electron main-process runtime resolution.
      // This avoids bundling optional transitive modules (e.g. linkedom -> canvas).
      external: ['better-sqlite3', 'linkedom', 'canvas'],
    },
  },
});
