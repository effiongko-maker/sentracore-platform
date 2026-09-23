"use client";

import { useEffect } from "react";
import { FormField, inputClassName } from "@/components/forms/FormField";
import { useFacilityOptions } from "@/hooks/useFacilityOptions";
import { useScopedFacilityResolver } from "@/hooks/useScopedFacilityResolver";
import { facilityDisplayName } from "@/lib/platform/scopedFacility";

/**
 * Facility for create/edit forms is INHERITED from the signed-in user's active
 * facility assignment — never chosen per record. Read-only. On create the
 * resolved facility is pushed into the form; on edit the record's own facility
 * is shown untouched. A failed facility load is an explicit error, not an
 * empty choice.
 */
export function InheritedFacilityField({
  open,
  id,
  label,
  value,
  error,
  onResolve,
}: {
  open: boolean;
  id: string;
  label: string;
  /** The form's current facility UUID ("" on create until resolved). */
  value: string;
  error?: string;
  onResolve: (facilityId: string) => void;
}) {
  const { facilities, loading, error: loadError } = useFacilityOptions(open);
  // Create when the form opened without a facility (edit forms arrive with the record's own facility).
  const resolveScoped = useScopedFacilityResolver({ open, creating: !value.trim() });

  useEffect(() => {
    if (!open || value.trim()) return;
    const resolved = resolveScoped(facilities);
    if (resolved) onResolve(resolved);
  }, [open, value, facilities, resolveScoped, onResolve]);

  const shown = value.trim()
    ? facilityDisplayName(facilities, value)
    : loading
      ? "Loading facility…"
      : loadError
        ? "Facility unavailable"
        : "No facility context";

  return (
    <FormField
      label={label}
      htmlFor={id}
      required
      error={error ?? (loadError && !value.trim() ? "Couldn't load your facility. Close and reopen to retry." : undefined)}
    >
      <input
        id={id}
        className={inputClassName}
        value={shown}
        readOnly
        aria-readonly="true"
      />
    </FormField>
  );
}
