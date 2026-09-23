"use client";

import { useCallback } from "react";
import { useOperatingAccess } from "@/hooks/useOperatingAccess";
import { resolveScopedFacilityId } from "@/lib/platform/scopedFacility";

/**
 * Initial facility for create/edit forms (facility is a normal field on the record):
 *  - editing: the record's own facility (preferredId);
 *  - creating with exactly ONE authorised facility: that facility, preselected;
 *  - otherwise "": the user chooses from the Facility dropdown (authorised facilities only).
 * Pure — safe inside useMemo / state updaters. Never changes any workspace/context.
 */
export function useScopedFacilityResolver() {
  const { access } = useOperatingAccess();
  const authorised = access?.authorisedFacilities ?? [];
  const onlyAuthorised = authorised.length === 1 ? authorised[0]!.id : "";
  return useCallback(
    (facilities: Array<{ id: string }>, preferredId?: string | null) =>
      resolveScopedFacilityId(facilities, preferredId, onlyAuthorised),
    [onlyAuthorised]
  );
}
