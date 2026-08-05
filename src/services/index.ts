export {
  apiClient,
  ApiClient,
  ApiError,
  delay,
  type ApiResponse,
  type ApiRequestOptions,
} from "./api";
export { UserService, type IUserService } from "./users/UserService";
export {
  FacilityService,
  type IFacilityService,
} from "./facilities/FacilityService";
export {
  AssetService,
  type IAssetService,
} from "./assets/AssetService";
export {
  EntityResolver,
  EntityKinds,
  registerEntityResolver,
  type EntityKind,
  type EntityResolverRegistration,
  type IEntityResolver,
  type ResolvedEntity,
} from "./entityResolver";
export {
  WorkOrderService,
  type IWorkOrderService,
} from "./workOrders/WorkOrderService";
export {
  IncidentService,
  type IIncidentService,
} from "./incidents/IncidentService";
export {
  MaintenanceService,
  type IMaintenanceService,
} from "./maintenance/MaintenanceService";
export {
  MasterDataService,
  type IMasterDataService,
} from "./masterData/MasterDataService";

// Dashboard / Reporting are intentionally NOT re-exported from this barrel.
// Import from their own entrypoints so AppShell/TopBar does not eagerly pull
// the reporting stack into the shared client layout:
//   @/services/dashboard
//   @/services/reporting

