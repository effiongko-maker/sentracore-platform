/**
 * Financial domain foundation — Phase 12.
 *
 * Types / documentation only. No persistence, UI, payment processing, or approval engines.
 *
 * Three distinct flows:
 *   A. Non-reimbursable (contractual) CostRecord
 *   B. Reimbursable CostRecord → CostSubmission → payment outcome
 *   C. ContractPaymentRecord (monthly contract payment to PayChex)
 *
 * ACTUAL ≠ SUBMITTED ≠ APPROVED ≠ RECEIVED
 *
 * @see MODEL.md
 */

import type { IssueAuthorityRole } from "../issues/authority";
import type { IssueExecutionKind } from "../issues/types";

/** ISO currency code — default operational currency is OPEN. */
export type FinancialCurrencyCode = string;

/**
 * Cost class — contractual vs NCC-reimbursable.
 * Do not assume one operational activity has a single class; use multiple CostRecords.
 */
export type CostClass = "non_reimbursable" | "reimbursable";

/**
 * Origin of a cost (conceptual — not an accounting journal source).
 * Exact category taxonomy is OPEN.
 */
export type CostOrigin =
  | "contractual_obligation"
  | "facility_expenditure"
  | "consumable"
  | "project"
  | "manual"
  | "other";

/**
 * Optional links to operational / execution context.
 * All optional — never invent fake links.
 */
export type FinancialOperationalRefs = {
  /** Issue lens id when known (`issue:request:*` | `issue:maintenance:*` | `issue:incident:*`). */
  issueId?: string;
  requestId?: string;
  maintenanceId?: string;
  /** Only when genuinely relevant — Incident is specialised, not mandatory. */
  incidentId?: string;
  workOrderId?: string;
  /**
   * Future Job Order id — reserved only.
   * Job Order remains unimplemented; do not emit as if live.
   */
  jobOrderId?: string;
  facilityId?: string;
  contractId?: string;
};

/**
 * Cost incurred by PayChex (operational spend).
 * Not a journal entry. Not reimbursement state. Not contract payment.
 */
export type CostRecord = {
  /** Future id when persisted — not allocated in Phase 12. */
  id?: string;
  /** Human/reference code when known. */
  reference?: string;
  /** Category label — exact taxonomy OPEN. */
  category?: string;
  costClass: CostClass;
  /** What PayChex actually spent. Never overwritten by submitted amount. */
  actualAmount: number;
  currency: FinancialCurrencyCode;
  incurredAt?: string;
  description?: string;
  origin?: CostOrigin;
  /** Whether this cost is eligible for NCC reimbursement submission. */
  reimbursementEligible: boolean;
  refs?: FinancialOperationalRefs;
  /** Optional link to a CostSubmission when reimbursable path is used. */
  costSubmissionId?: string;
  createdAt?: string;
  createdByUserId?: string;
  notes?: string;
};

/**
 * How markup is represented on a reimbursable submission.
 * Calculation policy is OPEN — store values; do not invent universal %.
 */
export type MarkupRepresentation = {
  /** Fixed commercial markup amount (currency units). */
  markupAmount?: number;
  /** Percentage markup when that is the commercial form. */
  markupRatePercent?: number;
  /** Explicit none — no markup applied. */
  noMarkup?: boolean;
};

/**
 * Financial submission / reimbursement state — independent of operational status.
 * Candidates for a future workflow; several semantics remain OPEN.
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
  /**
   * @deprecated Prefer under_review. Retained for Phase ≤11 CostSubmissionContract compatibility.
   */
  | "awaiting_approval"
  /**
   * @deprecated Prefer partially_paid or paid. Retained for compatibility.
   */
  | "payment_pending";

/**
 * Payment outcome for a reimbursement submission — not payment processing.
 */
export type ReimbursementPaymentOutcome =
  | "unpaid"
  | "partially_paid"
  | "fully_paid";

/**
 * NCC-reimbursable cost submission package.
 *
 * Preserves actualAmount, markup, and submittedAmount independently.
 * Approval and payment amounts may differ from submitted.
 */
export type CostSubmission = {
  id?: string;
  /** CostRecord this submission packages (when linked). */
  costRecordId?: string;
  refs?: FinancialOperationalRefs;
  /** Execution instrument context when applicable. */
  executionKind?: IssueExecutionKind;
  executionId?: string;
  currency: FinancialCurrencyCode;

  /** Amount actually incurred by PayChex (SoT for cost). */
  actualAmount: number;
  markup?: MarkupRepresentation;
  /** Amount presented to NCC for reimbursement. */
  submittedAmount: number;
  /** Amount NCC approved — may differ from submitted (OPEN rules). */
  approvedAmount?: number;
  /** Amount received as payment. */
  receivedAmount?: number;
  /** Derived conceptual outstanding — not a second SoT when both submitted/approved+received known. */
  outstandingAmount?: number;

  status: CostSubmissionStatus;
  paymentOutcome?: ReimbursementPaymentOutcome;

  /**
   * Conceptual roles involved — not wired to engines.
   * Client/NCC APR ≠ internal approval ≠ payment status.
   */
  authorityRoles?: IssueAuthorityRole[];
  notes?: string;
  openDecisions?: string[];
};

/**
 * Monthly / periodic contract payment owed to PayChex.
 * Distinct from reimbursement. Not an expense submission.
 */
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
  /** Contract / commercial agreement reference — naming OPEN. */
  contractReference?: string;
  /** Period covered (e.g. calendar month) — exact encoding OPEN. */
  period?: string;
  periodStart?: string;
  periodEnd?: string;
  currency: FinancialCurrencyCode;
  /** Amount contractually expected — do not hard-code in code. */
  expectedAmount: number;
  /** Amount submitted / invoiced when known. */
  submittedAmount?: number;
  invoiceReference?: string;
  submittedAt?: string;
  /** Amount received. */
  receivedAmount?: number;
  receivedAt?: string;
  outstandingAmount?: number;
  status: ContractPaymentStatus;
  facilityId?: string;
  notes?: string;
};

/**
 * Conceptual grouping only — not a required persisted super-entity.
 */
export type FinancialRecordKind = "cost" | "cost_submission" | "contract_payment";

/**
 * @deprecated Prefer CostSubmission. Alias retained for Issue-module imports.
 * Maps legacy field names onto the Phase 12 submission contract.
 */
export type CostSubmissionContract = {
  id?: string;
  executionKind?: IssueExecutionKind;
  executionId?: string;
  issueId?: string;
  facilityId?: string;
  currency?: string;
  /** @deprecated Prefer actualAmount on CostSubmission */
  actualCost?: number;
  markupAmount?: number;
  markupRate?: number;
  submittedAmount?: number;
  approvedAmount?: number;
  /** @deprecated Prefer receivedAmount */
  paymentReceivedAmount?: number;
  status: CostSubmissionStatus;
  authorityRoles?: IssueAuthorityRole[];
  notes?: string;
  openDecisions?: string[];
};
