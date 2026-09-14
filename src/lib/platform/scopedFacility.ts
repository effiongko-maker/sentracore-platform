/**
 * V1 Facility Management operating facility.
 * Forms inherit this automatically — do not ask operators to pick a facility.
 */

export const SCOPED_FACILITY_PREFERRED_ID = "FAC-0001";

export function resolveScopedFacilityId(
  facilities: Array<{ id: string }>,
  preferredId?: string | null
): string {
  const preferred = preferredId?.trim() || "";
  if (preferred) {
    if (facilities.length === 0) return preferred;
    if (facilities.some((facility) => facility.id === preferred)) {
      return preferred;
    }
  }
  return (
    facilities.find((facility) => facility.id === SCOPED_FACILITY_PREFERRED_ID)
      ?.id ??
    facilities[0]?.id ??
    preferred
  );
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
