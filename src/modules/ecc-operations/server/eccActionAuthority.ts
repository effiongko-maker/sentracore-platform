import { ECC_CAPABILITIES, type EccCapability } from "@/modules/ecc-operations/types";

/**
 * Per-action authority for /api/ecc-operations. Every action declares the
 * capability it needs. Reads are view-gated; each write needs its own explicit
 * grant IN ADDITION to view. Unknown actions fail closed (delete-level).
 */
export const ECC_ACTION_CAPABILITY = {
  // ── reads (view) ─────────────────────────────────────────────────────────
  getFoundationStatus: ECC_CAPABILITIES.view,
  getOverview: ECC_CAPABILITIES.view,
  getOperationalDate: ECC_CAPABILITIES.view,
  listDailyOps: ECC_CAPABILITIES.view,
  getDailyOps: ECC_CAPABILITIES.view,
  listIssues: ECC_CAPABILITIES.view,
  getIssue: ECC_CAPABILITIES.view,
  listRequests: ECC_CAPABILITIES.view,
  getRequest: ECC_CAPABILITIES.view,
  listReportingDimensions: ECC_CAPABILITIES.view,
  getReportingSnapshot: ECC_CAPABILITIES.view,
  getPeopleSnapshot: ECC_CAPABILITIES.view,
  getFinanceSnapshot: ECC_CAPABILITIES.view,
  listAuditEvents: ECC_CAPABILITIES.view,
  getEntityAuditTrail: ECC_CAPABILITIES.view,
  // ── create ───────────────────────────────────────────────────────────────
  createDailyOps: ECC_CAPABILITIES.create,
  raiseIssueFromDailyOps: ECC_CAPABILITIES.create,
  raiseRequestFromDailyOps: ECC_CAPABILITIES.create,
  createIssue: ECC_CAPABILITIES.create,
  createRequest: ECC_CAPABILITIES.create,
  // ── edit / progress ──────────────────────────────────────────────────────
  linkIssueAndRequest: ECC_CAPABILITIES.edit,
  transitionIssue: ECC_CAPABILITIES.edit,
  appendIssueAction: ECC_CAPABILITIES.edit,
  transitionRequest: ECC_CAPABILITIES.edit,
  appendRequestAction: ECC_CAPABILITIES.edit,
  // ── roster / shifts / attendance ─────────────────────────────────────────
  createPerson: ECC_CAPABILITIES.managePeople,
  ensureCurrentShift: ECC_CAPABILITIES.managePeople,
  setCurrentShiftAssignments: ECC_CAPABILITIES.managePeople,
  signInPerson: ECC_CAPABILITIES.managePeople,
  signOutPerson: ECC_CAPABILITIES.managePeople,
  // ── ECC finance (separate from Platform Finance) ─────────────────────────
  setFinanceBudget: ECC_CAPABILITIES.manageFinance,
  createFinanceTransaction: ECC_CAPABILITIES.manageFinance,
  createFinanceCommitment: ECC_CAPABILITIES.manageFinance,
  updateFinanceCommitmentStatus: ECC_CAPABILITIES.manageFinance,
  // ── destructive ──────────────────────────────────────────────────────────
  deleteIssue: ECC_CAPABILITIES.delete,
} as const satisfies Record<string, EccCapability>;

export type EccActionName = keyof typeof ECC_ACTION_CAPABILITY;

/** Retired actions are refused outright (no capability makes them valid). */
export const ECC_RETIRED_ACTIONS: readonly string[] = ["importLocalState"];

export function capabilityForEccAction(action: string): EccCapability | null {
  return Object.prototype.hasOwnProperty.call(ECC_ACTION_CAPABILITY, action)
    ? ECC_ACTION_CAPABILITY[action as EccActionName]
    : null;
}
