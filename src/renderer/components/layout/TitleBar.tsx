import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { navigateToNotes } from '../../lib/notesNavigation';
import { SNAPPY_SPRING } from '../../lib/animation';
import {
  type AppView,
  selectActiveView,
  useAppStore,
} from '../../stores/appStore';

const TAB_LABELS: Record<string, string> = {
  today: 'Today',
  tasks: 'Tasks',
  inbox: 'Inbox',
  notes: 'Notes',
};

const PRIMARY_VIEWS: AppView[] = [
  'today',
  'tasks',
  'inbox',
  'notes',
];

export const TitleBar = () => {
  const activeView = useAppStore(selectActiveView);
  const setView = useAppStore((state) => state.setView);

  return (
    <header className="drag-region flex h-8 items-center px-2 pt-2">
      <div aria-hidden className="h-full w-[68px] shrink-0" />

      <div className="flex-1" />

      <nav className="no-drag flex items-center gap-0.5" aria-label="Primary view tabs" role="tablist">
        {PRIMARY_VIEWS.map((view) => {
          const isActive = activeView === view;

          return (
            <button
              key={view}
              type="button"
              onClick={() => {
                if (view === 'notes') {
                  void navigateToNotes({ type: 'default' });
                  return;
                }
                setView(view);
              }}
              className={cn(
                'no-drag relative rounded-lg px-2.5 py-1 text-[11px] font-medium tracking-[0.01em] outline-none transition-colors',
                isActive
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground/80',
              )}
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? 'page' : undefined}
            >
              {isActive && (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute inset-0 rounded-lg bg-accent"
                  transition={SNAPPY_SPRING}
                  aria-hidden="true"
                />
              )}
              <span className="relative">{TAB_LABELS[view]}</span>
            </button>
          );
        })}
      </nav>
    </header>
  );
};
