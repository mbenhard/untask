export const MAX_IMAGE_DIMENSION = 2048;

export const detectMimeType = (dataUrl: string): string => {
  const match = dataUrl.match(/^data:(image\/\w+);/);
  return match?.[1] ?? 'image/jpeg';
};

export const resizeImageIfNeeded = (dataUrl: string): Promise<string> =>
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

export const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg)$/i;

/**
 * Extract image attachment data URLs from a BlockNote JSON body.
 * Resolves `untask-file://` URLs via IPC and resizes for AI consumption.
 * Works for both task bodies and note content.
 */
export const resolveBlockNoteImages = async (blockNoteJson: string | null): Promise<string[]> => {
  if (!blockNoteJson) return [];

  let blocks: Array<{ type?: string; props?: { url?: string } }>;
  try {
    blocks = JSON.parse(blockNoteJson);
  } catch {
    return [];
  }

  const imageUrls = blocks
    .filter(
      (b) =>
        b.type === 'image' &&
        typeof b.props?.url === 'string' &&
        b.props.url.startsWith('untask-file://') &&
        IMAGE_EXTENSIONS.test(b.props.url),
    )
    .map((b) => b.props!.url!);

  if (imageUrls.length === 0) return [];

  const flusk = window.flusk;
  if (!flusk) return [];

  const results: string[] = [];
  for (const url of imageUrls) {
    try {
      const id = url.replace('untask-file://', '');
      const dataUrl = await flusk.attachments.read({ id });
      const resized = await resizeImageIfNeeded(dataUrl);
      results.push(resized);
    } catch {
      // Skip unresolvable attachments
    }
  }

  return results;
};
