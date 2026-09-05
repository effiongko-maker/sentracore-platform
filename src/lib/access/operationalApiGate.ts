/**
 * Map operational Apps Script proxy actions → existing V1 capabilities.
 * Does not invent capabilities; ops.submit has no distinct proxy action yet.
 */

import type { AccessCapability } from "./capabilities";

export const OPERATIONAL_PROXY_RESOURCES = [
  "work-orders",
  "maintenance",
  "incidents",
  "approvals",
  "assets",
  "facilities",
  "master-data",
] as const;

export type OperationalProxyResource =
  (typeof OPERATIONAL_PROXY_RESOURCES)[number];

const READ_ACTIONS = new Set([
  "getAll",
  "getById",
  "getFilterCatalog",
  "listCatalog",
  "buildInfo",
  "getLocationCatalog",
  "getEntitySummary",
  "getSnapshot",
  "diagnostics",
]);

const CREATE_ACTIONS = new Set(["create", "createFromMaintenance"]);

const EDIT_ACTIONS = new Set(["update", "deactivate", "delete"]);

/**
 * Resolve the capability required for an operational proxy action.
 *
 * Work Orders / Maintenance / Incidents / Assets / Facilities / Master Data:
 *   read → ops.view | create* → ops.create | update/deactivate → ops.edit
 * Approvals:
 *   read → ops.view | writes → approvals.manage
 *
 * Unknown actions default to the stricter write capability for that resource
 * so new mutation verbs cannot slip through as reads.
 */
export function capabilityForOperationalProxyAction(
  resource: OperationalProxyResource,
  action: string
): AccessCapability {
  const normalized = String(action || "getAll").trim();

  if (resource === "approvals") {
    if (READ_ACTIONS.has(normalized)) return "ops.view";
    return "approvals.manage";
  }

  if (READ_ACTIONS.has(normalized)) return "ops.view";
  if (CREATE_ACTIONS.has(normalized)) return "ops.create";
  if (EDIT_ACTIONS.has(normalized)) return "ops.edit";

  // Fail closed for unfamiliar verbs on operational registers.
  return "ops.edit";
}

/**
 * Requests queue proxy — reads use requests.view (NCC portal + FM).
 * Non-treatment writes use ops.create / ops.edit (treatment stays on server actions).
 */
export function capabilityForRequestsProxyAction(
  action: string
): AccessCapability {
  const normalized = String(action || "getAll").trim();
  if (READ_ACTIONS.has(normalized)) return "requests.view";
  if (CREATE_ACTIONS.has(normalized)) return "ops.create";
  if (EDIT_ACTIONS.has(normalized)) return "ops.edit";
  return "ops.edit";
}

/** True when the action mutates operational/approval records. */
export function isOperationalWriteAction(action: string): boolean {
  const normalized = String(action || "").trim();
  if (!normalized || READ_ACTIONS.has(normalized)) return false;
  return (
    CREATE_ACTIONS.has(normalized) ||
    EDIT_ACTIONS.has(normalized) ||
    !READ_ACTIONS.has(normalized)
  );
}
