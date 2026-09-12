"use client";

import type { Facility } from "@/modules/facilities/types";

/** Known V1 portal facility — no live catalogue fetch on guest load. */
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
 * Anonymous request portal facilities.
 * Synchronous default only — does not call Apps Script or /api/facilities.
 */
export function useOccupantFacilities() {
  return {
    facilities: [PORTAL_DEFAULT_FACILITY],
    loading: false,
    error: null as string | null,
  };
}
