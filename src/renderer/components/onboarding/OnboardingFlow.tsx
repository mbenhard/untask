import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { motion, useReducedMotion } from 'framer-motion';

import {
  ONBOARDING_SCROLL_TRANSITION,
} from '../../lib/animation';
import { getUntask } from '../../lib/untask';
import { OnboardingBasics } from './OnboardingBasics';
import { OnboardingIdentity } from './OnboardingIdentity';
import { OnboardingNotifications } from './OnboardingNotifications';
import { OnboardingPreferences } from './OnboardingPreferences';
import { OnboardingProvider } from './OnboardingProvider';
import { OnboardingShortcuts } from './OnboardingShortcuts';
import { OnboardingWelcome } from './OnboardingWelcome';

type Role = 'freelancer' | 'developer' | 'student' | 'creative' | 'other';
type CommunicationStyle = 'direct' | 'friendly' | 'professional';

type StepKey =
  | 'welcome'
  | 'basics'
  | 'notifications'
  | 'provider'
  | 'identity'
  | 'shortcuts'
  | 'preferences';

export type OnboardingNavProps = {
  onBack: () => void;
  canGoBack: boolean;
  stepLabel: string;
};

const STEP_TITLES: Record<StepKey, string> = {
  welcome: 'WELCOME',
  basics: 'BASICS',
  notifications: 'NOTIFICATIONS',
  provider: 'PROVIDER',
  identity: 'IDENTITY',
  shortcuts: 'SHORTCUTS',
  preferences: 'PREFERENCES',
};

const ALL_STEPS: StepKey[] = [
  'welcome',
  'basics',
  'provider',
  'notifications',
  'identity',
  'shortcuts',
  'preferences',
];

const getVisibleSteps = (aiEnabled: boolean): StepKey[] => {
  if (aiEnabled) {
    return ALL_STEPS;
  }

  return ['welcome', 'basics', 'notifications', 'shortcuts', 'preferences'];
};

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'freelancer', label: 'Freelancer' },
  { value: 'developer', label: 'Developer' },
  { value: 'student', label: 'Student' },
  { value: 'creative', label: 'Creative' },
  { value: 'other', label: 'Other' },
];

const COMMUNICATION_OPTIONS: { value: CommunicationStyle; label: string }[] = [
  { value: 'direct', label: 'Direct & concise' },
  { value: 'friendly', label: 'Friendly & casual' },
  { value: 'professional', label: 'Professional' },
];

/** How many px of fade at each content edge in the thread mask. */
const THREAD_FADE = 48;

type OnboardingFlowProps = {
  onComplete: () => void;
  isTransitioningToApp?: boolean;
};

export const OnboardingFlow = ({ onComplete, isTransitioningToApp = false }: OnboardingFlowProps) => {
  const [currentStep, setCurrentStep] = useState<StepKey>('welcome');
  const [isFinishing, setIsFinishing] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  // Summary state captured across steps
  const [userName, setUserName] = useState('');
  const [aiEnabled, setAiEnabled] = useState(false);
  const visibleSteps = useMemo(() => getVisibleSteps(aiEnabled), [aiEnabled]);
  const currentIndex = visibleSteps.indexOf(currentStep);
  const safeIndex = Math.max(0, currentIndex);

  // Track which steps have been visited for one-shot stagger animation
  const [visitedSteps, setVisitedSteps] = useState<Set<StepKey>>(() => new Set(['welcome']));

  // Refs for measuring section/content positions (thread mask + scroll offset)
  const viewportRef = useRef<HTMLDivElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Map<StepKey, HTMLDivElement>>(new Map());
  const contentRefs = useRef<Map<StepKey, HTMLDivElement>>(new Map());

  // The computed translateY for the column (px value, negative to scroll down)
  const [scrollY, setScrollY] = useState(0);
  // The computed CSS mask for the thread line
  const [threadMask, setThreadMask] = useState<string>('linear-gradient(to bottom, transparent, transparent)');

  // Guard against stale step IDs when the visible step list changes.
  useEffect(() => {
    if (currentIndex !== -1) {
      return;
    }

    const fallback = visibleSteps[visibleSteps.length - 1] ?? 'welcome';
    setCurrentStep(fallback);
  }, [currentIndex, visibleSteps]);

  const goTo = (nextStep: StepKey) => {
    setCurrentStep(nextStep);
    setVisitedSteps((prev) => {
      const next = new Set(prev);
      next.add(nextStep);
      return next;
    });
  };

  const goNext = () => {
    if (currentIndex < 0 || currentIndex >= visibleSteps.length - 1) {
      return;
    }

    const next = visibleSteps[currentIndex + 1];
    if (next) {
      goTo(next);
    }
  };

  const goBack = () => {
    if (currentIndex <= 0) {
      return;
    }

    const previous = visibleSteps[currentIndex - 1];
    if (previous) {
      goTo(previous);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      if (event.key !== 'Escape') {
        return;
      }

      if (isTransitioningToApp) {
        return;
      }

      if (currentIndex <= 0) {
        return;
      }

      event.preventDefault();
      const previous = visibleSteps[currentIndex - 1];
      if (previous) {
        goTo(previous);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentIndex, isTransitioningToApp, visibleSteps]);

  // ── Compute scroll offset when the active step changes ──
  // Each section is min-h-full, so the offset is stepIndex * viewportHeight.
  // We measure the actual section positions for accuracy.
  const computeScrollOffset = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const viewportHeight = viewport.offsetHeight;
    // Each section is exactly viewportHeight tall (min-h-full on the section),
    // so the offset is simply the index * viewportHeight.
    const targetY = safeIndex * viewportHeight;
    setScrollY(-targetY);
  }, [safeIndex]);

  // ── Compute thread mask — mirrors website's computeThreadMask ──
  // The line is only visible in the gaps BETWEEN content blocks.
  // It does not appear above the first or below the last.
  const computeThreadMask = useCallback(() => {
    const column = columnRef.current;
    if (!column) return;

    const contentEls = Array.from(contentRefs.current.values());
    if (contentEls.length === 0) return;

    const totalH = column.scrollHeight;
    if (totalH <= 0) return;

    // Collect content zones relative to the column
    type Zone = { top: number; bottom: number };
    const zones: Zone[] = [];
    for (const el of contentEls) {
      // Walk up the offset chain to accumulate the full offset from the column
      // (offsetTop may be relative to an intermediate positioned parent).
      let top = 0;
      let node: HTMLElement | null = el;
      while (node && node !== column) {
        top += node.offsetTop;
        node = node.offsetParent as HTMLElement | null;
      }
      const bottom = top + el.offsetHeight;
      zones.push({ top, bottom });
    }
    zones.sort((a, b) => a.top - b.top);

    // Merge overlapping/adjacent zones
    const merged: Zone[] = [{ ...zones[0] }];
    for (let i = 1; i < zones.length; i++) {
      const prev = merged[merged.length - 1];
      if (zones[i].top <= prev.bottom) {
        prev.bottom = Math.max(prev.bottom, zones[i].bottom);
      } else {
        merged.push({ ...zones[i] });
      }
    }

    // Build mask: transparent everywhere, black only in gaps between blocks
    const stops: string[] = [];
    stops.push('transparent 0px');

    for (let i = 0; i < merged.length - 1; i++) {
      const gapStart = merged[i].bottom;
      const gapEnd = merged[i + 1].top;
      const gapSize = gapEnd - gapStart;
      const f = Math.min(THREAD_FADE, gapSize / 2);

      // Fade in from transparent after content bottom
      stops.push(`transparent ${gapStart}px`);
      stops.push(`black ${gapStart + f}px`);
      // Stay visible through the gap
      stops.push(`black ${gapEnd - f}px`);
      // Fade out to transparent before next content top
      stops.push(`transparent ${gapEnd}px`);
    }

    stops.push(`transparent ${totalH}px`);

    const mask = `linear-gradient(to bottom, ${stops.join(', ')})`;
    setThreadMask(mask);
  }, []);

  // Recompute on step change and on mount
  useLayoutEffect(() => {
    computeScrollOffset();
  }, [computeScrollOffset]);

  useLayoutEffect(() => {
    // Small delay to let DOM settle before measuring content positions
    const timer = setTimeout(computeThreadMask, 50);
    return () => clearTimeout(timer);
  }, [computeThreadMask, visibleSteps]);

  // Recompute on resize
  useEffect(() => {
    const handleResize = () => {
      computeScrollOffset();
      computeThreadMask();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [computeScrollOffset, computeThreadMask]);

  // Also recompute when layout might have changed (after renders)
  useEffect(() => {
    // Use ResizeObserver on the column to catch content size changes
    const column = columnRef.current;
    if (!column) return;

    const ro = new ResizeObserver(() => {
      computeScrollOffset();
      computeThreadMask();
    });
    ro.observe(column);
    return () => ro.disconnect();
  }, [computeScrollOffset, computeThreadMask]);

  // ── Step handlers (unchanged from original) ──

  const handleWelcomeNext = () => {
    goNext();
  };

  const handleBasicsNext = async (name: string, ai: boolean) => {
    setUserName(name);
    setAiEnabled(ai);

    try {
      if (name.length > 0) {
        await getUntask().settings.setUserName(name);
      }
      await getUntask().settings.setAiEnabled(ai);
    } catch {
      // Non-fatal — proceed anyway
    }

    // Use the updated visibleSteps based on the new ai value, not the stale closure.
    const nextSteps = getVisibleSteps(ai);
    const nextIndex = nextSteps.indexOf('basics') + 1;
    const next = nextSteps[nextIndex];
    if (next) {
      goTo(next);
    }
  };

  const handleNotificationsNext = () => {
    goNext();
  };

  const handleProviderNext = async (provider: string, keyOrUrl: string, modelId: string) => {
    try {
      if (provider === 'ollama') {
        await getUntask().settings.set('ai_ollama_base_url', keyOrUrl);
        await getUntask().settings.set('ai_provider', 'ollama');
      } else {
        await getUntask().apiKeys.set(provider, keyOrUrl);
        await getUntask().settings.set('ai_provider', provider);
      }
      await getUntask().chat.setSelectedModel({ modelId });
    } catch {
      // Non-fatal — proceed anyway
    }

    goNext();
  };

  const handleProviderSkip = () => {
    goNext();
  };

  const handleIdentityNext = async (
    identityString: string,
    roleValue: Role | null,
    styleValue: CommunicationStyle | null,
    focusValue: string,
  ) => {
    const roleLabel = roleValue
      ? ROLE_OPTIONS.find((o) => o.value === roleValue)?.label ?? null
      : null;
    const styleLabel = styleValue
      ? COMMUNICATION_OPTIONS.find((o) => o.value === styleValue)?.label ?? null
      : null;
    try {
      if (identityString.trim().length > 0) {
        await getUntask().settings.setIdentity(identityString);
      }
      if (roleValue) {
        await getUntask().settings.set('user.role', roleLabel ?? '');
      }
      if (styleValue) {
        await getUntask().settings.set('communication.style', styleLabel ?? '');
      }
      if (focusValue.trim().length > 0) {
        await getUntask().settings.set('user.focus', focusValue.trim());
      }
    } catch {
      // Non-fatal — proceed anyway
    }

    goNext();
  };

  const handleIdentitySkip = () => {
    goNext();
  };

  const handleShortcutsNext = () => {
    goNext();
  };

  const handlePreferencesNext = () => {
    void handleFinish();
  };

  const handleFinish = async () => {
    if (isFinishing || isTransitioningToApp) {
      return;
    }

    setIsFinishing(true);
    try {
      await getUntask().settings.markBootstrapCompleted();
    } catch {
      // Even if this fails, complete onboarding in the UI
    } finally {
      setIsFinishing(false);
      onComplete();
    }
  };

  // Welcome doesn't count in the step label — only numbered sections do.
  const numberedSteps = visibleSteps.filter((s): s is Exclude<StepKey, 'welcome'> => s !== 'welcome');
  const numberedIndex = numberedSteps.indexOf(currentStep as Exclude<StepKey, 'welcome'>);
  const displayStep = Math.max(1, numberedIndex + 1);
  const totalSteps = numberedSteps.length;
  const stepLabel = `${String(displayStep).padStart(2, '0')} / ${String(totalSteps).padStart(2, '0')}`;
  const canGoBack = currentIndex > 0 && !isFinishing;
  const nav: OnboardingNavProps = { onBack: goBack, canGoBack, stepLabel };

  // Determine which steps to render — all visible steps, always mounted
  const stepsToRender = visibleSteps;

  const renderStepContent = (step: StepKey, isActive: boolean) => {
    switch (step) {
      case 'welcome':
        return <OnboardingWelcome onNext={handleWelcomeNext} isActive={isActive} />;
      case 'basics':
        return (
          <OnboardingBasics
            onNext={(name, ai) => {
              void handleBasicsNext(name, ai);
            }}
            nav={nav}
            isActive={isActive}
          />
        );
      case 'notifications':
        return <OnboardingNotifications onNext={handleNotificationsNext} nav={nav} isActive={isActive} />;
      case 'provider':
        return (
          <OnboardingProvider
            onNext={(provider, keyOrUrl, modelId) => {
              void handleProviderNext(provider, keyOrUrl, modelId);
            }}
            onSkip={handleProviderSkip}
            nav={nav}
            isActive={isActive}
          />
        );
      case 'identity':
        return (
          <OnboardingIdentity
            userName={userName}
            onNext={(identityString, roleValue, styleValue, focusValue) => {
              void handleIdentityNext(identityString, roleValue, styleValue, focusValue);
            }}
            onSkip={handleIdentitySkip}
            nav={nav}
            isActive={isActive}
          />
        );
      case 'shortcuts':
        return <OnboardingShortcuts onNext={handleShortcutsNext} nav={nav} isActive={isActive} />;
      case 'preferences':
        return <OnboardingPreferences onNext={handlePreferencesNext} nav={nav} isActive={isActive} />;
    }
  };

  const MotionDiv = prefersReducedMotion ? 'div' : motion.div;

  return (
    <div
      className={[
        'flex h-full w-full flex-col bg-background',
        isTransitioningToApp ? 'pointer-events-none' : '',
      ].join(' ')}
    >
      {/* Invisible drag region so the frameless window can be moved during onboarding.
          Mirrors the 32px titlebar height from AppShell and reserves space for macOS traffic lights. */}
      <div className="drag-region absolute inset-x-0 top-0 z-50 h-8" />

      {/* Step viewport — overflow hidden, contains the tall scrollable column */}
      <div
        ref={viewportRef}
        className={[
          'relative flex-1 overflow-hidden transition-opacity duration-200',
          isTransitioningToApp ? 'opacity-0' : 'opacity-100',
        ].join(' ')}
      >
        {/* Tall scrollable column — all steps stacked vertically.
            Translated via framer-motion to show the active step.
            The dashed thread line runs through it via ::before. */}
        <MotionDiv
          ref={columnRef}
          className="onboarding-column"
          {...(prefersReducedMotion
            ? { style: { transform: `translateY(${scrollY}px)`, '--thread-mask': threadMask } as React.CSSProperties }
            : {
                animate: { y: scrollY },
                transition: ONBOARDING_SCROLL_TRANSITION,
                style: { '--thread-mask': threadMask } as React.CSSProperties,
              }
          )}
        >
          {stepsToRender.map((step) => {
            const isActive = step === currentStep;
            const hasBeenVisited = visitedSteps.has(step);
            // Welcome is not counted — reuse numberedSteps computed above
            const nonWelcomeIndex = numberedSteps.indexOf(step as Exclude<StepKey, 'welcome'>);
            const stepNumber = nonWelcomeIndex >= 0 ? String(nonWelcomeIndex + 1).padStart(2, '0') : null;

            return (
              <div
                key={step}
                ref={(el) => {
                  if (el) {
                    sectionRefs.current.set(step, el);
                  } else {
                    sectionRefs.current.delete(step);
                  }
                }}
                className="onboarding-section"
                // Non-active sections are inert so they don't trap focus or
                // expose interactive elements to assistive tech / DOM queries.
                inert={!isActive || undefined}
                aria-hidden={!isActive || undefined}
                style={{
                  // Each section is exactly viewport height
                  height: viewportRef.current?.offsetHeight ?? '100%',
                }}
              >
                {/* Content block — covers the thread line with bg-background */}
                <div
                  ref={(el) => {
                    if (el) {
                      contentRefs.current.set(step, el);
                    } else {
                      contentRefs.current.delete(step);
                    }
                  }}
                  className="onboarding-content w-full max-w-sm shrink-0 px-4"
                >
                  {/* Section header — number + dashed line + title (skipped for welcome) */}
                  {stepNumber !== null && (
                    <header className="flex items-center justify-center gap-2.5 pb-6">
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground/25">
                        {stepNumber}
                      </span>
                      <span className="h-px w-4 border-t border-dashed border-border/60" />
                      <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        {STEP_TITLES[step]}
                      </h2>
                    </header>
                  )}
                  {renderStepContent(step, isActive && hasBeenVisited)}
                </div>
              </div>
            );
          })}
        </MotionDiv>
      </div>
    </div>
  );
};
