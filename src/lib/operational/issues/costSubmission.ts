/**
 * Future cost submission / reimbursement contract (Phase 6).
 * Conceptual types only — no Finance sheet, UI, or payment processing.
 *
 * Financial SoT is the submission package, NOT WorkOrder/JobOrder status.
 *
 * Flow: actual cost → markup → submitted amount → approval/submission → payment received
 */

import type { IssueExecutionKind } from "./types";
import type { IssueAuthorityRole } from "./authority";

/** Lifecycle of a future cost submission package. */
export type CostSubmissionStatus =
  | "draft"
  | "submitted"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "payment_pending"
  | "paid"
  | "cancelled";

/**
 * Application-level contract for a future cost submission record.
 * Not persisted in Phase 6.
 */
export type CostSubmissionContract = {
  /** Future id when persisted — not allocated now. */
  id?: string;
  /** Execution instrument context (WO or future JO). */
  executionKind?: IssueExecutionKind;
  executionId?: string;
  /** Related Issue lens id when known (issue:request:* | issue:maintenance:* | …). */
  issueId?: string;
  facilityId?: string;
  currency?: string;
  /** Actual cost incurred. */
  actualCost?: number;
  /** Markup applied (amount or rate — OPEN which; store both placeholders). */
  markupAmount?: number;
  markupRate?: number;
  /** Amount submitted for approval / reimbursement. */
  submittedAmount?: number;
  /** Amount approved (may differ — OPEN rules). */
  approvedAmount?: number;
  /** Amount received as payment. */
  paymentReceivedAmount?: number;
  status: CostSubmissionStatus;
  /** Conceptual approvers involved — not wired to engines. */
  authorityRoles?: IssueAuthorityRole[];
  notes?: string;
  /** OPEN product fields intentionally omitted until defined. */
  openDecisions?: string[];
};

export const COST_SUBMISSION_FLOW = [
  "actual_cost",
  "markup",
  "submitted_amount",
  "approval_submission",
  "payment_received",
] as const;

export const COST_SUBMISSION_OPEN_DECISIONS = [
  "Entity name and persistence store for cost submissions",
  "Markup calculation rules",
  "Which authority roles unlock submission vs payment",
  "Whether Client/NCC APR participates in reimbursement vs internal only",
] as const;
