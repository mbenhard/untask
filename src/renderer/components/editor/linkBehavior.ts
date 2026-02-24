export type LinkClickEvent = Pick<MouseEvent, 'button' | 'metaKey' | 'ctrlKey'>;

export const isModifierPrimaryClick = (event: LinkClickEvent): boolean =>
  event.button === 0 && (event.metaKey || event.ctrlKey);

export const isSafeExternalHttpUrl = (href: string): boolean => {
  try {
    const url = new URL(href);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

export const shouldOpenExternalLink = (
  href: string,
  event: LinkClickEvent,
): boolean => isModifierPrimaryClick(event) && isSafeExternalHttpUrl(href);
