import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MONO_FONT_ID,
  DEFAULT_SANS_FONT_ID,
  getTypographySelectionFromPreset,
  parseMonoFontId,
  parseSansFontId,
  resolveTypographySelection,
} from './typography';

describe('typography', () => {
  it('parses known font ids and rejects unknown ids', () => {
    expect(parseSansFontId('geist')).toBe('geist');
    expect(parseSansFontId('inter')).toBe('inter');
    expect(parseSansFontId('not-a-font')).toBeNull();

    expect(parseMonoFontId('geist-mono')).toBe('geist-mono');
    expect(parseMonoFontId('jetbrains-mono')).toBe('jetbrains-mono');
    expect(parseMonoFontId('not-a-font')).toBeNull();
  });

  it('falls back to defaults when stored values are invalid or missing', () => {
    expect(
      resolveTypographySelection({
        sansId: undefined,
        monoId: undefined,
      }),
    ).toEqual({
      sansId: DEFAULT_SANS_FONT_ID,
      monoId: DEFAULT_MONO_FONT_ID,
    });

    expect(
      resolveTypographySelection({
        sansId: 'bad-sans',
        monoId: 'bad-mono',
      }),
    ).toEqual({
      sansId: DEFAULT_SANS_FONT_ID,
      monoId: DEFAULT_MONO_FONT_ID,
    });
  });

  it('returns curated preset pairings', () => {
    expect(getTypographySelectionFromPreset('balanced')).toEqual({
      sansId: 'geist',
      monoId: 'geist-mono',
    });
    expect(getTypographySelectionFromPreset('warm')).toEqual({
      sansId: 'dm-sans',
      monoId: 'ibm-plex-mono',
    });
    expect(getTypographySelectionFromPreset('focus')).toEqual({
      sansId: 'manrope',
      monoId: 'fira-code',
    });
  });
});
