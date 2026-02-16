import {
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';

import { cn } from '../../lib/utils';
import { useAppStore } from '../../stores/appStore';
import { Input } from '../ui/input';

type ChatInputProps = {
  className?: string;
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export const ChatInput = ({
  className,
  inputRef,
  value,
  onChange,
  onSubmit,
}: ChatInputProps) => {
  const enterChatMode = useAppStore((state) => state.enterChatMode);

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const nextValue = event.target.value;
    onChange(nextValue);

    if (nextValue.trim().length > 0) {
      enterChatMode();
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  };

  return (
    <footer
      className={cn(
        'flex h-14 items-center gap-3 border-t border-border bg-card px-4',
        className,
      )}
    >
      <Input
        ref={inputRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (value.trim().length > 0) {
            enterChatMode();
          }
        }}
        placeholder="Ask anything..."
        aria-label="Chat input"
        className="h-9 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:border-0 focus-visible:ring-0"
      />

      <span className="select-none text-[11px] font-medium tracking-[0.02em] text-muted-foreground">
        Cmd+K
      </span>
    </footer>
  );
};
