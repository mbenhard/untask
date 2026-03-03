import { useCallback, useEffect, useRef, useState } from 'react';

import { Check, Clipboard, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

import type { UpdateInfo } from '../../../types/ipc';
import { getUntask } from '../../lib/untask';
import { heightVariants } from '../../lib/animation';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

const BREW_COMMAND = 'brew update && brew upgrade untask';
const DISMISSED_KEY_PREFIX = 'untask-update-dismissed-v';

const isDismissed = (version: string): boolean => {
  try {
    return localStorage.getItem(`${DISMISSED_KEY_PREFIX}${version}`) === 'true';
  } catch {
    return false;
  }
};

const dismiss = (version: string): void => {
  try {
    localStorage.setItem(`${DISMISSED_KEY_PREFIX}${version}`, 'true');
  } catch {
    // ignore storage errors
  }
};

export const UpdateBanner = () => {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(BREW_COMMAND).then(() => {
      setCopied(true);
      clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  const handleOpenTerminal = useCallback(() => {
    void getUntask().shell.openInTerminal(BREW_COMMAND);
  }, []);

  useEffect(() => {
    const show = (info: UpdateInfo): void => {
      if (info.hasUpdate && !isDismissed(info.latestVersion)) {
        setUpdateInfo(info);
        setVisible(true);
      }
    };

    // Fast path: check if the main process already has a result cached.
    void getUntask().app.getUpdateInfo().then((info) => {
      if (info) show(info);
    }).catch(() => { /* non-critical */ });

    // Push path: main process notifies us the moment a check completes.
    const unsubscribe = getUntask().app.onUpdateAvailable(show);

    return () => {
      unsubscribe();
    };
  }, []);

  const handleDismiss = (): void => {
    if (updateInfo) {
      dismiss(updateInfo.latestVersion);
    }
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && updateInfo ? (
        <motion.div
          key="update-banner"
          variants={heightVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
          style={{ overflow: 'hidden' }}
        >
          <div className="relative flex items-center justify-between gap-2 border-b border-border/50 bg-muted/60 px-3 py-1.5 text-[11px] text-muted-foreground">
            <span>
              Untask{' '}
              <a
                href={updateInfo.releaseUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                v{updateInfo.latestVersion}
              </a>{' '}
              available. {' '}
              {updateInfo.installMethod === 'homebrew' ? (
                <>
                  Update with{' '}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="cursor-pointer rounded bg-foreground/[0.06] px-1 py-0.5 font-mono text-[10px] text-foreground transition-colors hover:bg-foreground/[0.1]"
                      >
                        {BREW_COMMAND}
                        {copied ? (
                          <Check className="ml-1 inline size-2.5 align-[-1px] text-green-400" aria-hidden="true" />
                        ) : (
                          <Clipboard className="ml-1 inline size-2.5 align-[-1px] opacity-40" aria-hidden="true" />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Click to copy</TooltipContent>
                  </Tooltip>
                  {' or via '}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={handleOpenTerminal}
                        className="font-medium text-foreground underline-offset-2 hover:underline"
                      >
                        Terminal
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Opens Terminal.app and runs the command</TooltipContent>
                  </Tooltip>
                </>
              ) : (
                <a
                  href={updateInfo.releaseUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-foreground underline-offset-2 hover:underline"
                >
                  View release
                </a>
              )}
            </span>
            <button
              type="button"
              onClick={handleDismiss}
              className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Dismiss update notification"
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
