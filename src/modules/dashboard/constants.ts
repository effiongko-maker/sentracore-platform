import type { DashboardSectionId } from "./types";

export const DASHBOARD_SECTION_META: Record<
  DashboardSectionId,
  { title: string; description?: string; order: number }
> = {
  context: {
    title: "Today",
    description: "Operational context for this session",
    order: 1,
  },
  health_strip: {
    title: "Health strip",
    description: "Live pulse across the estate",
    order: 2,
  },
  needs_attention: {
    title: "Needs attention",
    description: "Critical, overdue, or blocked items",
    order: 3,
  },
  work_in_motion: {
    title: "Work in motion",
    description: "Active execution across work orders and maintenance",
    order: 4,
  },
  estate_baseline: {
    title: "Estate baseline",
    description: "Facilities, assets, and workforce capacity",
    order: 5,
  },
  quick_actions: {
    title: "Quick actions",
    description: "Jump into common operational workflows",
    order: 6,
  },
};

export const DASHBOARD_ACTION_ROUTES: Record<string, string> = {
  "create-work-order": "/work-orders",
  "report-incident": "/incidents",
  "schedule-maintenance": "/maintenance",
  "view-facilities": "/facilities",
  "view-assets": "/assets",
  "view-users": "/users",
};

export const DASHBOARD_MODULE_ROUTES: Record<string, string> = {
  users: "/users",
  facilities: "/facilities",
  assets: "/assets",
  incidents: "/incidents",
  maintenance: "/maintenance",
  "work-orders": "/work-orders",
};
