export type WorkspaceModuleRef =
  | "incidents"
  | "maintenance"
  | "work-orders"
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

/** Sole contract between WorkspaceService and Workspace UI. */
export interface WorkspaceSnapshot {
  asOf: string;
  currentUser: {
    id?: string;
    name?: string;
  };
  quickActions: WorkspaceQuickAction[];
  myWork: WorkspaceWorkSummary[];
  schedule: WorkspaceScheduleItem[];
  activity: WorkspaceActivityItem[];
}
