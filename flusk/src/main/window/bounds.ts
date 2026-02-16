import { screen, type Rectangle } from 'electron';

export type WindowBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const MIN_VISIBLE_PIXELS = 100;

export function isOnScreen(bounds: WindowBounds): boolean {
  const displays = screen.getAllDisplays();
  return displays.some((display) => {
    const work = display.workArea;
    const overlapX = Math.max(
      0,
      Math.min(bounds.x + bounds.width, work.x + work.width) -
        Math.max(bounds.x, work.x),
    );
    const overlapY = Math.max(
      0,
      Math.min(bounds.y + bounds.height, work.y + work.height) -
        Math.max(bounds.y, work.y),
    );
    return overlapX >= MIN_VISIBLE_PIXELS && overlapY >= MIN_VISIBLE_PIXELS;
  });
}

export function centerOnPrimaryDisplay(
  width: number,
  height: number,
): WindowBounds {
  const primary = screen.getPrimaryDisplay();
  const work = primary.workArea;
  return {
    x: Math.round(work.x + (work.width - width) / 2),
    y: Math.round(work.y + (work.height - height) / 2),
    width,
    height,
  };
}

export function resolveTargetBounds(
  stored: WindowBounds | null,
  defaultWidth: number,
  defaultHeight: number,
): WindowBounds {
  if (stored && isOnScreen(stored)) {
    return stored;
  }
  return centerOnPrimaryDisplay(defaultWidth, defaultHeight);
}

export function parseBoundsJson(json: string | null): WindowBounds | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    if (
      typeof parsed.x === 'number' &&
      typeof parsed.y === 'number' &&
      typeof parsed.width === 'number' &&
      typeof parsed.height === 'number'
    ) {
      return parsed as unknown as WindowBounds;
    }
    return null;
  } catch {
    return null;
  }
}

export function rectangleToBounds(rect: Rectangle): WindowBounds {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}
