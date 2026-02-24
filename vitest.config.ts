import { defineConfig } from 'vitest/config';
import { viteAliases } from './vite.aliases';

export default defineConfig({
  resolve: {
    alias: viteAliases,
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
