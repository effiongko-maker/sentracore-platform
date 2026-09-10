/**
 * Re-export canonical Deep Cleaning Log service for the module surface.
 * Module components keep importing from here — mirrors waste-log pattern.
 */
export {
  DeepCleaningLogService,
  type IDeepCleaningLogService,
} from "@/services/deepCleaningLog/DeepCleaningLogService";
