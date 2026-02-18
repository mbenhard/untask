import { useEffect, useState } from 'react';

import { X } from 'lucide-react';

import type { UpdateInfo } from '../../../types/ipc';
import { getUntask } from '../../lib/untask';

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

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const info = await getUntask().app.getUpdateInfo();
        if (info?.hasUpdate && !isDismissed(info.latestVersion)) {
          setUpdateInfo(info);
          setVisible(true);
        }
      } catch {
        // Silently ignore — update banner is non-critical
      }
    };

    void load();

    // Also poll after the initial check completes (in case main process
    // hasn't finished the first check yet when the renderer mounts).
    const pollHandle = window.setTimeout(() => {
      void load();
    }, 5000);

    return () => {
      window.clearTimeout(pollHandle);
    };
  }, []);

  const handleDismiss = (): void => {
    if (updateInfo) {
      dismiss(updateInfo.latestVersion);
    }
    setVisible(false);
  };

  if (!visible || !updateInfo) {
    return null;
  }

  return (
    <div className="relative flex items-center justify-between gap-2 border-b border-border/50 bg-muted/60 px-3 py-1.5 text-[11px] text-muted-foreground">
      <span>
        Untask{' '}
        <span className="font-medium text-foreground">v{updateInfo.latestVersion}</span>{' '}
        available.{' '}
        <a
          href={updateInfo.releaseUrl}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-foreground underline-offset-2 hover:underline"
          onClick={(e) => {
            e.preventDefault();
            // Open the URL in the system browser via Electron shell.
            // We access it through the window object since shell is not
            // directly available in the renderer.
            window.open(updateInfo.releaseUrl, '_blank');
          }}
        >
          View release
        </a>
      </span>
      <button
        type="button"
        onClick={handleDismiss}
        className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Dismiss update notification"
      >
        <X className="size-3" />
      </button>
    </div>
  );
};
