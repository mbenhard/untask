import {
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';

import { ArrowUp, Square } from 'lucide-react';

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
  const isSending = useChatStore((state) => state.isSending);
  const cancelStream = useChatStore((state) => state.cancelStream);

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

  const hasContent = value.trim().length > 0;

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
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="mb-0.5 text-muted-foreground hover:text-foreground"
        disabled={!isSending && !hasContent}
        aria-label={isSending ? 'Stop response' : 'Send message'}
        onClick={() => {
          if (isSending) {
            void cancelStream();
            return;
          }

          onSubmit();
        }}
      >
        {isSending ? (
          <Square className="size-3 fill-current" />
        ) : (
          <ArrowUp className="size-3.5" />
        )}
      </Button>
    </footer>
  );
};
