import type { DashboardSectionId } from "./types";

export const DASHBOARD_SECTION_META: Record<
  DashboardSectionId,
  { title: string; description?: string; order: number }
> = {
  context: {
    title: "Operational health",
    description: "How the operation is performing overall",
    order: 1,
  },
  needs_attention: {
    title: "What needs attention now?",
    description: "Top issues based on urgency and impact",
    order: 2,
  },
  health_strip: {
    title: "Operational health metrics",
    description: "Live pulse across the estate",
    order: 3,
  },
  work_in_motion: {
    title: "Work in motion",
    description: "Active work across your operations",
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
  "log-issue": "/issues",
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
  work: "/work",
  "work-orders": "/work-orders",
};
