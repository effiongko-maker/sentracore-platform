import type { WorkspaceQuickAction } from "./types";

export const WORKSPACE_QUICK_ACTIONS: WorkspaceQuickAction[] = [
  {
    id: "log-issue",
    title: "Log an issue",
    description: "Record what needs attention",
    href: "/issues",
    icon: "issue",
  },
  {
    id: "request-maintenance",
    title: "Request maintenance",
    description: "Raise work requiring attention",
    href: "/occupant-requests?type=maintenance",
    icon: "maintenance",
  },
  {
    id: "create-work-order",
    title: "Open work orders",
    description: "Review assigned and in-progress work",
    href: "/work-orders",
    icon: "workOrder",
  },
  {
    id: "manage-facilities",
    title: "Browse facilities",
    description: "View and manage operational locations",
    href: "/facilities",
    icon: "facility",
  },
  {
    id: "register-asset",
    title: "Browse assets",
    description: "View and manage operational assets",
    href: "/assets",
    icon: "asset",
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
