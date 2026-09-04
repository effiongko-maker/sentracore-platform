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

export type {
  OperationalNotification,
  OperationalNotificationFeed,
  OperationalNotificationKind,
} from "./utils/deriveOperationalNotifications";

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

/** Shared model: Requires attention queue (cross-domain intervention). */
export interface AttentionModel {
  total: number;
  /** Cross-domain attention matters with severity === critical (not Critical Work KPI). */
  criticalCount: number;
  visible: AttentionMatter[];
  viewAllHref?: string;
  viewAllLabel?: string;
  /**
   * True when a major attention source domain failed/timed out.
   * Queue may omit matters; never treat as a verified empty queue.
   */
  incomplete?: boolean;
}

/**
 * Per-domain load outcome for Home composition.
 * false = unavailable (timeout/error) — must not be treated as an empty success.
 */
export interface WorkspaceDomainAvailability {
  workOrders: boolean;
  incidents: boolean;
  maintenance: boolean;
}

export interface OrganisationalPulse {
  /**
   * Live — open Work in operational flow (maintenance backlog).
   * null when Maintenance domain is unavailable.
   */
  openWork: number | null;
  /**
   * Live — high/critical priority open Work.
   * null when Maintenance domain is unavailable.
   */
  criticalWork: number | null;
  /** null when Work Orders domain is unavailable. */
  openWorkOrders: number | null;
  /** Same value as openWork — retained for transitional consumers. */
  openMaintenance: number | null;
  /** Historical — open legacy Incident records (compatibility only). */
  legacyOpenIncidents: number | null;
  /** Historical — critical/high open legacy Incidents (compatibility only). */
  legacyCriticalIncidents: number | null;
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
  /** Cross-domain intervention queue — distinct from pulse.criticalWork KPI. */
  attention: AttentionModel;
  pulse: OrganisationalPulse;
  /** Core domain availability used to compose this snapshot. */
  domains: WorkspaceDomainAvailability;
  quickActions: WorkspaceQuickAction[];
  myWork: WorkspaceWorkSummary[];
  schedule: WorkspaceScheduleItem[];
  activity: WorkspaceActivityItem[];
}
