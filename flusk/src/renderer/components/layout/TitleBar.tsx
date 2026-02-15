import { motion } from 'framer-motion';

import { cn } from '../../lib/utils';
import {
  APP_VIEW_ORDER,
  type AppView,
  selectActiveView,
  useAppStore,
} from '../../stores/appStore';

const TAB_LABELS: Record<AppView, string> = {
  today: 'Today',
  projects: 'Projects',
  inbox: 'Inbox',
};

export const TitleBar = (): JSX.Element => {
  const activeView = useAppStore(selectActiveView);
  const setView = useAppStore((state) => state.setView);

  return (
    <header className="drag-region flex h-10 items-end border-b border-border bg-card/80 px-3 backdrop-blur-sm">
      <div aria-hidden className="h-full w-[72px] shrink-0" />

      <nav className="no-drag flex h-full items-end gap-1" aria-label="Primary view tabs">
        {APP_VIEW_ORDER.map((view) => {
          const isActive = activeView === view;

          return (
            <button
              key={view}
              type="button"
              onClick={() => setView(view)}
              className={cn(
                'no-drag relative flex h-9 items-center px-3 text-[12px] font-medium tracking-[0.02em] transition-colors',
                isActive
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground/80',
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              {TAB_LABELS[view]}
              {isActive && (
                <motion.span
                  layoutId="tab-indicator"
                  className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-foreground"
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                />
              )}
            </button>
          );
        })}
      </nav>
    </header>
  );
};
