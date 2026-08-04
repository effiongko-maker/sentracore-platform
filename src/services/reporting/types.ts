import type { Asset } from "@/modules/assets/types";
import type { Facility } from "@/modules/facilities/types";
import type { Incident } from "@/modules/incidents/types";
import type { Maintenance } from "@/modules/maintenance/types";
import type { User } from "@/modules/users/types";
import type { WorkOrder } from "@/modules/work-orders/types";

export interface ReportingQuery {
  asOf?: string;
  facilityId?: string;
}

export interface ReportingKpis {
  activeFacilities: number;
  inactiveFacilities: number;
  totalFacilities: number;
  activeAssets: number;
  totalAssets: number;
  assetsOperationalPercent: number | null;
  assetsInPoorCondition: number;
  activeWorkforce: number;
  totalUsers: number;
  openWorkOrders: number;
  workOrdersCreatedToday: number;
  workOrdersDueToday: number;
  overdueWorkOrders: number;
  criticalIncidents: number;
  criticalIncidentsUnassigned: number;
  incidentsNeedingWorkOrder: number;
  maintenanceBacklog: number;
  overdueMaintenance: number;
  maintenanceOnHold: number;
  workOrdersOnHold: number;
}

export interface ReportingListItem {
  module:
    | "users"
    | "facilities"
    | "assets"
    | "incidents"
    | "maintenance"
    | "work-orders";
  entityId: string;
  title: string;
  status?: string;
  priority?: string;
  facilityId?: string;
  meta?: string;
  reportedAt?: string;
  tone?: "neutral" | "info" | "success" | "warning" | "danger";
}

export interface ReportingProjections {
  criticalIncidents: ReportingListItem[];
  overdueWorkOrders: ReportingListItem[];
  maintenanceAttention: ReportingListItem[];
  blockedItems: ReportingListItem[];
  latestOpenWorkOrders: ReportingListItem[];
  latestActiveMaintenance: ReportingListItem[];
}

export type ReportingHealthBand = "healthy" | "watch" | "critical";

export interface ReportingHealth {
  band: ReportingHealthBand;
  score: number;
  summary: string;
}

/**
 * Platform-neutral reporting DTO.
 * Consumed by Dashboard, Reports, Exports, Executive views, etc.
 */
export interface ReportingSnapshot {
  asOf: string;
  facilityId?: string;
  currentUserId?: string;
  users: User[];
  facilities: Facility[];
  assets: Asset[];
  incidents: Incident[];
  maintenance: Maintenance[];
  workOrders: WorkOrder[];
  kpis: ReportingKpis;
  projections: ReportingProjections;
  health: ReportingHealth;
}
