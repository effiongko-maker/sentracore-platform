/**
 * V1 protected-action registry — single source of action IDs.
 * Do not scatter these string literals in call sites.
 */

import type { AccessCapability } from "./capabilities";

export const PROTECTED_ACTION_IDS = [
  "finance.cost.unlock_edit",
  "finance.claim.edit_submitted",
  "finance.authorization.revise",
  "finance.payment.correct",
  "approval.record_decision",
] as const;

export type ProtectedActionId = (typeof PROTECTED_ACTION_IDS)[number];

export type ProtectedActionDefinition = {
  id: ProtectedActionId;
  /** Capability required before protected authority is considered. */
  baseCapability: AccessCapability;
  entityType: string;
  description: string;
};

export const PROTECTED_ACTIONS: Record<
  ProtectedActionId,
  ProtectedActionDefinition
> = {
  "finance.cost.unlock_edit": {
    id: "finance.cost.unlock_edit",
    baseCapability: "finance.create",
    entityType: "cost_record",
    description: "Edit a cost record locked by a non-draft reimbursement claim",
  },
  "finance.claim.edit_submitted": {
    id: "finance.claim.edit_submitted",
    baseCapability: "finance.create",
    entityType: "cost_submission",
    description: "Edit consequential fields on a submitted reimbursement claim",
  },
  "finance.authorization.revise": {
    id: "finance.authorization.revise",
    baseCapability: "finance.authorize",
    entityType: "reimbursement_authorization",
    description: "Revise an existing reimbursement authorization",
  },
  "finance.payment.correct": {
    id: "finance.payment.correct",
    baseCapability: "finance.pay",
    entityType: "reimbursement_payment",
    description: "Correct an already-recorded reimbursement payment",
  },
  "approval.record_decision": {
    id: "approval.record_decision",
    baseCapability: "approvals.manage",
    entityType: "approval",
    description: "Record a client approval or rejection decision",
  },
};

export function isProtectedActionId(value: string): value is ProtectedActionId {
  return (PROTECTED_ACTION_IDS as readonly string[]).includes(value);
}

export function getProtectedActionDefinition(
  id: ProtectedActionId
): ProtectedActionDefinition {
  return PROTECTED_ACTIONS[id];
}

/** Payload keys used on API/service requests (never forwarded as passwords). */
export const PROTECTED_PROOF_KEYS = {
  action: "_protectedAction",
  stepUpPassword: "_stepUpPassword",
  authorityMode: "_authorityMode",
  authorityLabel: "_authorityLabel",
  clientRequestId: "_clientRequestId",
} as const;
