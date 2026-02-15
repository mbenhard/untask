import { defineConfig } from 'vite';
import { viteAliases } from './vite.aliases';

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: viteAliases,
  },
});
