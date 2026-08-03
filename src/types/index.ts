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
  USER_FACILITIES,
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
  ASSET_FACILITIES,
  ASSET_STATUSES,
} from "./asset";


export interface WorkOrder {
  id: string;
  title: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "on_hold" | "completed" | "cancelled";
  assignee: string;
  facility: string;
  dueDate: string;
  createdAt: string;
}

export interface Incident {
  id: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "investigating" | "resolved" | "closed";
  facility: string;
  reportedBy: string;
  reportedAt: string;
}

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
