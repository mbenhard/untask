import { Skeleton } from './skeleton';

type ChatPanelSkeletonProps = {
  variant: 'threads' | 'threads-list' | 'conversation' | 'input';
  className?: string;
};

const SECTION_SKELETON_ITEMS = [0, 1, 2, 3];
const THREAD_SKELETON_ITEMS = [0, 1, 2, 3, 4, 5];
const MESSAGE_SKELETON_ITEMS = [0, 1, 2, 3];
const NOTE_ROW_SKELETON_ITEMS = [0, 1, 2, 3, 4, 5];

export const AppBootstrapSkeleton = () => (
  <main
    aria-busy="true"
    data-testid="app-bootstrap-skeleton"
    className="flex h-full w-full items-stretch justify-center p-3"
  >
    <div className="flex h-full w-full max-w-3xl flex-col gap-3">
      <Skeleton className="h-8 w-40" />
      <div className="flex flex-1 flex-col gap-3">
        {SECTION_SKELETON_ITEMS.map((item) => (
          <div key={item} className="rounded-lg border border-border/30 px-3 py-3">
            <div className="mb-3 flex items-center justify-between">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-6 w-16" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-[92%]" />
              <Skeleton className="h-9 w-[84%]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  </main>
);

type NotesListSkeletonProps = {
  testId?: string;
};

export const NotesListSkeleton = ({
  testId = 'notes-list-skeleton',
}: NotesListSkeletonProps) => (
  <div
    aria-busy="true"
    data-testid={testId}
    className="flex h-full min-h-0 flex-col overflow-hidden"
  >
    <header className="flex items-center justify-between px-3 py-2">
      <Skeleton className="h-2.5 w-12" />
      <Skeleton className="h-6 w-14 rounded-sm" />
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto px-1">
      <div>
        {NOTE_ROW_SKELETON_ITEMS.map((item) => (
          <div
            key={item}
            className="flex w-full items-center gap-2 border-b border-border/40 px-2 py-2 text-left transition-colors duration-100 last:border-b-0"
          >
            {item === 0 ? (
              <Skeleton className="h-2.5 w-2.5 rounded-sm opacity-55" />
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Skeleton className={item % 2 === 0 ? 'h-3 w-[68%]' : 'h-3 w-[58%]'} />
              </div>
              <Skeleton className={item % 2 === 0 ? 'mt-0.5 h-2.5 w-[78%] opacity-70' : 'mt-0.5 h-2.5 w-[86%] opacity-70'} />
            </div>
            <Skeleton className="h-2.5 w-10 opacity-60" />
          </div>
        ))}
      </div>
      <div className="mt-4 border-t border-border/50 pt-2">
        <div className="flex w-full items-center gap-1.5 px-3 py-1.5">
          <Skeleton className="h-3 w-3 rounded-sm opacity-65" />
          <Skeleton className="h-3 w-14" />
          <Skeleton className="ml-auto h-4 w-6 rounded-full" />
        </div>
      </div>
    </div>
  </div>
);

export const ChatPanelSkeleton = ({ variant, className }: ChatPanelSkeletonProps) => {
  if (variant === 'input') {
    return (
      <div
        aria-busy="true"
        data-testid="chat-panel-skeleton-input"
        className={className}
      >
        <div className="border-t border-dashed border-border/50 p-3">
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
    );
  }

  if (variant === 'threads') {
    return (
      <div
        aria-busy="true"
        data-testid="chat-panel-skeleton-threads"
        className={className}
      >
        <div className="border-b border-border/60 p-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="mt-2 h-8 w-full" />
        </div>
        <div className="space-y-2 p-2">
          {THREAD_SKELETON_ITEMS.map((item) => (
            <Skeleton key={item} className="h-10 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'threads-list') {
    return (
      <div
        aria-busy="true"
        data-testid="chat-panel-skeleton-threads-list"
        className={className}
      >
        <div className="space-y-2 px-1">
          {THREAD_SKELETON_ITEMS.map((item) => (
            <Skeleton key={item} className="h-10 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      aria-busy="true"
      data-testid="chat-panel-skeleton-conversation"
      className={className}
    >
      <div className="space-y-3 px-4 py-3">
        {MESSAGE_SKELETON_ITEMS.map((item) => (
          <div key={item} className="space-y-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
};

type EditorBlockSkeletonProps = {
  className?: string;
};

export const EditorBlockSkeleton = ({ className }: EditorBlockSkeletonProps) => (
  <div
    aria-busy="true"
    data-testid="editor-block-skeleton"
    className={className}
  >
    <div className="space-y-2">
      <Skeleton className="h-4 w-[92%]" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-[88%]" />
      <Skeleton className="h-4 w-[84%]" />
    </div>
  </div>
);
