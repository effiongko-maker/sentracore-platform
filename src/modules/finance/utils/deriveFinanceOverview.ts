import type { Approval, ApprovalStatus } from "@/modules/approvals/types";
import { normalizeApprovalStatus } from "@/modules/approvals/lifecycle";
import {
  CLIENT_AUTHORISATION_STAGES,
  OPERATIONAL_COST_LENSES,
  REIMBURSEMENT_SUBMISSION_STAGES,
} from "../constants";
import type {
  FinanceOverview,
  FinancePendingActionItem,
  FinancePipelineStage,
} from "../types";
import { formatFinancialAmount, sumAmounts } from "./formatFinancialAmount";

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

function buildReimbursementStages(): FinancePipelineStage[] {
  return REIMBURSEMENT_SUBMISSION_STAGES.map((stage) => ({
    id: stage.id,
    label: stage.label,
    count: null,
    amountLabel: null,
    available: false,
  }));
}

function buildPendingActions(approvals: Approval[]): FinancePendingActionItem[] {
  const items: FinancePendingActionItem[] = [];

  for (const approval of approvals) {
    const status = canonicalStatus(approval);
    const amountLabel =
      approval.approvalAmount != null
        ? formatFinancialAmount(approval.approvalAmount, approval.currency)
        : undefined;

    if (status === "draft") {
      items.push({
        id: `draft-${approval.id}`,
        kind: "client_authorisation_draft",
        title: approval.title,
        approvalId: approval.id,
        workOrderId: approval.workOrderId,
        facilityId: approval.facilityId,
        amountLabel,
        stageLabel: "Draft — not yet submitted to client",
        href: `/approvals?id=${encodeURIComponent(approval.id)}`,
      });
      continue;
    }

    if (status === "awaiting_decision") {
      items.push({
        id: `awaiting-${approval.id}`,
        kind: "client_authorisation_awaiting",
        title: approval.title,
        approvalId: approval.id,
        workOrderId: approval.workOrderId,
        facilityId: approval.facilityId,
        amountLabel,
        stageLabel: "Awaiting client decision",
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
        stageLabel: "Returned for clarification",
        ageLabel: ageLabel(approval.lastActivityAt ?? approval.updatedAt),
        href: `/approvals?id=${encodeURIComponent(approval.id)}`,
      });
    }
  }

  return items.sort((a, b) => {
    const priority = {
      client_authorisation_awaiting: 0,
      client_authorisation_returned: 1,
      client_authorisation_draft: 2,
    };
    return priority[a.kind] - priority[b.kind];
  });
}

export function deriveFinanceOverview(
  approvals: Approval[],
  meta: Pick<FinanceOverview["meta"], "totalApprovals" | "truncated">
): FinanceOverview {
  const draftRows = approvals.filter(
    (approval) => canonicalStatus(approval) === "draft"
  );

  const approvedRows = approvals.filter(
    (approval) => canonicalStatus(approval) === "approved"
  );

  const awaitingDecision = approvals.filter(
    (approval) => canonicalStatus(approval) === "awaiting_decision"
  );

  const draftTotal = sumAmounts(
    draftRows.map((row) => ({ amount: approvalAmount(row) }))
  );
  const approvedTotal = sumAmounts(
    approvedRows.map((row) => ({ amount: approvedAmount(row) }))
  );
  const awaitingTotal = sumAmounts(
    awaitingDecision.map((row) => ({ amount: approvalAmount(row) }))
  );

  return {
    availability: {
      costRecords: false,
      costSubmissions: false,
      contractPayments: false,
      clientAuthorisation: true,
    },
    meta: {
      ...meta,
      approvalsInView: approvals.length,
      derivedAt: new Date().toISOString(),
    },
    position: [
      {
        id: "client_auth_draft",
        label: "Pending / draft",
        value: formatFinancialAmount(draftTotal),
        detail: `${draftRows.length} not yet submitted to client`,
        emphasis: "secondary",
        available: true,
      },
      {
        id: "client_auth_approved",
        label: "Approved",
        value: formatFinancialAmount(approvedTotal),
        detail: `${approvedRows.length} approved authorisation${
          approvedRows.length === 1 ? "" : "s"
        }`,
        emphasis: "primary",
        available: true,
      },
      {
        id: "awaiting_client_decision",
        label: "Awaiting client decision",
        value: formatFinancialAmount(awaitingTotal),
        detail: `${awaitingDecision.length} submitted for client response`,
        emphasis: "primary",
        available: true,
      },
    ],
    reimbursementStages: buildReimbursementStages(),
    clientAuthorisationStages: buildClientAuthorisationStages(approvals),
    pendingActions: buildPendingActions(approvals),
    operationalCostLenses: OPERATIONAL_COST_LENSES.map((lens) => ({
      id: lens.id,
      label: lens.label,
      available: false,
    })),
    sourceApprovals: approvals,
  };
}
