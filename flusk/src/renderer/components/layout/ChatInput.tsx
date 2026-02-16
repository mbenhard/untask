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

import { ArrowUp, Paperclip, Square, X } from 'lucide-react';

import { cn } from '../../lib/utils';
import { useChatStore, selectPendingImages } from '../../stores/chatStore';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';

const MAX_IMAGES = 4;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_IMAGE_DIMENSION = 2048;
const ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const ACCEPT_STRING = 'image/png,image/jpeg,image/webp,image/gif';

const detectMimeType = (dataUrl: string): string => {
  const match = dataUrl.match(/^data:(image\/\w+);/);
  return match?.[1] ?? 'image/jpeg';
};

const resizeImageIfNeeded = (dataUrl: string): Promise<string> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.width <= MAX_IMAGE_DIMENSION && img.height <= MAX_IMAGE_DIMENSION) {
        resolve(dataUrl);
        return;
      }

      const scale = Math.min(MAX_IMAGE_DIMENSION / img.width, MAX_IMAGE_DIMENSION / img.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const mime = detectMimeType(dataUrl);
      const quality = mime === 'image/png' ? undefined : 0.85;
      resolve(canvas.toDataURL(mime, quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

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
  const addPendingImage = useChatStore((state) => state.addPendingImage);
  const removePendingImage = useChatStore((state) => state.removePendingImage);

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

        try {
          const dataUrl = await readFileAsDataUrl(file);
          const resized = await resizeImageIfNeeded(dataUrl);
          addPendingImage(resized);
        } catch {
          showError('Failed to process image');
        }
      }
    },
    [addPendingImage, showError],
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
      {pendingImages.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto px-3 pt-1.5 pb-0">
          {pendingImages.map((dataUrl, index) => (
            <div key={index} className="relative shrink-0">
              <img
                src={dataUrl}
                alt={`Attachment ${index + 1}`}
                className="h-8 rounded-md object-cover"
              />
              <button
                type="button"
                onClick={() => removePendingImage(index)}
                className="absolute -top-1 -right-1 flex size-3.5 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                aria-label={`Remove image ${index + 1}`}
              >
                <X className="size-2" />
              </button>
            </div>
          ))}
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
      </div>
    </footer>
  );
};
