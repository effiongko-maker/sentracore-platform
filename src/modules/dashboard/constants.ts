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
    title: "Operational health",
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
    description: "Latest open work and active maintenance",
    order: 4,
  },
  estate_baseline: {
    title: "Estate baseline",
    description: "Facilities, assets, and users",
    order: 5,
  },
  quick_actions: {
    title: "Quick actions",
    description: "Jump into common operational workflows",
    order: 6,
  },
};

export const DASHBOARD_ACTION_ROUTES: Record<string, string> = {
  "create-incident": "/incidents",
  "create-work-order": "/work-orders",
  "create-maintenance": "/maintenance",
  "view-facilities": "/facilities",
};

export const DASHBOARD_MODULE_ROUTES: Record<string, string> = {
  users: "/users",
  facilities: "/facilities",
  assets: "/assets",
  incidents: "/incidents",
  maintenance: "/maintenance",
  "work-orders": "/work-orders",
};
