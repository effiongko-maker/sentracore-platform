"use client";

import { useOperatingAccess } from "@/hooks/useOperatingAccess";
import { selectClassName } from "@/components/forms/FormField";

/** Select value meaning "both facilities" — never stored; callers translate it to the record's multi-facility form. */
export const BOTH_FACILITIES = "__both__";

/**
 * The facility list a selection stands for (primary first). "Both" = every authorised facility (NCC Annex + CSIRT).
 * Callers must persist it with the record's genuine multi-facility representation — never as one arbitrary facility.
 */
export function facilityIdsForSelection(
  value: string,
  authorised: ReadonlyArray<{ id: string; name: string }>
): string[] {
  if (value !== BOTH_FACILITIES) return value ? [value] : [];
  return [...authorised].sort((a, b) => a.name.localeCompare(b.name)).map((f) => f.id);
}

/** Select value for a record's facilities: several → "Both" (when that is the authorised pair), else the single one. */
export function selectionForFacilityIds(ids: readonly string[] | undefined, fallback: string): string {
  return ids && ids.length > 1 ? BOTH_FACILITIES : ids?.[0] ?? fallback;
}

/**
 * Facility is an attribute of the operational record. This dropdown lists only the live facilities the signed-in
 * user is authorised to use (their active assignments, or every active facility for the all-facilities scope).
 * Changing it never changes any workspace/context. The server independently refuses an unauthorised facility.
 * `currentName` keeps an existing record's facility visible even if it is not (or no longer) an authorised option.
 */
export function AuthorisedFacilitySelect({
  id,
  value,
  onChange,
  disabled,
  currentName,
  allowBoth = false,
}: {
  id: string;
  value: string;
  onChange: (facilityId: string) => void;
  disabled?: boolean;
  currentName?: string;
  /** Offer "Both" (NCC Annex + CSIRT) — only where the record can genuinely cover both facilities. */
  allowBoth?: boolean;
}) {
  const { access, loading } = useOperatingAccess();
  const options = [...(access?.authorisedFacilities ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const bothAvailable = allowBoth && options.length === 2;
  const known = !value || options.some((option) => option.id === value) || (bothAvailable && value === BOTH_FACILITIES);
  return (
    <select
      id={id}
      className={selectClassName}
      value={value}
      disabled={disabled || loading}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="" disabled>
        {loading ? "Loading facilities…" : options.length ? "Select a facility" : "No authorised facility"}
      </option>
      {!known ? (
        <option value={value} disabled>
          {currentName || value}
        </option>
      ) : null}
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name}
        </option>
      ))}
      {bothAvailable ? <option value={BOTH_FACILITIES}>Both</option> : null}
    </select>
  );
}
