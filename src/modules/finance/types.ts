import type { Approval } from "@/modules/approvals/types";
import type {
  ClientPaymentKind,
  CostRecord,
  CostSubmission,
  CostSubmissionLifecycleStatus,
  ReimbursementPayment,
  ReimbursementPaymentOutcome,
} from "@/lib/operational/finance";

/** Which Finance data sources are live vs awaiting persistence. */
export type FinanceDataAvailability = {
  costRecords: boolean;
  costSubmissions: boolean;
  /** ContractPaymentRecord (PayChex) — still types-only. */
  contractPayments: boolean;
  /** Reimbursement payment receipts against CostSubmission. */
  reimbursementPayments: boolean;
  /** Client authorisation (Approvals module) — not reimbursement submission. */
  clientAuthorisation: boolean;
};

export type FinancePositionMetric = {
  id: string;
  label: string;
  value: string | null;
  detail?: string;
  emphasis?: "primary" | "secondary" | "muted";
  available: boolean;
  /** Visual grouping for the operational picture. */
  group?: "cost" | "submission" | "client_authorisation" | "payment";
};

export type FinancePipelineStage = {
  id: string;
  label: string;
  count: number | null;
  amountLabel: string | null;
  available: boolean;
};

export type FinancePendingActionKind =
  | "cost_needs_classification"
  | "cost_awaiting_submission"
  | "submission_queried"
  | "submission_awaiting_authorization"
  | "submission_awaiting_payment"
  | "submission_draft"
  | "client_authorisation_draft"
  | "client_authorisation_awaiting"
  | "client_authorisation_returned";

export type FinancePendingActionItem = {
  id: string;
  kind: FinancePendingActionKind;
  title: string;
  stageLabel: string;
  href: string;
  amountLabel?: string;
  ageLabel?: string;
  /** Present for client-authorisation items. */
  approvalId?: string;
  workOrderId?: string;
  facilityId?: string;
  /** Present for cost attention items. */
  costId?: string;
  /** Present for submission attention items. */
  submissionId?: string;
};

export type FinanceOperationalCostLens = {
  id: string;
  label: string;
  available: boolean;
  detail?: string;
};

export type FinanceOperationalCostSummary = {
  /** API total when provided — population count, not page length. */
  totalCount: number;
  /** True when the preview pool only holds a bounded subset of costs (recent-activity preview, not the total). */
  truncated: boolean;
  /** The authoritative sum over the COMPLETE register when completeTotalAvailable; a best-effort partial sum otherwise. */
  sampleAmount: number;
  sampleCount: number;
  currency: string;
  /** True when sampleAmount is the real complete-register total (not a fallback partial sum). */
  completeTotalAvailable: boolean;
  /** Live (operational) costs only — a migrated_historical cost with no recorded eligibility is not "unknown" in this sense. */
  unknownCount: number;
  /** Historical costs the source states no reimbursement eligibility for. Informational — never an action item. */
  historicalUnrecordedReimbursabilityCount: number;
  reimbursableCount: number;
};

export type FinanceRecentCostRow = {
  costId: string;
  recordedAt?: string;
  description: string;
  categoryLabel: string;
  facilityId: string;
  amountLabel: string;
  reimbursabilityLabel: string;
  /**
   * Compact-surface date fallback — mirrors CostRecord.compactDate. Present only when recordedAt is absent
   * (migrated_historical, no authoritative FM cost date) and a CERTAIN-linked Platform Finance historical
   * commercial fact establishes a payment_datetime. recordedAt ("Cost") is always preferred when present.
   */
  compactDate?: { value: string; label: "Payment" };
};

export type FinanceSubmissionPreviewRow = {
  submissionId: string;
  /** Client payment type (reimbursement claims keep their own workflow). */
  kind: ClientPaymentKind;
  description?: string;
  clientReference?: string;
  /** Derived from receipts: "Awaiting receipt" | "Partially received" | "Received" (submitted/queried only). */
  receiptLabel?: string;
  status: CostSubmissionLifecycleStatus;
  periodLabel?: string;
  currency: string;
  claimAmount: number;
  amountPaid: number;
  outstandingAmount: number;
  paymentOutcome: ReimbursementPaymentOutcome;
  paymentStatusLabel: string;
};

export type FinanceSubmissionSnapshot = {
  available: boolean;
  total: number;
  truncated: boolean;
  /** Status counts from the loaded pool only — null when truncated (not globally safe). */
  draftCount: number | null;
  submittedCount: number | null;
  queriedCount: number | null;
  cancelledCount: number | null;
  /**
   * Client payments outstanding (submitted/queried with an outstanding amount), derived from receipts.
   * null when the loaded pools are truncated — never a partial figure presented as complete.
   */
  outstandingCount: number | null;
  outstandingAmount: number | null;
  preview: FinanceSubmissionPreviewRow[];
};

export type FinancePaymentSnapshot = {
  available: boolean;
  paymentCount: number;
  truncated: boolean;
  totalReceivedSample: number;
  currency: string;
  fullyPaidSubmissionCount: number | null;
  partiallyPaidSubmissionCount: number | null;
  unpaidOpenSubmissionCount: number | null;
  coverageStatus: string;
  statusSignal: string;
  positionValue: string | null;
  positionDetail: string;
};

export type FinanceOverviewMeta = {
  totalApprovals: number | null;
  approvalsInView: number;
  approvalsTruncated: boolean;
  costRecordsTotal: number | null;
  costRecordsTruncated: boolean;
  submissionsTotal: number | null;
  submissionsTruncated: boolean;
  paymentsTotal: number | null;
  paymentsTruncated: boolean;
  derivedAt: string;
  /**
   * Reimbursable-awaiting-submission attention is only emitted when every
   * CostSubmission is in the loaded pool (not truncated). Domain allows a
   * CostRecord in multiple submissions.
   */
  reimbursableAwaitingSubmissionSafe: boolean;
  costRecordsAvailable: boolean;
  submissionsAvailable: boolean;
  paymentsAvailable: boolean;
  authorizationsAvailable: boolean;
  approvalsAvailable: boolean;
  /** True when a required source for pending actions failed. */
  pendingIncomplete: boolean;
};

/** Operating-year spend for the Costs & Claims headline (complete register, that year only). */
export type FinanceOperatingYearSpend = {
  year: number;
  /** Costs only — imported order-register values are never counted here. */
  totalCount: number;
  totalAmount: number;
  currency: string;
  /** That year's WO/JO execution cost from the imported order registers — reported separately, already included in spend. */
  orderValueCount?: number;
  orderValueAmount?: number;
};

export type FinanceOverview = {
  availability: FinanceDataAvailability;
  meta: FinanceOverviewMeta;
  position: FinancePositionMetric[];
  clientAuthorisationStages: FinancePipelineStage[];
  pendingActions: FinancePendingActionItem[];
  /** Payment Approval items only (awaiting decision, returned, draft) for the overview's Payment Approvals card. */
  paymentApprovals: FinancePendingActionItem[];
  operationalCostLenses: FinanceOperationalCostLens[];
  operationalCostSummary: FinanceOperationalCostSummary | null;
  /** null when the operating-year total could not be loaded (never the all-year or preview figure). */
  operatingYearSpend: FinanceOperatingYearSpend | null;
  recentCosts: FinanceRecentCostRow[];
  submissions: FinanceSubmissionSnapshot;
  payments: FinancePaymentSnapshot;
  sourceApprovals: Approval[];
  sourceCostRecords: CostRecord[];
  sourceSubmissions: CostSubmission[];
  sourcePayments: ReimbursementPayment[];
};

/** @deprecated Prefer CostSubmissionLifecycleStatus for live Finance UI. */
export type ReimbursementStageId = CostSubmissionLifecycleStatus | "awaiting_cost";
