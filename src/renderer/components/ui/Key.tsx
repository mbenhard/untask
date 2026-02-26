import { cn } from '../../lib/utils';

// ─── Shift icon ───────────────────────────────────────────────

/**
 * The ⇧ Unicode glyph renders poorly in monospace fonts — thin, poorly
 * spaced, varies by platform. We use a small inline SVG instead that matches
 * the hollow upward-arrow shape macOS and apps like Raycast/Linear use.
 */
function ShiftIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 10 10"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('inline-block', className)}
      aria-hidden="true"
    >
      {/* Hollow upward arrow: chevron top + stem */}
      <path
        d="M5 1.5 L9 6 H6.5 V8.5 H3.5 V6 H1 Z"
        stroke="currentColor"
        strokeWidth="0.9"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

// ─── Symbol normalizer ────────────────────────────────────────

/**
 * Converts a key name (in any casing, including Electron accelerator tokens)
 * to its proper display symbol or short label.
 *
 * Examples:
 *   keySymbol('CommandOrControl') → '⌘'
 *   keySymbol('shift')            → '__shift__' (renders as SVG icon)
 *   keySymbol('alt')              → '⌥'
 *   keySymbol('space')            → 'Space'
 *   keySymbol('K')                → 'K'
 */
export function keySymbol(key: string): string {
  switch (key.toLowerCase()) {
    case 'cmd':
    case 'command':
    case 'commandorcontrol':
    case 'meta':
      return '⌘';
    case 'shift':
    case '⇧':
      return '__shift__';
    case 'alt':
    case 'option':
      return '⌥';
    case 'ctrl':
    case 'control':
      return '⌃';
    case 'backspace':
    case 'delete':
      return '⌫';
    case 'enter':
    case 'return':
      return '↵';
    case 'tab':
      return '⇥';
    case 'space':
      return 'Space';
    case 'up':
      return '↑';
    case 'down':
      return '↓';
    case 'left':
      return '←';
    case 'right':
      return '→';
    case 'escape':
    case 'esc':
      return 'Esc';
    case 'capslock':
    case 'caps':
      return '⇪';
    default:
      // Single chars → uppercase; anything else → as-is
      return key.length === 1 ? key.toUpperCase() : key;
  }
}

// ─── Key component ────────────────────────────────────────────

type KeyProps = {
  /** The key to display. Will be normalized via keySymbol. */
  k?: string;
  /** Raw children override (skips normalization). */
  children?: React.ReactNode;
  /** Visual size. 'md' is the default (11px, used in onboarding/prominent). 'sm' is 10px (settings). 'xs' is 9px (quiet hints). */
  size?: 'xs' | 'sm' | 'md';
  className?: string;
};

export function Key({ k, children, size = 'md', className }: KeyProps) {
  const label = k !== undefined ? keySymbol(k) : children;
  const isShift = label === '__shift__';

  // Icon sizes matching the text sizes (em-relative would drift, fixed px is safer)
  const iconSize =
    size === 'md' ? 'w-[11px] h-[11px]' :
    size === 'sm' ? 'w-[10px] h-[10px]' :
                    'w-[9px] h-[9px]';

  return (
    <kbd
      className={cn(
        'inline-flex items-center justify-center rounded border border-border/60 bg-accent font-mono text-foreground/80 select-none',
        size === 'md' && 'h-[20px] px-1.5 text-[11px]',
        size === 'sm' && 'h-[18px] px-1.5 text-[10px]',
        size === 'xs' && 'h-4 px-1 text-[9px] text-muted-foreground/70',
        className,
      )}
    >
      {isShift ? <ShiftIcon className={iconSize} /> : label}
    </kbd>
  );
}

// ─── Keys combo component ─────────────────────────────────────

type KeysProps = {
  /**
   * An Electron accelerator string or a display string.
   * Splits on '+' or spaces, normalizes each token via keySymbol.
   * Separators like '/' are preserved as plain text between keys.
   *
   * Examples:
   *   combo="CommandOrControl+Shift+K"  → ⌘ ⇧ K
   *   combo="⌘ ⇧ N"                    → ⌘ ⇧ N  (already symbols, pass through)
   *   combo="⌥ ↑ / ↓"                  → ⌥ ↑ / ↓
   */
  combo: string;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
};

export function Keys({ combo, size = 'md', className }: KeysProps) {
  // Split on '+' (Electron format) or spaces, keeping '/' as a separator token
  const raw = combo.includes('+') ? combo.split('+') : combo.split(' ');

  const tokens = raw.flatMap((token) =>
    token.includes('/') ? token.split(/(\/)/).filter(Boolean) : [token],
  );

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {tokens.map((token, i) => {
        const t = token.trim();
        if (!t) return null;
        if (t === '/') {
          return (
            <span key={i} className="text-muted-foreground/50 text-[10px]">
              /
            </span>
          );
        }
        return <Key key={i} k={t} size={size} />;
      })}
    </span>
  );
}
