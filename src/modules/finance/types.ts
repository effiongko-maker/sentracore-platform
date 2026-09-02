import type { Approval } from "@/modules/approvals/types";
import type { CostSubmissionStatus } from "@/lib/operational/finance";

/** Which Finance data sources are live vs awaiting persistence. */
export type FinanceDataAvailability = {
  costRecords: boolean;
  costSubmissions: boolean;
  contractPayments: boolean;
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
};

export type FinancePipelineStage = {
  id: string;
  label: string;
  count: number | null;
  amountLabel: string | null;
  available: boolean;
};

export type FinancePendingActionItem = {
  id: string;
  kind:
    | "client_authorisation_draft"
    | "client_authorisation_awaiting"
    | "client_authorisation_returned";
  title: string;
  approvalId: string;
  workOrderId: string;
  facilityId: string;
  amountLabel?: string;
  stageLabel: string;
  ageLabel?: string;
  href: string;
};

export type FinanceOperationalCostLens = {
  id: string;
  label: string;
  available: boolean;
  detail?: string;
};

export type FinanceOperationalCostSummary = {
  totalAmount: number;
  count: number;
  currency: string;
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

export type FinanceOverviewMeta = {
  totalApprovals: number;
  approvalsInView: number;
  truncated: boolean;
  derivedAt: string;
};

export type FinanceOverview = {
  availability: FinanceDataAvailability;
  meta: FinanceOverviewMeta;
  position: FinancePositionMetric[];
  reimbursementStages: FinancePipelineStage[];
  clientAuthorisationStages: FinancePipelineStage[];
  pendingActions: FinancePendingActionItem[];
  operationalCostLenses: FinanceOperationalCostLens[];
  operationalCostSummary: FinanceOperationalCostSummary | null;
  recentCosts: FinanceRecentCostRow[];
  sourceApprovals: Approval[];
};

export type ReimbursementStageId =
  | "awaiting_cost"
  | CostSubmissionStatus
  | "approved_awaiting_payment";
