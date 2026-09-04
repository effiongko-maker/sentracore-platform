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

/**
 * Bounded newest/active pool for Home snapshot composition.
 * Avoids full-register loadAllPages on the first-paint critical path.
 */
export const WORKSPACE_HOME_POOL_SIZE = 100;

/**
 * Per-domain ceiling for Home list fetches.
 * On timeout, the domain is treated as unavailable (`ok: false`) using the
 * existing degraded-snapshot path — same as a rejected request.
 */
export const WORKSPACE_HOME_DOMAIN_TIMEOUT_MS = 25_000;
