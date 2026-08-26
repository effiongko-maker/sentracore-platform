/**
 * Active (non-terminal) statuses for operational workload derivation.
 * Keep aligned with Workspace “My Work” open sets.
 */

export const ACTIVE_WORK_ORDER_STATUSES = new Set([
  "draft",
  "open",
  "assigned",
  "in_progress",
  "on_hold",
]);

export const ACTIVE_INCIDENT_STATUSES = new Set([
  "reported",
  "triaged",
  "investigating",
  "contained",
]);

export const ACTIVE_MAINTENANCE_STATUSES = new Set([
  "requested",
  "triaged",
  "scheduled",
  "in_progress",
  "on_hold",
]);

/** Workspace My Work historically excluded draft WOs — keep that narrower set. */
export const WORKSPACE_ASSIGNED_WORK_ORDER_STATUSES = new Set([
  "open",
  "assigned",
  "in_progress",
  "on_hold",
]);
