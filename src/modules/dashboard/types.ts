import type { ReportingSnapshot } from "@/services/reporting/types";

export type DashboardModuleRef =
  | "users"
  | "facilities"
  | "assets"
  | "incidents"
  | "maintenance"
  | "work-orders";

export type DashboardCardTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

export type DashboardTrend = "up" | "down" | "neutral";

export type DashboardWidgetKind =
  | "kpi_stat"
  | "entity_list"
  | "attention_queue"
  | "health_summary"
  | "quick_action";

export type DashboardSectionId =
  | "context"
  | "health_strip"
  | "needs_attention"
  | "work_in_motion"
  | "estate_baseline"
  | "quick_actions";

export interface DashboardQuery {
  asOf?: string;
  facilityId?: string;
}

/**
 * Live KPI pulse mirrored from ReportingSnapshot.kpis.
 * Presentation-only enrichment — calculations stay in ReportingService.
 */
export interface DashboardPulse {
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

/** Frozen — DashboardService returns only this. UI renders only this. */
export interface DashboardSnapshot {
  asOf: string;
  facilityId?: string;
  context: {
    currentUserId?: string;
    title?: string;
    subtitle?: string;
  };
  health?: {
    band: "healthy" | "watch" | "critical";
    score?: number;
    summary?: string;
  };
  /** Authoritative KPI counts for overview composition. */
  pulse?: DashboardPulse;
  sections: DashboardSection[];
}

export interface DashboardSection {
  id: DashboardSectionId;
  title: string;
  description?: string;
  order: number;
  cards: DashboardCard[];
}

export interface DashboardCard {
  id: string;
  widgetId: string;
  kind: DashboardWidgetKind;
  tone: DashboardCardTone;
  title: string;
  description?: string;
  primaryValue?: string | number;
  secondaryLabel?: string;
  trend?: DashboardTrend;
  trendIsPositive?: boolean;
  emptyMessage?: string;
  module?: DashboardModuleRef;
  items?: DashboardCardItem[];
  /** Quick actions: UI maps actionId → navigation. No href here. */
  actionId?: string;
}

export interface DashboardCardItem {
  module: DashboardModuleRef;
  entityId: string;
  title: string;
  status?: string;
  priority?: string;
  facilityId?: string;
  meta?: string;
  reportedAt?: string;
  tone?: DashboardCardTone;
}

export interface DashboardWidgetDefinition {
  id: string;
  sectionId: DashboardSectionId;
  kind: DashboardWidgetKind;
  title: string;
  description?: string;
  module?: DashboardModuleRef;
  order: number;
  resolve: (report: ReportingSnapshot) => DashboardCard | null;
}
