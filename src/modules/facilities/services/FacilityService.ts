/**
 * Re-export the canonical FacilityService from the API layer.
 * Module components keep importing from here — no UI changes required.
 */
export {
  FacilityService,
  type IFacilityService,
} from "@/services/facilities/FacilityService";
