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
        output: {
          manualChunks: (id: string) => {
            if (!id.includes('/node_modules/')) {
              return undefined;
            }

            // Keep editor runtime dependencies isolated into stable cacheable chunks.
            if (id.includes('/node_modules/@blocknote/core/')) {
              return 'editor-bn-core';
            }
            if (id.includes('/node_modules/@blocknote/react/')) {
              return 'editor-bn-react';
            }
            if (id.includes('/node_modules/@blocknote/mantine/')) {
              return 'editor-bn-mantine';
            }
            if (id.includes('/node_modules/@blocknote/')) {
              return 'editor-bn-vendor';
            }
            if (id.includes('/node_modules/@tiptap/')) {
              return 'editor-tiptap';
            }
            if (id.includes('/node_modules/prosemirror-')) {
              return 'editor-prosemirror';
            }
            if (id.includes('/node_modules/@floating-ui/')) {
              return 'editor-floating';
            }
            if (
              id.includes('/node_modules/emoji-mart/')
              || id.includes('/node_modules/@emoji-mart/')
            ) {
              return 'editor-emoji';
            }

            return undefined;
          },
        },
      },
    },
  };
});
