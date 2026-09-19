/**
 * Resolve the scoped facility UUID for forms that inherit the operating facility.
 *
 * Order (every step is an explicit fact, never a guess):
 *  1. `preferredId` — the facility of the record being edited, when it is a known facility.
 *  2. `assignedFacilityId` — the user's active facility assignment (UUID from access).
 *  3. The only facility, when exactly one exists (nothing to choose between).
 * Otherwise returns "" — the caller must surface an explicit "no facility scope"
 * error. It NEVER picks facilities[0] from several, and never matches a legacy
 * display code such as FAC-0001.
 */
export function resolveScopedFacilityId(
  facilities: Array<{ id: string }>,
  preferredId?: string | null,
  assignedFacilityId?: string | null
): string {
  const known = (id: string) => facilities.some((facility) => facility.id === id);
  const preferred = preferredId?.trim() || "";
  if (preferred && (facilities.length === 0 || known(preferred))) return preferred;
  const assigned = assignedFacilityId?.trim() || "";
  if (assigned && known(assigned)) return assigned;
  if (facilities.length === 1) return facilities[0].id;
  return "";
}

export function facilityDisplayName(
  facilities: Array<{ id: string; name: string }>,
  facilityId: string,
  fallback = "Facility"
): string {
  const id = facilityId.trim();
  if (!id) return fallback;
  return facilities.find((facility) => facility.id === id)?.name?.trim() || id;
}
