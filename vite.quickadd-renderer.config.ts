import { defineConfig } from 'vite';
import { viteAliases } from './vite.aliases';

// https://vitejs.dev/config
export default defineConfig(async () => {
  const react = (await import('@vitejs/plugin-react-swc')).default;
  // eslint-disable-next-line import/no-unresolved
  const tailwind = (await import('@tailwindcss/vite')).default;

  return {
    plugins: [react(), tailwind()],
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
