export type StatusVariant =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral";

export type {
  CreateUserInput,
  CurrentUser,
  UpdateUserInput,
  User,
  UserListParams,
  UserRole,
  UserStatus,
} from "./user";

export {
  USER_ROLES,
  USER_SPECIALIZATIONS,
  USER_STATUSES,
} from "./user";

export type {
  CreateFacilityInput,
  Facility,
  FacilityListParams,
  FacilityStatus,
  FacilityType,
  UpdateFacilityInput,
} from "./facility";

export {
  FACILITY_LOCATIONS,
  FACILITY_STATUSES,
  FACILITY_TYPES,
} from "./facility";

export type {
  Asset,
  AssetCategory,
  AssetCondition,
  AssetCriticality,
  AssetListParams,
  AssetStatus,
  CreateAssetInput,
  UpdateAssetInput,
} from "./asset";

export {
  ASSET_CATEGORIES,
  ASSET_CONDITIONS,
  ASSET_CRITICALITIES,
  ASSET_STATUSES,
} from "./asset";


export type {
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
  WorkOrder,
  WorkOrderListParams,
  WorkOrderMaintenanceType,
  WorkOrderPriority,
  WorkOrderSource,
  WorkOrderStatus,
  WorkOrderType,
} from "./work-order";

export {
  WORK_ORDER_MAINTENANCE_TYPES,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_SOURCES,
  WORK_ORDER_STATUSES,
  WORK_ORDER_TYPES,
} from "./work-order";


export type {
  CreateIncidentInput,
  Incident,
  IncidentChannel,
  IncidentListParams,
  IncidentSeverity,
  IncidentSource,
  IncidentStatus,
  IncidentType,
  UpdateIncidentInput,
} from "./incident";

export {
  INCIDENT_CHANNELS,
  INCIDENT_SEVERITIES,
  INCIDENT_SOURCES,
  INCIDENT_STATUSES,
  INCIDENT_TYPES,
} from "./incident";

export type {
  CreateMaintenanceInput,
  Maintenance,
  MaintenanceListParams,
  MaintenancePriority,
  MaintenanceSource,
  MaintenanceStatus,
  MaintenanceType,
  UpdateMaintenanceInput,
} from "./maintenance";

export {
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_SOURCES,
  MAINTENANCE_STATUSES,
  MAINTENANCE_TYPES,
} from "./maintenance";

/** Dashboard card shape — not the canonical Maintenance aggregate. */
export interface MaintenanceTask {
  id: string;
  title: string;
  asset: string;
  facility: string;
  scheduledDate: string;
  type: "preventive" | "corrective" | "inspection";
  status: "scheduled" | "overdue" | "completed";
}

export interface ActivityItem {
  id: string;
  type: "work_order" | "incident" | "approval" | "maintenance" | "user";
  title: string;
  description: string;
  timestamp: string;
  actor: string;
}

export interface ApprovalItem {
  id: string;
  title: string;
  type: string;
  requestedBy: string;
  requestedAt: string;
  status: "pending" | "approved" | "rejected";
}

export interface DashboardStat {
  id: string;
  label: string;
  value: number | string;
  change: string;
  trend: "up" | "down" | "neutral";
  variant: StatusVariant;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** @deprecated Prefer module-specific params (e.g. UserListParams). */
export interface ListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  role?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  type: "info" | "warning" | "danger" | "success";
}
