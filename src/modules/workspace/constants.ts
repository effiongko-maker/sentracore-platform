import type { WorkspaceQuickAction } from "./types";

export const WORKSPACE_QUICK_ACTIONS: WorkspaceQuickAction[] = [
  {
    id: "report-incident",
    title: "Report Incident",
    description: "Log a safety, security, or equipment issue.",
    href: "/incidents",
    icon: "incident",
  },
  {
    id: "request-maintenance",
    title: "Request Maintenance",
    description: "Raise a maintenance request.",
    href: "/maintenance",
    icon: "maintenance",
  },
  {
    id: "create-work-order",
    title: "Create Work Order",
    description: "Assign work to a technician.",
    href: "/work-orders",
    icon: "workOrder",
  },
  {
    id: "register-asset",
    title: "Register Asset",
    description: "Add equipment to your estate inventory.",
    href: "/assets",
    icon: "asset",
  },
  {
    id: "manage-facilities",
    title: "Manage Facilities",
    description: "Open your facilities directory.",
    href: "/facilities",
    icon: "facility",
  },
  {
    id: "operations-dashboard",
    title: "Operations Dashboard",
    description: "View live operational health.",
    href: "/dashboards",
    icon: "dashboard",
  },
];

export const WORKSPACE_ACTIVITY_LIMIT = 8;
export const WORKSPACE_SCHEDULE_LIMIT = 6;
