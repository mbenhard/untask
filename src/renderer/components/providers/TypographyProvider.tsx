import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { getUntask } from '../../lib/untask';
import {
  type MonoFontId,
  type SansFontId,
  type TypographyPresetId,
  type TypographySelection,
  UI_FONT_MONO_SETTING_KEY,
  UI_FONT_MONO_STORAGE_KEY,
  UI_FONT_SANS_SETTING_KEY,
  UI_FONT_SANS_STORAGE_KEY,
  getMonoFontStack,
  getSansFontStack,
  getTypographySelectionFromPreset,
  resolveTypographySelection,
} from '../../lib/typography';

export type TypographyContextValue = {
  isReady: boolean;
  sansId: SansFontId;
  monoId: MonoFontId;
  error: string | null;
  setSans: (nextSansId: SansFontId) => Promise<void>;
  setMono: (nextMonoId: MonoFontId) => Promise<void>;
  applyPreset: (presetId: TypographyPresetId) => Promise<void>;
};

const TypographyContext = createContext<TypographyContextValue | undefined>(undefined);

const loadedSansFonts = new Set<SansFontId>(['geist']);
const loadedMonoFonts = new Set<MonoFontId>(['geist-mono']);

const sansFontLoaders: Record<SansFontId, () => Promise<unknown>> = {
  geist: async () => undefined,
  inter: async () =>
    Promise.all([
      import('@fontsource/inter/400.css'),
      import('@fontsource/inter/500.css'),
      import('@fontsource/inter/600.css'),
    ]),
  'ibm-plex-sans': async () =>
    Promise.all([
      import('@fontsource/ibm-plex-sans/400.css'),
      import('@fontsource/ibm-plex-sans/500.css'),
      import('@fontsource/ibm-plex-sans/600.css'),
    ]),
  'dm-sans': async () =>
    Promise.all([
      import('@fontsource/dm-sans/400.css'),
      import('@fontsource/dm-sans/500.css'),
      import('@fontsource/dm-sans/600.css'),
    ]),
  manrope: async () =>
    Promise.all([
      import('@fontsource/manrope/400.css'),
      import('@fontsource/manrope/500.css'),
      import('@fontsource/manrope/600.css'),
    ]),
};

const monoFontLoaders: Record<MonoFontId, () => Promise<unknown>> = {
  'geist-mono': async () => undefined,
  'jetbrains-mono': async () =>
    Promise.all([
      import('@fontsource/jetbrains-mono/400.css'),
      import('@fontsource/jetbrains-mono/500.css'),
    ]),
  'ibm-plex-mono': async () =>
    Promise.all([
      import('@fontsource/ibm-plex-mono/400.css'),
      import('@fontsource/ibm-plex-mono/500.css'),
    ]),
  'fira-code': async () =>
    Promise.all([
      import('@fontsource/fira-code/400.css'),
      import('@fontsource/fira-code/500.css'),
    ]),
};

const ensureTypographyAssetsLoaded = async (selection: TypographySelection): Promise<void> => {
  if (import.meta.env.MODE === 'test') {
    return;
  }

  if (!loadedSansFonts.has(selection.sansId)) {
    await sansFontLoaders[selection.sansId]();
    loadedSansFonts.add(selection.sansId);
  }

  if (!loadedMonoFonts.has(selection.monoId)) {
    await monoFontLoaders[selection.monoId]();
    loadedMonoFonts.add(selection.monoId);
  }
};

const toErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message.trim().length > 0 ? error.message : fallback;

const applyTypographySelection = (selection: TypographySelection): void => {
  const root = document.documentElement;
  root.style.setProperty('--ui-font-sans-stack', getSansFontStack(selection.sansId));
  root.style.setProperty('--ui-font-mono-stack', getMonoFontStack(selection.monoId));
};

const readTypographySelectionFromStorage = (): TypographySelection => {
  const sansId = localStorage.getItem(UI_FONT_SANS_STORAGE_KEY);
  const monoId = localStorage.getItem(UI_FONT_MONO_STORAGE_KEY);
  return resolveTypographySelection({ sansId, monoId });
};

const writeTypographySelectionToStorage = (selection: TypographySelection): void => {
  localStorage.setItem(UI_FONT_SANS_STORAGE_KEY, selection.sansId);
  localStorage.setItem(UI_FONT_MONO_STORAGE_KEY, selection.monoId);
};

export function TypographyProvider({ children }: { children: ReactNode }) {
  const initialSelection = useMemo(readTypographySelectionFromStorage, []);

  const [isReady, setIsReady] = useState(false);
  const [sansId, setSansIdState] = useState<SansFontId>(initialSelection.sansId);
  const [monoId, setMonoIdState] = useState<MonoFontId>(initialSelection.monoId);
  const [error, setError] = useState<string | null>(null);

  const sansIdRef = useRef(sansId);
  const monoIdRef = useRef(monoId);

  useEffect(() => {
    sansIdRef.current = sansId;
  }, [sansId]);

  useEffect(() => {
    monoIdRef.current = monoId;
  }, [monoId]);

  useLayoutEffect(() => {
    applyTypographySelection({ sansId, monoId });
  }, [sansId, monoId]);

  useEffect(() => {
    void ensureTypographyAssetsLoaded({ sansId, monoId });
  }, [sansId, monoId]);

  useEffect(() => {
    writeTypographySelectionToStorage({ sansId, monoId });
  }, [sansId, monoId]);

  useEffect(() => {
    let isActive = true;

    const loadCanonicalTypography = async (): Promise<void> => {
      try {
        const untask = getUntask();
        const [storedSansId, storedMonoId] = await Promise.all([
          untask.settings.get(UI_FONT_SANS_SETTING_KEY),
          untask.settings.get(UI_FONT_MONO_SETTING_KEY),
        ]);

        if (!isActive) {
          return;
        }

        const canonicalSelection = resolveTypographySelection({
          sansId: storedSansId,
          monoId: storedMonoId,
        });

        setSansIdState(canonicalSelection.sansId);
        setMonoIdState(canonicalSelection.monoId);
        setError(null);
      } catch (loadError) {
        if (!isActive) {
          return;
        }

        setError(toErrorMessage(loadError, 'Failed to load typography settings.'));
      } finally {
        if (isActive) {
          setIsReady(true);
        }
      }
    };

    void loadCanonicalTypography();

    return () => {
      isActive = false;
    };
  }, []);

  const setSans = useCallback(async (nextSansId: SansFontId): Promise<void> => {
    const previousSansId = sansIdRef.current;
    if (previousSansId === nextSansId) {
      return;
    }

    setSansIdState(nextSansId);
    setError(null);

    try {
      await getUntask().settings.set(UI_FONT_SANS_SETTING_KEY, nextSansId);
      writeTypographySelectionToStorage({
        sansId: nextSansId,
        monoId: monoIdRef.current,
      });
    } catch (saveError) {
      setSansIdState(previousSansId);
      const message = toErrorMessage(saveError, 'Failed to save body font.');
      setError(message);
      throw saveError instanceof Error ? saveError : new Error(message);
    }
  }, []);

  const setMono = useCallback(async (nextMonoId: MonoFontId): Promise<void> => {
    const previousMonoId = monoIdRef.current;
    if (previousMonoId === nextMonoId) {
      return;
    }

    setMonoIdState(nextMonoId);
    setError(null);

    try {
      await getUntask().settings.set(UI_FONT_MONO_SETTING_KEY, nextMonoId);
      writeTypographySelectionToStorage({
        sansId: sansIdRef.current,
        monoId: nextMonoId,
      });
    } catch (saveError) {
      setMonoIdState(previousMonoId);
      const message = toErrorMessage(saveError, 'Failed to save mono font.');
      setError(message);
      throw saveError instanceof Error ? saveError : new Error(message);
    }
  }, []);

  const applyPreset = useCallback(async (presetId: TypographyPresetId): Promise<void> => {
    const nextSelection = getTypographySelectionFromPreset(presetId);
    const previousSelection = {
      sansId: sansIdRef.current,
      monoId: monoIdRef.current,
    };
    const hasNoChanges =
      previousSelection.sansId === nextSelection.sansId &&
      previousSelection.monoId === nextSelection.monoId;

    if (hasNoChanges) {
      return;
    }

    setSansIdState(nextSelection.sansId);
    setMonoIdState(nextSelection.monoId);
    setError(null);

    let hasSyncedFromDb = false;

    try {
      const untask = getUntask();
      const [sansSaveResult, monoSaveResult] = await Promise.allSettled([
        untask.settings.set(UI_FONT_SANS_SETTING_KEY, nextSelection.sansId),
        untask.settings.set(UI_FONT_MONO_SETTING_KEY, nextSelection.monoId),
      ]);

      if (sansSaveResult.status === 'fulfilled' && monoSaveResult.status === 'fulfilled') {
        writeTypographySelectionToStorage(nextSelection);
        return;
      }

      const [storedSansId, storedMonoId] = await Promise.all([
        untask.settings.get(UI_FONT_SANS_SETTING_KEY),
        untask.settings.get(UI_FONT_MONO_SETTING_KEY),
      ]);
      const syncedSelection = resolveTypographySelection({
        sansId: storedSansId,
        monoId: storedMonoId,
      });
      hasSyncedFromDb = true;

      setSansIdState(syncedSelection.sansId);
      setMonoIdState(syncedSelection.monoId);
      writeTypographySelectionToStorage(syncedSelection);

      const partialSaveError = new Error('Failed to save one or more typography preset values.');
      setError(partialSaveError.message);
      throw partialSaveError;
    } catch (saveError) {
      if (!hasSyncedFromDb) {
        setSansIdState(previousSelection.sansId);
        setMonoIdState(previousSelection.monoId);
        writeTypographySelectionToStorage(previousSelection);
      }

      const message = toErrorMessage(saveError, 'Failed to save typography preset.');
      setError(message);
      throw saveError instanceof Error ? saveError : new Error(message);
    }
  }, []);

  const value: TypographyContextValue = useMemo(
    () => ({
      isReady,
      sansId,
      monoId,
      error,
      setSans,
      setMono,
      applyPreset,
    }),
    [isReady, sansId, monoId, error, setSans, setMono, applyPreset],
  );

  return <TypographyContext.Provider value={value}>{children}</TypographyContext.Provider>;
}

export function useTypography(): TypographyContextValue {
  const context = useContext(TypographyContext);
  if (!context) {
    throw new Error('useTypography must be used within a TypographyProvider');
  }

  return context;
}
