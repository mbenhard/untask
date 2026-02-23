import { defineConfig } from 'vite';
import { viteAliases } from './vite.aliases';
import { stripFontsourceWoffFallbacks } from './vite.stripWoffFallbackPlugin';

// https://vitejs.dev/config
export default defineConfig(async () => {
  const react = (await import('@vitejs/plugin-react-swc')).default;
  // eslint-disable-next-line import/no-unresolved
  const tailwind = (await import('@tailwindcss/vite')).default;

  return {
    plugins: [stripFontsourceWoffFallbacks(), react(), tailwind()],
    resolve: {
      alias: viteAliases,
    },
    build: {
      rollupOptions: {
        input: 'quick-add.html',
      },
    },
  };
});
