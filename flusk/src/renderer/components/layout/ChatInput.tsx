import {
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';

import { cn } from '../../lib/utils';
import { useChatStore } from '../../stores/chatStore';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';

type ChatInputProps = {
  className?: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
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
  const messageCount = useChatStore((state) => state.messages.length);
  const clearHistory = useChatStore((state) => state.clearHistory);

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    onChange(event.target.value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  };

  return (
    <footer
      className={cn(
        'flex min-h-11 items-end gap-2 px-3 py-1.5',
        className,
      )}
    >
      <div className="flex w-full items-end px-0 py-0">
        <Textarea
          ref={inputRef}
          rows={1}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Ask Flusk..."
          aria-label="Chat input"
          className="h-7 max-h-32 !min-h-0 resize-none overflow-y-auto !border-0 !bg-transparent !px-0 py-1 text-[13px] leading-5 !shadow-none focus-visible:!border-0 focus-visible:!ring-0"
        />
      </div>
      {messageCount > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={() => {
            void clearHistory();
          }}
        >
          Clear
        </Button>
      ) : null}
    </footer>
  );
};
