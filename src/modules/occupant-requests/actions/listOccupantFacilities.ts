"use server";

import type { Facility, FacilityType } from "@/modules/facilities/types";
import {
  OccupantPortalUnavailableError,
  loadOccupantPortalTarget,
} from "@/modules/requests/server/occupantPortalTarget";

/**
 * Public portal facility catalogue for the anonymous request form.
 *
 * Returns the ONE configured portal facility, read from Supabase. `id` is the
 * real fm_facilities UUID; `code` is the display code (e.g. FAC-0001).
 * A lookup failure is an explicit error — never an empty or invented catalogue.
 */
export async function listOccupantFacilities(): Promise<{
  facilities: Facility[];
  error: string | null;
}> {
  try {
    const target = await loadOccupantPortalTarget();
    return {
      facilities: [
        {
          id: target.facilityId,
          name: target.facilityName,
          code: target.facilityCode,
          location: target.location,
          type: target.facilityType as FacilityType,
          manager: "",
          status: "active",
          createdAt: "",
          updatedAt: "",
        },
      ],
      error: null,
    };
  } catch (error) {
    return {
      facilities: [],
      error:
        error instanceof OccupantPortalUnavailableError
          ? error.message
          : "The request portal is unavailable right now.",
    };
  }
}
