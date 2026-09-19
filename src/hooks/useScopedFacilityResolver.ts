"use client";

import { useCallback } from "react";
import { useOperatingAccess } from "@/hooks/useOperatingAccess";
import { resolveScopedFacilityId } from "@/lib/platform/scopedFacility";

/**
 * Scoped-facility resolver bound to the signed-in user's active facility
 * assignment (UUID). Returns "" when no scope can be established safely.
 */
export function useScopedFacilityResolver() {
  const { access } = useOperatingAccess();
  const assignedFacilityId = access?.facilityId ?? "";
  return useCallback(
    (facilities: Array<{ id: string }>, preferredId?: string | null) =>
      resolveScopedFacilityId(facilities, preferredId, assignedFacilityId),
    [assignedFacilityId]
  );
}
