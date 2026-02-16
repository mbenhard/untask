import { cn } from '../../lib/utils';
import {
  APP_VIEW_ORDER,
  type AppView,
  selectActiveView,
  selectIsChatMode,
  selectIsMemorySettingsOpen,
  useAppStore,
} from '../../stores/appStore';

const TAB_LABELS: Record<AppView, string> = {
  today: 'Today',
  projects: 'Projects',
  inbox: 'Inbox',
  scratchpad: 'Notes',
};

export const TitleBar = () => {
  const activeView = useAppStore(selectActiveView);
  const isChatMode = useAppStore(selectIsChatMode);
  const setView = useAppStore((state) => state.setView);
  const enterChatMode = useAppStore((state) => state.enterChatMode);
  const isMemorySettingsOpen = useAppStore(selectIsMemorySettingsOpen);
  const toggleMemorySettings = useAppStore((state) => state.toggleMemorySettings);

  return (
    <header className="drag-region flex h-8 items-center px-2">
      <div aria-hidden className="h-full w-[64px] shrink-0" />

      <nav className="no-drag flex h-full items-center gap-0.5" aria-label="Primary view tabs">
        {APP_VIEW_ORDER.map((view) => {
          const isActive = activeView === view && !isChatMode;

          return (
            <button
              key={view}
              type="button"
              onClick={() => setView(view)}
              className={cn(
                'no-drag relative flex h-7 items-center px-2 text-[11px] font-medium tracking-[0.01em] transition-colors',
                isActive
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground/80',
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              {TAB_LABELS[view]}
            </button>
          );
        })}

        <button
          type="button"
          onClick={enterChatMode}
          className={cn(
            'no-drag relative flex h-7 items-center px-2 text-[11px] font-medium tracking-[0.01em] transition-colors',
            isChatMode
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground/80',
          )}
          aria-current={isChatMode ? 'page' : undefined}
        >
          Chat
        </button>
      </nav>

      <div className="no-drag ml-auto flex h-full items-center gap-2">
        <button
          type="button"
          onClick={toggleMemorySettings}
          className={cn(
            'h-7 px-2 text-[11px] font-medium tracking-[0.01em] transition-colors',
            isMemorySettingsOpen
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
          aria-pressed={isMemorySettingsOpen}
        >
          Settings
        </button>
      </div>
    </header>
  );
};
