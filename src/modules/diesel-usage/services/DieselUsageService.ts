/**
 * Re-export the canonical DieselUsageService from the API layer.
 * Module components keep importing from here — mirrors generator-log pattern.
 */
export {
  DieselUsageService,
  type IDieselUsageService,
} from "@/services/dieselUsage/DieselUsageService";
