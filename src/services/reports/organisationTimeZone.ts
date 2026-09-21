/**
 * The organisation's authoritative IANA timezone (organisations.timezone), as served by /api/access/me.
 * Returns null when it cannot be read: callers must treat that as "unknown", never as UTC or the browser zone.
 */
export async function loadOrganisationTimeZone(): Promise<string | null> {
  try {
    const response = await fetch("/api/access/me", { method: "GET", headers: { Accept: "application/json" }, credentials: "same-origin" });
    if (!response.ok) return null;
    const json = (await response.json()) as { organisationTimeZone?: unknown };
    return typeof json.organisationTimeZone === "string" && json.organisationTimeZone.trim() ? json.organisationTimeZone.trim() : null;
  } catch {
    return null;
  }
}
