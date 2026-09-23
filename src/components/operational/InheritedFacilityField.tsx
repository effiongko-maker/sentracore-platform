"use client";

import { useEffect } from "react";
import { FormField } from "@/components/forms/FormField";
import { AuthorisedFacilitySelect } from "@/components/operational/AuthorisedFacilitySelect";
import { useFacilityOptions } from "@/hooks/useFacilityOptions";
import { useScopedFacilityResolver } from "@/hooks/useScopedFacilityResolver";
import { facilityDisplayName } from "@/lib/platform/scopedFacility";

/**
 * Facility field for create/edit forms — a normal dropdown of the user's AUTHORISED facilities (facility is an
 * attribute of the record, not a workspace context). On create it preselects the only authorised facility when there
 * is exactly one; on edit it shows the record's own facility. A failed facility load is an explicit error.
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
  const resolveScoped = useScopedFacilityResolver();

  useEffect(() => {
    if (!open || value.trim()) return;
    const resolved = resolveScoped(facilities);
    if (resolved) onResolve(resolved);
  }, [open, value, facilities, resolveScoped, onResolve]);

  return (
    <FormField
      label={label}
      htmlFor={id}
      required
      error={error ?? (loadError && !value.trim() ? "Couldn't load facilities. Close and reopen to retry." : undefined)}
    >
      <AuthorisedFacilitySelect
        id={id}
        value={value}
        currentName={facilityDisplayName(facilities, value)}
        disabled={loading}
        onChange={onResolve}
      />
    </FormField>
  );
}
