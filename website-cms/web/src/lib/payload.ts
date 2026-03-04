const PAYLOAD_URL = import.meta.env.PAYLOAD_URL || 'http://localhost:3000';

export async function fetchGlobal<T = any>(slug: string): Promise<T> {
  const res = await fetch(`${PAYLOAD_URL}/api/globals/${slug}?depth=1`);
  if (!res.ok) {
    throw new Error(`Failed to fetch global "${slug}": ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * Resolve a media upload field to a full URL.
 * Handles both object (upload relation) and string (legacy) values.
 */
export function resolveMediaUrl(
  media: { url?: string } | string | null | undefined,
  fallback = '/og.jpg',
): string {
  if (!media) return fallback;
  if (typeof media === 'string') return media;
  if (media.url) {
    // If the URL is already absolute, return as-is
    if (media.url.startsWith('http')) return media.url;
    // Otherwise prepend the CMS URL
    return `${PAYLOAD_URL}${media.url}`;
  }
  return fallback;
}
