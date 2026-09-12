"use server";

import type { Facility } from "@/modules/facilities/types";

/** Known V1 portal facility — avoids live Apps Script catalogue on guest load. */
const PORTAL_DEFAULT_FACILITY: Facility = {
  id: "FAC-0001",
  name: "NCC Annex",
  code: "FAC-0001",
  location: "",
  type: "office",
  manager: "",
  status: "active",
  createdAt: "",
  updatedAt: "",
};

/**
 * Public portal facility catalog for the anonymous request form.
 * Returns the known deployment default only — no Apps Script / staff API call.
 */
export async function listOccupantFacilities(): Promise<{
  facilities: Facility[];
  error: string | null;
}> {
  return {
    facilities: [PORTAL_DEFAULT_FACILITY],
    error: null,
  };
}
