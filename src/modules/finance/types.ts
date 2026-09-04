import type { Approval } from "@/modules/approvals/types";
import type {
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
  /** True when overview only holds a bounded sample of costs. */
  truncated: boolean;
  /** Sum of actualAmount in the loaded sample only — not claimed as sheet-wide. */
  sampleAmount: number;
  sampleCount: number;
  currency: string;
  unknownCount: number;
  reimbursableCount: number;
};

export type FinanceRecentCostRow = {
  costId: string;
  recordedAt: string;
  description: string;
  categoryLabel: string;
  facilityId: string;
  amountLabel: string;
  reimbursabilityLabel: string;
};

export type FinanceSubmissionPreviewRow = {
  submissionId: string;
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
  total: number;
  truncated: boolean;
  /** Status counts from the loaded pool only — null when truncated (not globally safe). */
  draftCount: number | null;
  submittedCount: number | null;
  queriedCount: number | null;
  cancelledCount: number | null;
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
  totalApprovals: number;
  approvalsInView: number;
  approvalsTruncated: boolean;
  costRecordsTotal: number;
  costRecordsTruncated: boolean;
  submissionsTotal: number;
  submissionsTruncated: boolean;
  paymentsTotal: number;
  paymentsTruncated: boolean;
  derivedAt: string;
  /**
   * Reimbursable-awaiting-submission attention is only emitted when every
   * CostSubmission is in the loaded pool (not truncated). Domain allows a
   * CostRecord in multiple submissions.
   */
  reimbursableAwaitingSubmissionSafe: boolean;
};

export type FinanceOverview = {
  availability: FinanceDataAvailability;
  meta: FinanceOverviewMeta;
  position: FinancePositionMetric[];
  clientAuthorisationStages: FinancePipelineStage[];
  pendingActions: FinancePendingActionItem[];
  operationalCostLenses: FinanceOperationalCostLens[];
  operationalCostSummary: FinanceOperationalCostSummary | null;
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
