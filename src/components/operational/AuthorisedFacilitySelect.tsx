"use client";

import { useOperatingAccess } from "@/hooks/useOperatingAccess";
import { selectClassName } from "@/components/forms/FormField";

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
}: {
  id: string;
  value: string;
  onChange: (facilityId: string) => void;
  disabled?: boolean;
  currentName?: string;
}) {
  const { access, loading } = useOperatingAccess();
  const options = [...(access?.authorisedFacilities ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const known = !value || options.some((option) => option.id === value);
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
    </select>
  );
}
