/**
 * Phase 25 — Work WIP default and Maintenance navigation retirement context.
 *
 * WIP default uses existing Maintenance active workflow statuses via
 * list filter status=active (server-side, single fetch).
 */

import { MAINTENANCE_ACTIVE_WORKFLOW_STATUSES } from "@/modules/maintenance/constants";
import type { MaintenanceStatus } from "@/modules/maintenance/types";

/** Statuses included when Work list defaults to active/WIP scope. */
export const WORK_WIP_STATUS_FILTER = {
  param: "active" as const,
  statuses: MAINTENANCE_ACTIVE_WORKFLOW_STATUSES as MaintenanceStatus[],
  note: "requested, triaged, scheduled, in_progress, on_hold — excludes completed/cancelled",
} as const;

export const MAINTENANCE_NAVIGATION_RETIREMENT_PHASE = 25 as const;

export const MAINTENANCE_NAV_OPERATIONAL_CONTEXT = {
  canonicalWorkSurface: "/work",
  canonicalIssueSurface: "/issues",
  legacyMaintenanceSurface: "/maintenance",
  note: "Maintenance removed from primary FM navigation; /maintenance remains for compatibility deep links.",
} as const;

export const MAINTENANCE_NAV_COMPAT = [
  "SECONDARY_NAV_ITEMS legacy maintenance entry",
  "LEGACY_LAYER_MODULES for /maintenance breadcrumb resolution",
  "ARCHETYPE_BY_HREF /maintenance operational-list",
  "isOperationsPath includes /maintenance",
  "deep links /maintenance?id=MNT-*",
  "MaintenanceService / MaintenanceRepository unchanged",
] as const;
