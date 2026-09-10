/**
 * Re-export canonical Waste Log service for the module surface.
 * Module components keep importing from here — mirrors generator-log pattern.
 */
export {
  WasteLogService,
  type IWasteLogService,
} from "@/services/wasteLog/WasteLogService";
