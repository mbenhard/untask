import { useCallback, useEffect, useState } from 'react';

import type { WindowDismissMode } from '../../../types/ipc';
import { getUntask } from '../../lib/untask';
import {
  MONO_FONT_OPTIONS,
  SANS_FONT_OPTIONS,
  TYPOGRAPHY_PRESET_OPTIONS,
  getMonoFontLabel,
  getSansFontLabel,
  getTypographySelectionFromPreset,
  parseMonoFontId,
  parseSansFontId,
  type TypographyPresetId,
} from '../../lib/typography';
import { useTypography } from '../providers/TypographyProvider';
import { SegmentedControl } from './SegmentedControl';
import { SettingsRow } from './SettingsRow';
import { SettingsSection } from './SettingsSection';
import { SettingsSelect } from './SettingsSelect';

type SettingsGeneralProps = {
  setError: (error: string | null) => void;
  setNotice: (notice: string | null) => void;
};

export const SettingsGeneral = ({ setError, setNotice }: SettingsGeneralProps) => {
  const typography = useTypography();

  const [launchAtLoginEnabled, setLaunchAtLoginEnabled] = useState(false);
  const [launchAtLoginApplied, setLaunchAtLoginApplied] = useState(false);
  const [launchAtLoginError, setLaunchAtLoginError] = useState<string | null>(null);
  const [isLoadingLaunchAtLogin, setIsLoadingLaunchAtLogin] = useState(false);
  const [isSavingLaunchAtLogin, setIsSavingLaunchAtLogin] = useState(false);
  const [windowDismissMode, setWindowDismissModeState] = useState<WindowDismissMode>('persistent');
  const [isLoadingWindowDismissMode, setIsLoadingWindowDismissMode] = useState(false);
  const [isSavingWindowDismissMode, setIsSavingWindowDismissMode] = useState(false);
  const [isSavingTypography, setIsSavingTypography] = useState(false);

  const loadLaunchAtLogin = useCallback(async () => {
    try {
      setIsLoadingLaunchAtLogin(true);
      setLaunchAtLoginError(null);
      const result = await getUntask().app.getLaunchAtLogin();
      setLaunchAtLoginEnabled(result.enabled);
      setLaunchAtLoginApplied(result.applied);
      if (result.error) {
        setLaunchAtLoginError(result.error);
      }
    } catch (loadError) {
      setLaunchAtLoginError(
        loadError instanceof Error ? loadError.message : 'Failed to load launch-at-login settings.',
      );
    } finally {
      setIsLoadingLaunchAtLogin(false);
    }
  }, []);

  const loadWindowDismissMode = useCallback(async () => {
    try {
      setIsLoadingWindowDismissMode(true);
      setError(null);
      const result = await getUntask().app.getWindowDismissMode();
      setWindowDismissModeState(result.mode);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'Failed to load window behavior setting.',
      );
    } finally {
      setIsLoadingWindowDismissMode(false);
    }
  }, [setError]);

  useEffect(() => {
    void loadLaunchAtLogin();
    void loadWindowDismissMode();
  }, [loadLaunchAtLogin, loadWindowDismissMode]);

  const handleLaunchAtLoginChange = useCallback(
    async (value: 'on' | 'off') => {
      const nextEnabled = value === 'on';
      const previousEnabled = launchAtLoginEnabled;

      setLaunchAtLoginEnabled(nextEnabled);
      setNotice(null);
      setLaunchAtLoginError(null);

      try {
        setIsSavingLaunchAtLogin(true);
        const result = await getUntask().app.setLaunchAtLogin(nextEnabled);
        setLaunchAtLoginEnabled(result.enabled);
        setLaunchAtLoginApplied(result.applied);
        if (result.error) {
          setLaunchAtLoginError(result.error);
          setNotice('Preference saved, but this runtime could not apply it.');
          return;
        }

        setNotice(result.enabled ? 'Launch at login enabled.' : 'Launch at login disabled.');
      } catch (saveError) {
        setLaunchAtLoginEnabled(previousEnabled);
        setLaunchAtLoginError(
          saveError instanceof Error ? saveError.message : 'Failed to update launch-at-login setting.',
        );
      } finally {
        setIsSavingLaunchAtLogin(false);
      }
    },
    [launchAtLoginEnabled, setNotice],
  );

  const handleWindowDismissModeChange = useCallback(
    async (mode: WindowDismissMode) => {
      const previousMode = windowDismissMode;
      setWindowDismissModeState(mode);
      setNotice(null);
      setError(null);

      try {
        setIsSavingWindowDismissMode(true);
        const result = await getUntask().app.setWindowDismissMode(mode);
        setWindowDismissModeState(result.mode);
        setNotice(
          result.mode === 'persistent'
            ? 'Window dismiss mode set to Persistent.'
            : 'Window dismiss mode set to Quick-hide.',
        );
      } catch (saveError) {
        setWindowDismissModeState(previousMode);
        setError(
          saveError instanceof Error ? saveError.message : 'Failed to update window behavior setting.',
        );
      } finally {
        setIsSavingWindowDismissMode(false);
      }
    },
    [windowDismissMode, setError, setNotice],
  );

  const handleSansFontChange = useCallback(
    async (value: string) => {
      const nextSansId = parseSansFontId(value);
      if (!nextSansId) {
        setError('Invalid body font selection.');
        return;
      }

      try {
        setIsSavingTypography(true);
        setNotice(null);
        setError(null);
        await typography.setSans(nextSansId);
        setNotice(`Body font set to ${getSansFontLabel(nextSansId)}.`);
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : 'Failed to update body font.');
      } finally {
        setIsSavingTypography(false);
      }
    },
    [typography, setError, setNotice],
  );

  const handleMonoFontChange = useCallback(
    async (value: string) => {
      const nextMonoId = parseMonoFontId(value);
      if (!nextMonoId) {
        setError('Invalid mono font selection.');
        return;
      }

      try {
        setIsSavingTypography(true);
        setNotice(null);
        setError(null);
        await typography.setMono(nextMonoId);
        setNotice(`Mono font set to ${getMonoFontLabel(nextMonoId)}.`);
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : 'Failed to update mono font.');
      } finally {
        setIsSavingTypography(false);
      }
    },
    [typography, setError, setNotice],
  );

  const handleTypographyPresetChange = useCallback(
    async (presetId: TypographyPresetId) => {
      const presetLabel =
        TYPOGRAPHY_PRESET_OPTIONS.find((option) => option.id === presetId)?.label ?? presetId;

      try {
        setIsSavingTypography(true);
        setNotice(null);
        setError(null);
        await typography.applyPreset(presetId);
        setNotice(`Typography preset set to ${presetLabel}.`);
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : 'Failed to update typography preset.');
      } finally {
        setIsSavingTypography(false);
      }
    },
    [typography, setError, setNotice],
  );

  const launchHint = isLoadingLaunchAtLogin
    ? 'Checking availability...'
    : launchAtLoginApplied
      ? 'Supported in this runtime.'
      : 'Not supported in this runtime (preference is still saved).';

  return (
    <div role="tabpanel" id="settings-panel-general" className="space-y-3">
      <SettingsSection title="Startup">
        <SettingsRow
          label="Launch at login"
          hint={launchAtLoginError ?? launchHint}
          loading={isLoadingLaunchAtLogin}
        >
          <SegmentedControl
            options={[
              { value: 'on' as const, label: 'On' },
              { value: 'off' as const, label: 'Off' },
            ]}
            value={launchAtLoginEnabled ? 'on' : 'off'}
            onChange={(v) => void handleLaunchAtLoginChange(v as 'on' | 'off')}
            disabled={isSavingLaunchAtLogin}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Window">
        <SettingsRow
          label="Dismiss mode"
          hint={
            windowDismissMode === 'persistent'
              ? 'Stay visible when focus changes.'
              : 'Hide when window loses focus.'
          }
          loading={isLoadingWindowDismissMode}
        >
          <SegmentedControl
            options={[
              { value: 'persistent' as const, label: 'Persistent' },
              { value: 'quick-hide' as const, label: 'Quick-hide' },
            ]}
            value={windowDismissMode}
            onChange={(v) => void handleWindowDismissModeChange(v as WindowDismissMode)}
            disabled={isSavingWindowDismissMode}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Typography">
        {!typography.isReady ? (
          <SettingsRow label="Typography settings" loading />
        ) : (
          <>
            <SettingsRow label="Body font">
              <SettingsSelect
                options={SANS_FONT_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
                value={typography.sansId}
                onChange={(v) => void handleSansFontChange(v)}
                disabled={isSavingTypography}
                aria-label="Body font"
              />
            </SettingsRow>
            <SettingsRow label="Mono font">
              <SettingsSelect
                options={MONO_FONT_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
                value={typography.monoId}
                onChange={(v) => void handleMonoFontChange(v)}
                disabled={isSavingTypography}
                aria-label="Mono font"
              />
            </SettingsRow>
            <SettingsRow label="Preset">
              <SegmentedControl
                options={TYPOGRAPHY_PRESET_OPTIONS.map((p) => ({ value: p.id, label: p.label }))}
                value={
                  TYPOGRAPHY_PRESET_OPTIONS.find((p) => {
                    const sel = getTypographySelectionFromPreset(p.id);
                    return sel.sansId === typography.sansId && sel.monoId === typography.monoId;
                  })?.id ?? ''
                }
                onChange={(v) => void handleTypographyPresetChange(v as TypographyPresetId)}
                disabled={isSavingTypography}
              />
            </SettingsRow>


          </>
        )}

        {typography.error ? (
          <p className="py-2 text-[11px] text-destructive">{typography.error}</p>
        ) : null}
      </SettingsSection>
      <SettingsSection title="Setup">
        <SettingsRow
          label="Restart onboarding"
          hint="Re-run the initial setup flow."
        >
          <button
            type="button"
            className="rounded-md border border-border/60 px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
            onClick={() => {
              void getUntask()
                .settings.set('app.bootstrap_completed', 'false')
                .then(() => window.location.reload());
            }}
          >
            Reset
          </button>
        </SettingsRow>
      </SettingsSection>
    </div>
  );
};
