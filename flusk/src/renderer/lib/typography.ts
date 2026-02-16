export type SansFontId = 'geist' | 'inter' | 'ibm-plex-sans';
export type MonoFontId = 'geist-mono' | 'jetbrains-mono' | 'ibm-plex-mono';
export type TypographyPresetId = 'balanced' | 'classic' | 'plex';

type SansFontOption = {
  id: SansFontId;
  label: string;
  stack: string;
};

type MonoFontOption = {
  id: MonoFontId;
  label: string;
  stack: string;
};

export type TypographySelection = {
  sansId: SansFontId;
  monoId: MonoFontId;
};

export const UI_FONT_SANS_SETTING_KEY = 'ui_font_sans';
export const UI_FONT_MONO_SETTING_KEY = 'ui_font_mono';

export const UI_FONT_SANS_STORAGE_KEY = 'flusk-ui-font-sans';
export const UI_FONT_MONO_STORAGE_KEY = 'flusk-ui-font-mono';

export const DEFAULT_SANS_FONT_ID: SansFontId = 'geist';
export const DEFAULT_MONO_FONT_ID: MonoFontId = 'geist-mono';

const SANS_FONT_CATALOG: Record<SansFontId, SansFontOption> = {
  geist: {
    id: 'geist',
    label: 'Geist',
    stack:
      '"Geist", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  inter: {
    id: 'inter',
    label: 'Inter',
    stack:
      '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  'ibm-plex-sans': {
    id: 'ibm-plex-sans',
    label: 'IBM Plex Sans',
    stack:
      '"IBM Plex Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
};

const MONO_FONT_CATALOG: Record<MonoFontId, MonoFontOption> = {
  'geist-mono': {
    id: 'geist-mono',
    label: 'Geist Mono',
    stack: '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  'jetbrains-mono': {
    id: 'jetbrains-mono',
    label: 'JetBrains Mono',
    stack: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  'ibm-plex-mono': {
    id: 'ibm-plex-mono',
    label: 'IBM Plex Mono',
    stack: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  },
};

export const SANS_FONT_OPTIONS: ReadonlyArray<SansFontOption> = Object.values(
  SANS_FONT_CATALOG,
);
export const MONO_FONT_OPTIONS: ReadonlyArray<MonoFontOption> = Object.values(
  MONO_FONT_CATALOG,
);

export const TYPOGRAPHY_PRESET_OPTIONS: ReadonlyArray<{
  id: TypographyPresetId;
  label: string;
}> = [
  { id: 'balanced', label: 'Balanced' },
  { id: 'classic', label: 'Classic' },
  { id: 'plex', label: 'Plex' },
];

const TYPOGRAPHY_PRESETS: Record<TypographyPresetId, TypographySelection> = {
  balanced: { sansId: 'geist', monoId: 'geist-mono' },
  classic: { sansId: 'inter', monoId: 'jetbrains-mono' },
  plex: { sansId: 'ibm-plex-sans', monoId: 'ibm-plex-mono' },
};

const hasOwnKey = <T extends object>(value: T, key: PropertyKey): key is keyof T =>
  Object.prototype.hasOwnProperty.call(value, key);

export const isSansFontId = (value: string): value is SansFontId =>
  hasOwnKey(SANS_FONT_CATALOG, value);

export const isMonoFontId = (value: string): value is MonoFontId =>
  hasOwnKey(MONO_FONT_CATALOG, value);

export const parseSansFontId = (value: string | null | undefined): SansFontId | null => {
  if (!value) {
    return null;
  }

  return isSansFontId(value) ? value : null;
};

export const parseMonoFontId = (value: string | null | undefined): MonoFontId | null => {
  if (!value) {
    return null;
  }

  return isMonoFontId(value) ? value : null;
};

export const resolveTypographySelection = (input: {
  sansId?: string | null;
  monoId?: string | null;
}): TypographySelection => ({
  sansId: parseSansFontId(input.sansId) ?? DEFAULT_SANS_FONT_ID,
  monoId: parseMonoFontId(input.monoId) ?? DEFAULT_MONO_FONT_ID,
});

export const getTypographySelectionFromPreset = (
  presetId: TypographyPresetId,
): TypographySelection => ({
  ...TYPOGRAPHY_PRESETS[presetId],
});

export const getSansFontLabel = (fontId: SansFontId): string =>
  SANS_FONT_CATALOG[fontId].label;

export const getMonoFontLabel = (fontId: MonoFontId): string =>
  MONO_FONT_CATALOG[fontId].label;

export const getSansFontStack = (fontId: SansFontId): string =>
  SANS_FONT_CATALOG[fontId].stack;

export const getMonoFontStack = (fontId: MonoFontId): string =>
  MONO_FONT_CATALOG[fontId].stack;
