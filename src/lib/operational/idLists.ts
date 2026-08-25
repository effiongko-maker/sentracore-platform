/** Parse comma-separated operational IDs from sheet storage. */
export function parseIdList(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v).trim()).filter(Boolean);
  }
  const text = String(raw).trim();
  if (!text) return [];
  return text
    .split(/[,;|]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Serialize operational ID lists for sheet storage. */
export function formatIdList(ids: string[]): string {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))].join(", ");
}

export function appendUniqueId(existing: string[], id: string): string[] {
  const trimmed = id.trim();
  if (!trimmed) return existing;
  if (existing.includes(trimmed)) return existing;
  return [...existing, trimmed];
}

export function primaryId(ids: string[], fallback?: string): string | undefined {
  return ids[0] ?? fallback;
}
