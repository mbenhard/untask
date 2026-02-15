import { defineConfig } from 'vite';
import { viteAliases } from './vite.aliases';

// https://vitejs.dev/config
export default defineConfig(async () => {
  const react = (await import('@vitejs/plugin-react-swc')).default;

  return {
    plugins: [react()],
    resolve: {
      alias: viteAliases,
    },
  };
});
