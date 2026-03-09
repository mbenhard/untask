import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Resolve a raw status string to its canonical column ID, or undefined if unmatched. */
export function resolveStatus(
  columns: { id: string; aliases: string[] }[],
  raw: string,
): string | undefined {
  const normalized = raw.trim().toLowerCase();
  for (const col of columns) {
    if (col.id === normalized) return col.id;
    for (const alias of col.aliases) {
      if (alias.toLowerCase() === normalized) return col.id;
    }
  }
  return undefined;
}

/** Check if a status resolves to a known column. */
export function hasKnownStatus(
  columns: { id: string; aliases: string[] }[],
  status: string,
): boolean {
  return resolveStatus(columns, status) !== undefined;
}
