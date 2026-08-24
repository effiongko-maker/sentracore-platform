import type { WorkspaceQuickAction } from "./types";

export const WORKSPACE_QUICK_ACTIONS: WorkspaceQuickAction[] = [
  {
    id: "report-incident",
    title: "Report an incident",
    description: "Record and route a new incident",
    href: "/occupant-requests?type=incident",
    icon: "incident",
  },
  {
    id: "request-maintenance",
    title: "Request maintenance",
    description: "Raise work that needs attention",
    href: "/occupant-requests?type=maintenance",
    icon: "maintenance",
  },
  {
    id: "create-work-order",
    title: "Open work orders",
    description: "Review active and pending work",
    href: "/work-orders",
    icon: "workOrder",
  },
  {
    id: "register-asset",
    title: "Browse assets",
    description: "View and manage operational assets",
    href: "/assets",
    icon: "asset",
  },
  {
    id: "manage-facilities",
    title: "Browse facilities",
    description: "Explore the organisation's locations",
    href: "/facilities",
    icon: "facility",
  },
  {
    id: "operations-dashboard",
    title: "View dashboard",
    description: "See current operational state",
    href: "/dashboards",
    icon: "dashboard",
  },
];

export const WORKSPACE_ACTIVITY_LIMIT = 8;
export const WORKSPACE_SCHEDULE_LIMIT = 6;
