/** Shared ECC string ID generator — preserves ECC-* prefixes used in deep links. */

export function newEccId(prefix: string): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${stamp}-${rand}`;
}
