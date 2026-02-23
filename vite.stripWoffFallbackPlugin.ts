import type { Plugin } from 'vite';

const FONTSOURCE_PATH_SEGMENT = '/node_modules/@fontsource/';
const WOFF_FALLBACK_PATTERN =
  /,\s*url\([^)]+\.woff\)\s*format\((['"])woff\1\)/g;

/**
 * Electron targets modern Chromium, so we can safely drop legacy `.woff`
 * fallbacks from @fontsource CSS and keep only `.woff2`.
 */
export const stripFontsourceWoffFallbacks = (): Plugin => ({
  name: 'strip-fontsource-woff-fallbacks',
  enforce: 'pre',
  transform: (code, id) => {
    if (!id.includes(FONTSOURCE_PATH_SEGMENT)) {
      return null;
    }

    if (!code.includes('woff2') || !code.includes('woff')) {
      return null;
    }

    const transformed = code.replace(WOFF_FALLBACK_PATTERN, '');
    if (transformed === code) {
      return null;
    }

    return { code: transformed, map: null };
  },
});
