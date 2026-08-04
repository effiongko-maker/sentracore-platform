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
  activeAssets: number;
  openWorkOrders: number;
  workOrdersDueToday: number;
  overdueWorkOrders: number;
  criticalIncidents: number;
  maintenanceBacklog: number;
  overdueMaintenance: number;
  activeWorkforce: number;
  assetsInPoorCondition: number;
  incidentsNeedingWorkOrder: number;
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
  meta?: string;
  reportedAt?: string;
  tone?: "neutral" | "info" | "success" | "warning" | "danger";
}

export interface ReportingProjections {
  criticalIncidents: ReportingListItem[];
  openWorkOrders: ReportingListItem[];
  overdueWorkOrders: ReportingListItem[];
  upcomingMaintenance: ReportingListItem[];
  inProgressWorkOrders: ReportingListItem[];
  inProgressMaintenance: ReportingListItem[];
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
