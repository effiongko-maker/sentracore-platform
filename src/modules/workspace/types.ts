export type WorkspaceModuleRef =
  | "incidents"
  | "maintenance"
  | "work-orders"
  | "work"
  | "issues"
  | "assets"
  | "facilities"
  | "dashboards";

export type WorkspaceActivityKind =
  | "incident_reported"
  | "maintenance_requested"
  | "work_order_created";

export interface WorkspaceQuickAction {
  id: string;
  title: string;
  description: string;
  href: string;
  icon:
    | "issue"
    | "incident"
    | "maintenance"
    | "workOrder"
    | "asset"
    | "facility"
    | "dashboard";
}

export interface WorkspaceWorkSummary {
  id: string;
  label: string;
  count: number;
  href: string;
  emptyLabel: string;
}

export interface WorkspaceScheduleItem {
  id: string;
  module: WorkspaceModuleRef;
  entityId: string;
  title: string;
  meta: string;
  at: string;
}

export interface WorkspaceActivityItem {
  id: string;
  kind: WorkspaceActivityKind;
  module: WorkspaceModuleRef;
  entityId: string;
  title: string;
  summary: string;
  at: string;
}

export type OperationalStateTone = "stable" | "attention" | "critical" | "degraded";

export interface OperationalState {
  statement: string;
  tone: OperationalStateTone;
  subtext?: string;
}

/** A concrete matter behind the Home critical / attention headline. */
export interface AttentionMatter {
  id: string;
  severity: "critical" | "high";
  title: string;
  location: string;
  entityLabel: string;
  reason: string;
  actionLabel: string;
  href: string;
  entityId: string;
}

/** Shared model: headline count and Requires attention list. */
export interface AttentionModel {
  total: number;
  /** Subset with severity === critical (hero Critical tile). */
  criticalCount: number;
  visible: AttentionMatter[];
  viewAllHref?: string;
  viewAllLabel?: string;
}

export interface OrganisationalPulse {
  /** Live — open Work in operational flow (maintenance backlog). */
  openWork: number;
  /** Live — high/critical priority open Work. */
  criticalWork: number;
  openWorkOrders: number;
  /** Same value as openWork — retained for transitional consumers. */
  openMaintenance: number;
  /** Historical — open legacy Incident records (compatibility only). */
  legacyOpenIncidents: number;
  /** Historical — critical/high open legacy Incidents (compatibility only). */
  legacyCriticalIncidents: number;
  recentActivity: number;
}

/** Sole contract between WorkspaceService and Workspace UI. */
export interface WorkspaceSnapshot {
  asOf: string;
  currentUser: {
    id?: string;
    name?: string;
  };
  operationalState: OperationalState;
  /** Matters behind critical headline — Work/Issue operational queue. */
  attention: AttentionModel;
  pulse: OrganisationalPulse;
  quickActions: WorkspaceQuickAction[];
  myWork: WorkspaceWorkSummary[];
  schedule: WorkspaceScheduleItem[];
  activity: WorkspaceActivityItem[];
}
