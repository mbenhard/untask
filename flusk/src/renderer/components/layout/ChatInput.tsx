import {
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useRef,
  useState,
} from 'react';

import { ArrowUp, Loader2, Paperclip, Square } from 'lucide-react';

import { cn } from '../../lib/utils';
import {
  useChatStore,
  selectPendingImages,
  selectPendingNoteContext,
  selectProcessingImageCount,
} from '../../stores/chatStore';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';

import { resizeImageIfNeeded, readFileAsDataUrl } from '../../utils/imageResize';

const MAX_IMAGES = 4;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const ACCEPT_STRING = 'image/png,image/jpeg,image/webp,image/gif';

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
  const pendingImages = useChatStore(selectPendingImages);
  const pendingNoteContext = useChatStore(selectPendingNoteContext);
  const processingImageCount = useChatStore(selectProcessingImageCount);
  const addPendingImage = useChatStore((state) => state.addPendingImage);
  const clearPendingImages = useChatStore((state) => state.clearPendingImages);
  const incrementProcessing = useChatStore((state) => state.incrementProcessingImages);
  const decrementProcessing = useChatStore((state) => state.decrementProcessingImages);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const showError = useCallback((message: string) => {
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
    }
    setErrorMessage(message);
    errorTimeoutRef.current = setTimeout(() => {
      setErrorMessage(null);
      errorTimeoutRef.current = null;
    }, 3000);
  }, []);

  const processFiles = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        if (useChatStore.getState().pendingImages.length >= MAX_IMAGES) break;

        if (!ACCEPTED_TYPES.has(file.type)) {
          showError('Only images are supported (PNG, JPG, WebP, GIF)');
          continue;
        }

        if (file.size > MAX_IMAGE_SIZE) {
          showError('Image too large (max 5MB)');
          continue;
        }

        incrementProcessing();
        try {
          const dataUrl = await readFileAsDataUrl(file);
          const resized = await resizeImageIfNeeded(dataUrl);
          addPendingImage(resized);
        } catch {
          showError('Failed to process image');
        } finally {
          decrementProcessing();
        }
      }
    },
    [addPendingImage, showError, incrementProcessing, decrementProcessing],
  );

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    onChange(event.target.value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (isSending) {
        void cancelStream();
        return;
      }
      onSubmit();
    }
  };

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length > 0) {
        event.preventDefault();
        void processFiles(imageFiles);
      }
    },
    [processFiles],
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragOver(false);

      const files = Array.from(event.dataTransfer.files);
      if (files.length > 0) {
        void processFiles(files);
      }
    },
    [processFiles],
  );

  const handleFilePickerClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      if (files.length > 0) {
        void processFiles(files);
      }
      // Reset so same file can be selected again
      event.target.value = '';
    },
    [processFiles],
  );

  const hasContent = value.trim().length > 0;
  const isProcessingImages = processingImageCount > 0;
  const totalImageCount = pendingImages.length + processingImageCount;
  const atImageLimit = pendingImages.length >= MAX_IMAGES;

  return (
    <footer
      className={cn(
        'flex flex-col',
        isDragOver && 'ring-1 ring-inset ring-muted-foreground/30 rounded-lg',
        className,
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {(totalImageCount > 0 || isProcessingImages) && (
        <div className="flex items-center px-3 pt-1.5 pb-0">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground">
            {isProcessingImages ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Paperclip className="size-3" />
            )}
            <span>
              {isProcessingImages && pendingImages.length === 0
                ? `Processing ${processingImageCount} image${processingImageCount > 1 ? 's' : ''}…`
                : `${totalImageCount} image${totalImageCount > 1 ? 's' : ''}`}
            </span>
            <button
              type="button"
              onClick={clearPendingImages}
              className="-mr-0.5 ml-0.5 rounded-full p-0.5 transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Remove all images"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" />
              </svg>
            </button>
          </span>
        </div>
      )}

      {errorMessage && (
        <p className="px-3 pt-1 text-[11px] text-destructive">{errorMessage}</p>
      )}

      <div className="flex min-h-11 items-end gap-2 px-3 py-1.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="mb-0.5 text-muted-foreground hover:text-foreground"
          disabled={atImageLimit}
          aria-label="Attach image"
          onClick={handleFilePickerClick}
        >
          <Paperclip className="size-3.5" />
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_STRING}
          multiple
          className="hidden"
          onChange={handleFileChange}
        />

        <div className="flex w-full items-end px-0 py-0">
          <Textarea
            ref={inputRef}
            rows={1}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              pendingNoteContext
                ? `Ask Flusk about "${pendingNoteContext.title}"...`
                : 'Ask Flusk...'
            }
            aria-label="Chat input"
            className="h-7 max-h-32 !min-h-0 resize-none overflow-y-auto !border-0 !bg-transparent !px-0 py-1 text-[13px] leading-5 !shadow-none focus-visible:!border-0 focus-visible:!ring-0"
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="mb-0.5 text-muted-foreground hover:text-foreground"
          disabled={!isSending && (!hasContent || isProcessingImages)}
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
      </div>
    </footer>
  );
};
