/**
 * Re-export canonical Fumigation Log service for the module surface.
 * Module components keep importing from here — mirrors waste-log pattern.
 */
export {
  FumigationLogService,
  type IFumigationLogService,
} from "@/services/fumigationLog/FumigationLogService";
