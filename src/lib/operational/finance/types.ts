/**
 * Financial domain foundation.
 *
 * Types, persistence mapping, and documentation — see MODEL.md.
 *
 * Conceptual chain:
 *   Work / Work Order / Job Order → CostRecord → CostSubmission → Authority/Approval → Payment
 *
 * CostRecord answers: "What did this cost us?"
 * CostSubmission answers: "What are we claiming?"
 * Approval answers: "What was authorized?"
 * Payment answers: "What was received?"
 *
 * @see MODEL.md
 */

import type { IssueAuthorityRole } from "../issues/authority";
import type { IssueExecutionKind } from "../issues/types";

/** ISO currency code — default operational currency is NGN. */
export type FinancialCurrencyCode = string;

/**
 * Canonical cost category keys.
 * User-facing labels: {@link COST_CATEGORY_LABELS} in costRecord.ts
 */
export type CostCategory =
  | "diesel_fuel"
  | "materials"
  | "spare_parts"
  | "labour"
  | "transportation"
  | "equipment"
  | "consumables"
  | "service"
  | "other";

/**
 * Explicit financial classification — never inferred from category, WO, or amount.
 * Initial state may legitimately be `unknown`.
 */
export type CostReimbursability = "unknown" | "reimbursable" | "non_reimbursable";

/**
 * Supporting / originating evidence for a CostRecord.
 * A valid CostRecord requires evidence with a non-empty reference.
 */
export type CostEvidence = {
  /** Primary audit reference (invoice no., receipt id, PO reference, etc.). */
  reference: string;
  /** Google Drive id when a receipt or invoice has been uploaded. */
  fileId?: string;
  /** Original filename of the uploaded evidence. */
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  /** Private Drive link. Access remains governed by the Drive file's sharing settings. */
  fileUrl?: string;
  /** Lightweight classifier — not an exhaustive taxonomy. */
  evidenceType?: string;
  /** Date on the supporting document when known (ISO date or datetime). */
  evidenceDate?: string;
  /** Vendor, supplier, or source of the cost. */
  vendorOrSource?: string;
  /** Secondary document / line reference when distinct from `reference`. */
  documentReference?: string;
};

/**
 * Cost incurred for facility operations.
 *
 * - Independent of CostSubmission, Approval, and Payment lifecycles.
 * - Work / Work Order / Job Order references are optional operational context.
 * - No markup, submission status, approval status, or payment fields.
 */
export type CostRecord = {
  /** Canonical cost identity (e.g. COST-2026-000001 when persisted). */
  costId: string;
  /** When the cost was recorded in SentraCore (ISO datetime). */
  recordedAt: string;

  /** Operational context — facility and location are required; execution links are optional. */
  facilityId: string;
  /** Operational place within/around the facility (free text). */
  location: string;
  departmentId?: string;
  /** Work backing store id (Maintenance / MNT-* in current architecture). */
  workId?: string;
  workOrderId?: string;
  /** Reserved — Job Order is not yet implemented. */
  jobOrderId?: string;

  description: string;
  category: CostCategory;
  /** Optional amount budgeted/planned for this cost when a budget exists. */
  budgetedAmount?: number;
  /** Authoritative incurred amount once confirmed. */
  actualAmount: number;
  currency: FinancialCurrencyCode;

  reimbursability: CostReimbursability;
  evidence: CostEvidence;

  /** User id of the person who recorded the cost. */
  recordedBy: string;
  notes?: string;
};

/**
 * @deprecated Phase ≤12 — use CostReimbursability on CostRecord instead.
 * Retained for CostSubmission documentation compatibility only.
 */
export type CostClass = "non_reimbursable" | "reimbursable";

/**
 * @deprecated Phase ≤12 origin taxonomy — prefer CostCategory on CostRecord.
 */
export type CostOrigin =
  | "contractual_obligation"
  | "facility_expenditure"
  | "consumable"
  | "project"
  | "manual"
  | "other";

/**
 * Optional links on submission packages (broader Issue lens refs).
 * CostRecord uses first-class optional fields instead of this bundle.
 */
export type FinancialOperationalRefs = {
  issueId?: string;
  requestId?: string;
  maintenanceId?: string;
  incidentId?: string;
  workOrderId?: string;
  jobOrderId?: string;
  facilityId?: string;
  contractId?: string;
};

/**
 * How markup is represented on a reimbursable submission package.
 * Policy-driven — no hard-coded rates in the domain layer.
 * Markup does NOT belong on CostRecord.
 */
export type MarkupRepresentation = {
  markupAmount?: number;
  markupRatePercent?: number;
  noMarkup?: boolean;
};

/**
 * Submission lifecycle — the submission's own state only.
 * Does NOT encode Approval authority decisions or Payment receipt.
 */
export type CostSubmissionLifecycleStatus =
  | "draft"
  | "submitted"
  | "queried"
  | "cancelled";

/**
 * @deprecated Finance UI pipeline stages spanning cost → submission → approval → payment.
 * Not the domain lifecycle on {@link CostSubmission} — use {@link CostSubmissionLifecycleStatus}.
 */
export type CostSubmissionStatus =
  | "draft"
  | "ready_for_submission"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "partially_paid"
  | "paid"
  | "cancelled"
  | "awaiting_approval"
  | "payment_pending";

/**
 * Payment reconciliation view — belongs to Payment / Approval cross-cut, not CostSubmission.
 * Used by pure helpers to reason about received vs authorized amounts.
 */
export type ReimbursementPaymentReconciliation = {
  /** Claim-side amount submitted for consideration. */
  claimAmount: number;
  /** Authorized amount from Approval domain when known. */
  authorizedAmount?: number;
  /** Received amount from Payment domain when known. */
  receivedAmount?: number;
};

export type ReimbursementPaymentOutcome =
  | "unpaid"
  | "partially_paid"
  | "fully_paid";

/**
 * Submission support package — distinct from per-cost {@link CostEvidence}.
 * "What documentation accompanies this claim/submission?"
 */
export type CostSubmissionPackage = {
  /** Primary reference for the submission package (cover sheet, batch ref, etc.). */
  reference?: string;
  /** Lightweight classifier — not an exhaustive taxonomy. */
  packageType?: string;
  /** Date on the package when known (ISO date or datetime). */
  packageDate?: string;
  notes?: string;
};

/**
 * Reimbursement / claim submission package referencing one or more CostRecords.
 *
 * - Does NOT duplicate CostRecord.actualAmount as authoritative cost fact.
 * - Cost selection is explicit via `costRecordIds`.
 * - Approval and Payment remain separate domains (linked by id, not duplicated state).
 */
export type CostSubmission = {
  /** Canonical submission identity (e.g. SUB-2026-000001 when persisted). */
  submissionId: string;

  /** Explicit CostRecord selection — cardinality not restricted at domain layer. */
  costRecordIds: string[];

  /** Submission lifecycle — does not encode approval or payment. */
  status: CostSubmissionLifecycleStatus;

  currency: FinancialCurrencyCode;

  /**
   * Claim-side amount being presented for reimbursement consideration.
   * Distinct from underlying CostRecord.actualAmount totals.
   */
  claimAmount?: number;

  /** Policy-driven markup adjustment — rates are not hard-coded in domain. */
  markup?: MarkupRepresentation;

  /** Optional contextual metadata — not required for standalone facility costs. */
  facilityId?: string;
  departmentId?: string;
  /** Human-readable period/cycle label — not a hard-coded cadence rule. */
  periodLabel?: string;
  /** Extensible submission classification — no fixed enum until policy is established. */
  submissionKind?: string;

  /** Submission support package — distinct from per-cost evidence. */
  submissionPackage?: CostSubmissionPackage;

  /** Optional broader operational context (Issue lens refs). */
  refs?: FinancialOperationalRefs;
  executionKind?: IssueExecutionKind;
  executionId?: string;

  /** Relationship to Approval domain — not duplicated approval state. */
  approvalId?: string;

  /** Audit — who prepared and when. */
  createdAt: string;
  createdBy: string;
  /** When last sent for consideration (initial submit or resubmit). */
  submittedAt?: string;
  submittedBy?: string;
  /** When authority returned the submission for clarification. */
  queriedAt?: string;
  queryNotes?: string;

  notes?: string;

  /** @deprecated Use submissionId. Phase ≤12 alias. */
  id?: string;
  /** @deprecated Use costRecordIds. Phase ≤12 single-cost reference. */
  costRecordId?: string;
};

export type ContractPaymentStatus =
  | "expected"
  | "due"
  | "submitted"
  | "invoiced"
  | "approved"
  | "processing"
  | "received"
  | "outstanding"
  | "overdue"
  | "cancelled";

export type ContractPaymentRecord = {
  id?: string;
  contractReference?: string;
  period?: string;
  periodStart?: string;
  periodEnd?: string;
  currency: FinancialCurrencyCode;
  expectedAmount: number;
  submittedAmount?: number;
  invoiceReference?: string;
  submittedAt?: string;
  receivedAmount?: number;
  receivedAt?: string;
  outstandingAmount?: number;
  status: ContractPaymentStatus;
  facilityId?: string;
  notes?: string;
};

export type FinancialRecordKind = "cost" | "cost_submission" | "contract_payment";

/** @deprecated Prefer CostSubmission. Alias retained for Issue-module imports. */
export type CostSubmissionContract = {
  id?: string;
  executionKind?: IssueExecutionKind;
  executionId?: string;
  issueId?: string;
  facilityId?: string;
  currency?: string;
  actualCost?: number;
  markupAmount?: number;
  markupRate?: number;
  submittedAmount?: number;
  approvedAmount?: number;
  paymentReceivedAmount?: number;
  status: CostSubmissionStatus;
  authorityRoles?: IssueAuthorityRole[];
  notes?: string;
  openDecisions?: string[];
};
