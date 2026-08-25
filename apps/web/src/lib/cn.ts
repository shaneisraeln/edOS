/**
 * Minimal class name joiner.
 *
 * Deliberately dependency-free — we only need falsy filtering, not the full
 * tailwind-merge conflict resolution. Keep prop-driven classes last so they
 * win by CSS source order.
 */
export type ClassValue = string | number | null | false | undefined;

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
