import type { Approval, ApprovalStatus } from "@/modules/approvals/types";
import { normalizeApprovalStatus } from "@/modules/approvals/lifecycle";
import {
  COST_CATEGORY_LABELS,
  getSubmissionCostRecordIds,
  type CostCategory,
  type CostRecord,
  type CostSubmission,
  type CostSubmissionLifecycleStatus,
  type ReimbursementPayment,
} from "@/lib/operational/finance";
import {
  CLIENT_AUTHORISATION_STAGES,
  COST_REIMBURSABILITY_LABELS,
  FINANCE_RECENT_COSTS_LIMIT,
  FINANCE_SUBMISSIONS_PREVIEW_SIZE,
  FINANCE_UI_LIST_LIMIT,
  OPERATIONAL_COST_LENSES,
} from "../constants";
import type {
  FinanceOverview,
  FinancePaymentSnapshot,
  FinancePendingActionItem,
  FinancePipelineStage,
  FinancePositionMetric,
  FinanceRecentCostRow,
  FinanceSubmissionPreviewRow,
  FinanceSubmissionSnapshot,
} from "../types";
import { formatFinancialAmount, sumAmounts } from "./formatFinancialAmount";
import {
  buildFinancePaymentOverviewState,
  PAYMENT_OUTCOME_LABELS,
  summarizeSubmissionPayments,
} from "./submissionPayment";

function canonicalStatus(approval: Approval): ApprovalStatus {
  return normalizeApprovalStatus(approval.status, approval.submittedAt);
}

function approvalAmount(approval: Approval): number | undefined {
  return approval.approvalAmount;
}

function approvedAmount(approval: Approval): number | undefined {
  return approval.approvedAmount ?? approval.approvalAmount;
}

function daysSince(iso?: string): number | undefined {
  if (!iso?.trim()) return undefined;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return undefined;
  return Math.max(0, Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24)));
}

function ageLabel(iso?: string): string | undefined {
  const days = daysSince(iso);
  if (days === undefined) return undefined;
  if (days === 0) return "Today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

function stageBucket(status: ApprovalStatus): string {
  if (status === "draft") return "draft";
  if (status === "awaiting_decision") return "awaiting_decision";
  if (status === "approved") return "approved";
  if (status === "returned") return "returned";
  if (
    status === "rejected" ||
    status === "cancelled" ||
    status === "expired" ||
    status === "closed"
  ) {
    return "rejected";
  }
  return "rejected";
}

function buildClientAuthorisationStages(
  approvals: Approval[]
): FinancePipelineStage[] {
  const buckets = new Map<string, Approval[]>();
  for (const stage of CLIENT_AUTHORISATION_STAGES) {
    buckets.set(stage.id, []);
  }

  for (const approval of approvals) {
    const bucket = stageBucket(canonicalStatus(approval));
    buckets.get(bucket)?.push(approval);
  }

  return CLIENT_AUTHORISATION_STAGES.map((stage) => {
    const rows = buckets.get(stage.id) ?? [];
    const amount = sumAmounts(
      rows.map((row) => ({
        amount:
          stage.id === "approved"
            ? approvedAmount(row)
            : approvalAmount(row),
      }))
    );
    return {
      id: stage.id,
      label: stage.label,
      count: rows.length,
      amountLabel: rows.length ? formatFinancialAmount(amount) : "—",
      available: true,
    };
  });
}

function buildReferencedCostIds(submissions: CostSubmission[]): Set<string> {
  const ids = new Set<string>();
  for (const submission of submissions) {
    for (const costId of getSubmissionCostRecordIds(submission)) {
      ids.add(costId);
    }
  }
  return ids;
}

function countByLifecycle(
  submissions: CostSubmission[]
): Record<CostSubmissionLifecycleStatus, number> {
  const counts: Record<CostSubmissionLifecycleStatus, number> = {
    draft: 0,
    submitted: 0,
    queried: 0,
    cancelled: 0,
  };
  for (const submission of submissions) {
    counts[submission.status] += 1;
  }
  return counts;
}

function buildSubmissionSnapshot(
  submissions: CostSubmission[],
  total: number,
  payments: ReimbursementPayment[]
): FinanceSubmissionSnapshot {
  const truncated = total > submissions.length;
  const counts = countByLifecycle(submissions);
  const preview: FinanceSubmissionPreviewRow[] = submissions
    .slice(0, FINANCE_SUBMISSIONS_PREVIEW_SIZE)
    .map((submission) => {
      const payment = summarizeSubmissionPayments(submission, payments);
      return {
        submissionId: submission.submissionId,
        status: submission.status,
        periodLabel: submission.periodLabel,
        currency: submission.currency,
        claimAmount: payment.claimAmount,
        amountPaid: payment.amountPaid,
        outstandingAmount: payment.outstandingAmount,
        paymentOutcome: payment.outcome,
        paymentStatusLabel: PAYMENT_OUTCOME_LABELS[payment.outcome],
      };
    });

  return {
    total,
    truncated,
    draftCount: truncated ? null : counts.draft,
    submittedCount: truncated ? null : counts.submitted,
    queriedCount: truncated ? null : counts.queried,
    cancelledCount: truncated ? null : counts.cancelled,
    preview,
  };
}

function buildPendingActions(options: {
  approvals: Approval[];
  costRecords: CostRecord[];
  submissions: CostSubmission[];
  submissionsTruncated: boolean;
  payments: ReimbursementPayment[];
}): FinancePendingActionItem[] {
  const items: FinancePendingActionItem[] = [];
  const referencedCostIds = buildReferencedCostIds(options.submissions);
  const reimbursableAwaitingSafe = !options.submissionsTruncated;

  for (const submission of options.submissions) {
    const payment = summarizeSubmissionPayments(submission, options.payments);

    if (submission.status === "queried") {
      items.push({
        id: `submission-queried-${submission.submissionId}`,
        kind: "submission_queried",
        title: submission.submissionId,
        submissionId: submission.submissionId,
        amountLabel:
          submission.claimAmount != null
            ? formatFinancialAmount(submission.claimAmount, submission.currency)
            : undefined,
        stageLabel: "Queried — review and resubmit",
        ageLabel: ageLabel(submission.queriedAt ?? submission.submittedAt),
        href: `/finance/submissions/${encodeURIComponent(submission.submissionId)}`,
      });
    } else if (submission.status === "draft") {
      items.push({
        id: `submission-draft-${submission.submissionId}`,
        kind: "submission_draft",
        title: submission.submissionId,
        submissionId: submission.submissionId,
        amountLabel:
          submission.claimAmount != null
            ? formatFinancialAmount(submission.claimAmount, submission.currency)
            : undefined,
        stageLabel: "Draft — awaiting submission",
        ageLabel: ageLabel(submission.createdAt),
        href: `/finance/submissions/${encodeURIComponent(submission.submissionId)}/edit`,
      });
    } else if (
      submission.status === "submitted" &&
      !payment.fullyPaid
    ) {
      // Fully paid claims must not appear as awaiting payment.
      items.push({
        id: `submission-payment-${submission.submissionId}`,
        kind: "submission_awaiting_payment",
        title: submission.submissionId,
        submissionId: submission.submissionId,
        amountLabel: formatFinancialAmount(
          payment.outstandingAmount,
          submission.currency
        ),
        stageLabel: payment.hasPayment
          ? "Partially paid — outstanding remains"
          : "Submitted — awaiting payment",
        ageLabel: ageLabel(submission.submittedAt ?? submission.createdAt),
        href: `/finance/submissions/${encodeURIComponent(submission.submissionId)}`,
      });
    }
  }

  for (const record of options.costRecords) {
    if (record.reimbursability === "unknown") {
      items.push({
        id: `cost-unknown-${record.costId}`,
        kind: "cost_needs_classification",
        title: record.description,
        costId: record.costId,
        facilityId: record.facilityId,
        amountLabel: formatFinancialAmount(record.actualAmount, record.currency),
        stageLabel: "Needs classification",
        ageLabel: ageLabel(record.recordedAt),
        href: `/finance/costs/${encodeURIComponent(record.costId)}`,
      });
    } else if (
      reimbursableAwaitingSafe &&
      record.reimbursability === "reimbursable" &&
      !referencedCostIds.has(record.costId)
    ) {
      items.push({
        id: `cost-awaiting-${record.costId}`,
        kind: "cost_awaiting_submission",
        title: record.description,
        costId: record.costId,
        facilityId: record.facilityId,
        amountLabel: formatFinancialAmount(record.actualAmount, record.currency),
        stageLabel: "Reimbursable — awaiting submission",
        ageLabel: ageLabel(record.recordedAt),
        href: `/finance/costs/${encodeURIComponent(record.costId)}`,
      });
    }
  }

  for (const approval of options.approvals) {
    const status = canonicalStatus(approval);
    const amountLabel =
      approval.approvalAmount != null
        ? formatFinancialAmount(approval.approvalAmount, approval.currency)
        : undefined;

    if (status === "awaiting_decision") {
      items.push({
        id: `awaiting-${approval.id}`,
        kind: "client_authorisation_awaiting",
        title: approval.title,
        approvalId: approval.id,
        workOrderId: approval.workOrderId,
        facilityId: approval.facilityId,
        amountLabel,
        stageLabel: "Client authorisation awaiting decision",
        ageLabel: ageLabel(approval.submittedAt ?? approval.updatedAt),
        href: `/approvals?id=${encodeURIComponent(approval.id)}`,
      });
      continue;
    }

    if (status === "returned") {
      items.push({
        id: `returned-${approval.id}`,
        kind: "client_authorisation_returned",
        title: approval.title,
        approvalId: approval.id,
        workOrderId: approval.workOrderId,
        facilityId: approval.facilityId,
        amountLabel,
        stageLabel: "Client authorisation returned",
        ageLabel: ageLabel(approval.lastActivityAt ?? approval.updatedAt),
        href: `/approvals?id=${encodeURIComponent(approval.id)}`,
      });
      continue;
    }

    if (status === "draft") {
      items.push({
        id: `draft-${approval.id}`,
        kind: "client_authorisation_draft",
        title: approval.title,
        approvalId: approval.id,
        workOrderId: approval.workOrderId,
        facilityId: approval.facilityId,
        amountLabel,
        stageLabel: "Client authorisation draft",
        href: `/approvals?id=${encodeURIComponent(approval.id)}`,
      });
    }
  }

  const priority: Record<FinancePendingActionItem["kind"], number> = {
    submission_queried: 0,
    client_authorisation_awaiting: 1,
    client_authorisation_returned: 2,
    cost_needs_classification: 3,
    submission_awaiting_payment: 4,
    cost_awaiting_submission: 5,
    submission_draft: 6,
    client_authorisation_draft: 7,
  };

  return items
    .sort((a, b) => priority[a.kind] - priority[b.kind])
    .slice(0, FINANCE_UI_LIST_LIMIT);
}

function buildRecentCostRows(records: CostRecord[]): FinanceRecentCostRow[] {
  return records.slice(0, FINANCE_RECENT_COSTS_LIMIT).map((record) => ({
    costId: record.costId,
    recordedAt: record.recordedAt,
    description: record.description,
    categoryLabel: COST_CATEGORY_LABELS[record.category as CostCategory],
    facilityId: record.facilityId,
    amountLabel: formatFinancialAmount(record.actualAmount, record.currency),
    reimbursabilityLabel: COST_REIMBURSABILITY_LABELS[record.reimbursability],
  }));
}

function buildOperationalCostLenses(records: CostRecord[], totalCount: number) {
  const hasRecords = totalCount > 0;
  const detail = hasRecords
    ? `${totalCount} recorded cost${totalCount === 1 ? "" : "s"}`
    : "No cost records yet";

  return OPERATIONAL_COST_LENSES.map((lens) => ({
    id: lens.id,
    label: lens.label,
    available: hasRecords,
    detail,
  }));
}

function buildPosition(options: {
  costRecords: CostRecord[];
  costTotal: number;
  costTruncated: boolean;
  sampleAmount: number;
  currency: string;
  submissions: FinanceSubmissionSnapshot;
  approvals: Approval[];
  payments: FinancePaymentSnapshot;
}): FinancePositionMetric[] {
  const unknownCount = options.costRecords.filter(
    (r) => r.reimbursability === "unknown"
  ).length;
  const reimbursableCount = options.costRecords.filter(
    (r) => r.reimbursability === "reimbursable"
  ).length;

  const awaitingDecision = options.approvals.filter(
    (a) => canonicalStatus(a) === "awaiting_decision"
  );
  const awaitingAuthTotal = sumAmounts(
    awaitingDecision.map((row) => ({ amount: approvalAmount(row) }))
  );

  const metrics: FinancePositionMetric[] = [
    {
      id: "cost_recorded",
      group: "cost",
      label: "Operational costs",
      value:
        options.costTotal > 0
          ? String(options.costTotal)
          : "None yet",
      detail: options.costTruncated
        ? `${options.costRecords.length} newest in view · sample ${formatFinancialAmount(options.sampleAmount, options.currency)}`
        : options.costTotal > 0
          ? formatFinancialAmount(options.sampleAmount, options.currency)
          : "Record costs as they are incurred",
      emphasis: "primary",
      available: true,
    },
    {
      id: "cost_classification",
      group: "cost",
      label: "Needs classification",
      value: String(unknownCount),
      detail:
        unknownCount > 0
          ? "Unknown reimbursability in the cost sample"
          : "No unknown classifications in view",
      emphasis: unknownCount > 0 ? "primary" : "muted",
      available: true,
    },
    {
      id: "cost_reimbursable",
      group: "cost",
      label: "Reimbursable in view",
      value: String(reimbursableCount),
      detail: "From the bounded cost sample",
      emphasis: "secondary",
      available: true,
    },
  ];

  if (options.submissions.truncated) {
    metrics.push({
      id: "submissions_total",
      group: "submission",
      label: "Reimbursement submissions",
      value: String(options.submissions.total),
      detail: `${options.submissions.preview.length} newest shown · status totals not aggregated`,
      emphasis: "primary",
      available: true,
    });
  } else {
    metrics.push(
      {
        id: "submissions_draft",
        group: "submission",
        label: "Draft submissions",
        value: String(options.submissions.draftCount ?? 0),
        detail: "Prepared but not yet submitted",
        emphasis: "secondary",
        available: true,
      },
      {
        id: "submissions_queried",
        group: "submission",
        label: "Queried submissions",
        value: String(options.submissions.queriedCount ?? 0),
        detail:
          (options.submissions.queriedCount ?? 0) > 0
            ? "Returned for clarification"
            : "None requiring resubmission",
        emphasis:
          (options.submissions.queriedCount ?? 0) > 0 ? "primary" : "muted",
        available: true,
      },
      {
        id: "submissions_submitted",
        group: "submission",
        label: "Submitted",
        value: String(options.submissions.submittedCount ?? 0),
        detail: "Sent for reimbursement consideration",
        emphasis: "secondary",
        available: true,
      }
    );
  }

  metrics.push(
    {
      id: "client_auth_awaiting",
      group: "client_authorisation",
      label: "Client authorisation awaiting decision",
      value:
        awaitingDecision.length > 0
          ? formatFinancialAmount(awaitingAuthTotal)
          : "None",
      detail: `${awaitingDecision.length} Work Order client authorisation${
        awaitingDecision.length === 1 ? "" : "s"
      }`,
      emphasis: awaitingDecision.length > 0 ? "primary" : "muted",
      available: true,
    },
    {
      id: "payment",
      group: "payment",
      label: "Payment",
      value: options.payments.positionValue,
      detail: options.payments.positionDetail,
      emphasis:
        options.payments.paymentCount > 0 ? "secondary" : "muted",
      available: options.payments.available,
    }
  );

  return metrics;
}

export type DeriveFinanceOverviewInput = {
  approvals: Approval[];
  totalApprovals: number;
  costRecords: CostRecord[];
  totalCostRecords: number;
  submissions: CostSubmission[];
  totalSubmissions: number;
  payments?: ReimbursementPayment[];
  totalPayments?: number;
};

export function deriveFinanceOverview(
  input: DeriveFinanceOverviewInput
): FinanceOverview {
  const {
    approvals,
    totalApprovals,
    costRecords,
    totalCostRecords,
    submissions,
    totalSubmissions,
  } = input;
  const payments = input.payments ?? [];
  const totalPayments = input.totalPayments ?? payments.length;

  const costTruncated = totalCostRecords > costRecords.length;
  const submissionsTruncated = totalSubmissions > submissions.length;
  const paymentsTruncated = totalPayments > payments.length;
  const sampleAmount = sumAmounts(
    costRecords.map((row) => ({ amount: row.actualAmount }))
  );
  const currency =
    costRecords[0]?.currency ?? payments[0]?.currency ?? "NGN";
  const submissionSnapshot = buildSubmissionSnapshot(
    submissions,
    totalSubmissions,
    payments
  );
  const paymentSnapshot = buildFinancePaymentOverviewState({
    submissions,
    submissionsTruncated,
    payments,
    totalPayments,
    currency,
  });

  const unknownCount = costRecords.filter(
    (r) => r.reimbursability === "unknown"
  ).length;
  const reimbursableCount = costRecords.filter(
    (r) => r.reimbursability === "reimbursable"
  ).length;

  return {
    availability: {
      costRecords: true,
      costSubmissions: true,
      contractPayments: false,
      reimbursementPayments: true,
      clientAuthorisation: true,
    },
    meta: {
      totalApprovals,
      approvalsInView: approvals.length,
      approvalsTruncated: totalApprovals > approvals.length,
      costRecordsTotal: totalCostRecords,
      costRecordsTruncated: costTruncated,
      submissionsTotal: totalSubmissions,
      submissionsTruncated,
      paymentsTotal: totalPayments,
      paymentsTruncated,
      derivedAt: new Date().toISOString(),
      reimbursableAwaitingSubmissionSafe: !submissionsTruncated,
    },
    position: buildPosition({
      costRecords,
      costTotal: totalCostRecords,
      costTruncated,
      sampleAmount,
      currency,
      submissions: submissionSnapshot,
      approvals,
      payments: paymentSnapshot,
    }),
    clientAuthorisationStages: buildClientAuthorisationStages(approvals),
    pendingActions: buildPendingActions({
      approvals,
      costRecords,
      submissions,
      submissionsTruncated,
      payments,
    }),
    operationalCostLenses: buildOperationalCostLenses(
      costRecords,
      totalCostRecords
    ),
    operationalCostSummary:
      totalCostRecords > 0
        ? {
            totalCount: totalCostRecords,
            truncated: costTruncated,
            sampleAmount,
            sampleCount: costRecords.length,
            currency,
            unknownCount,
            reimbursableCount,
          }
        : null,
    recentCosts: buildRecentCostRows(costRecords),
    submissions: submissionSnapshot,
    payments: paymentSnapshot,
    sourceApprovals: approvals,
    sourceCostRecords: costRecords,
    sourceSubmissions: submissions,
    sourcePayments: payments,
  };
}
