/**
 * Re-export Facilities module types for shared consumers.
 * Prefer importing from `@/modules/facilities` within the Facilities feature.
 */
export type {
  CreateFacilityInput,
  Facility,
  FacilityListParams,
  FacilityStatus,
  FacilityType,
  UpdateFacilityInput,
} from "@/modules/facilities/types";

export {
  FACILITY_LOCATIONS,
  FACILITY_STATUSES,
  FACILITY_TYPES,
} from "@/modules/facilities/constants";
