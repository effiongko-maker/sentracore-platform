import type { WorkspaceQuickAction } from "./types";

export const WORKSPACE_QUICK_ACTIONS: WorkspaceQuickAction[] = [
  {
    id: "report-incident",
    title: "Report Incident",
    description: "Log a safety, security, or equipment issue.",
    href: "/occupant-requests?type=incident",
    icon: "incident",
  },
  {
    id: "request-maintenance",
    title: "Request Maintenance",
    description: "Raise a maintenance request.",
    href: "/occupant-requests?type=maintenance",
    icon: "maintenance",
  },
  {
    id: "create-work-order",
    title: "Work Orders",
    description: "Open the work orders queue.",
    href: "/work-orders",
    icon: "workOrder",
  },
  {
    id: "register-asset",
    title: "Assets",
    description: "Open the asset register.",
    href: "/assets",
    icon: "asset",
  },
  {
    id: "manage-facilities",
    title: "Facilities",
    description: "Open the facilities directory.",
    href: "/facilities",
    icon: "facility",
  },
  {
    id: "operations-dashboard",
    title: "Dashboard",
    description: "View live operational health and KPIs.",
    href: "/dashboards",
    icon: "dashboard",
  },
];

export const WORKSPACE_ACTIVITY_LIMIT = 8;
export const WORKSPACE_SCHEDULE_LIMIT = 6;
