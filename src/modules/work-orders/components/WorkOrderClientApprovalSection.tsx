"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/utils";
import { ApprovalPackageModal } from "@/modules/approvals/components/ApprovalPackageModal";
import { GenerateApprovalWizardModal } from "@/modules/approvals/components/GenerateApprovalWizardModal";
import { ViewApprovalModal } from "@/modules/approvals/components/ViewApprovalModal";
import { APPROVAL_STATUS_VARIANT } from "@/modules/approvals/constants";
import { labelizeApprovalStatus } from "@/modules/approvals/utils";
import type { Approval } from "@/modules/approvals/types";
import { ApprovalService } from "@/services/approvals/ApprovalService";
import type { WorkOrder } from "../types";

interface WorkOrderClientApprovalSectionProps {
  workOrder: WorkOrder;
  onLinked?: (approval: Approval) => void;
}

/**
 * Optional Client Approval on a Work Order.
 * Work Orders may exist with no Approval Request.
 */
export function WorkOrderClientApprovalSection({
  workOrder,
  onLinked,
}: WorkOrderClientApprovalSectionProps) {
  const [approval, setApproval] = useState<Approval | null>(null);
  const [loading, setLoading] = useState(Boolean(workOrder.approvalId));
  const [wizardOpen, setWizardOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [packageOpen, setPackageOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!workOrder.approvalId) {
        setApproval(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const row = await ApprovalService.getApproval(workOrder.approvalId);
        if (!cancelled) setApproval(row);
      } catch {
        if (!cancelled) setApproval(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [workOrder.approvalId, workOrder.id]);

  return (
    <section className="mt-6 rounded-xl border border-border/80 bg-slate-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Client Approval
          </h3>
          <p className="mt-1 text-xs text-muted">
            Optional formal authorisation. This Work Order can proceed without
            an Approval Request when not required.
          </p>
        </div>
        {!approval && !loading ? (
          <Button size="sm" onClick={() => setWizardOpen(true)}>
            Generate Approval Request
          </Button>
        ) : null}
      </div>

      <div className="mt-4">
        {loading ? (
          <p className="text-sm text-muted">Loading approval…</p>
        ) : approval ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                Approval
              </span>
              <button
                type="button"
                className="text-sm font-medium text-accent underline-offset-2 hover:underline"
                onClick={() => setViewOpen(true)}
              >
                {approval.id}
              </button>
              <span className="text-sm text-muted">—</span>
              <Badge variant={APPROVAL_STATUS_VARIANT[approval.status]}>
                {labelizeApprovalStatus(approval.status)}
              </Badge>
            </div>
            {approval.lastFollowUpAt ? (
              <p className="text-xs text-muted">
                Last follow-up {formatDate(approval.lastFollowUpAt)}
                {approval.lastActivitySummary
                  ? ` · ${approval.lastActivitySummary}`
                  : ""}
              </p>
            ) : approval.lastActivitySummary ? (
              <p className="text-xs text-muted">{approval.lastActivitySummary}</p>
            ) : null}
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted">
                  Generated
                </dt>
                <dd className="text-foreground">
                  {approval.generatedAt
                    ? formatDate(approval.generatedAt)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted">
                  Submitted
                </dt>
                <dd className="text-foreground">
                  {approval.submittedAt
                    ? formatDate(approval.submittedAt)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted">
                  Decision
                </dt>
                <dd className="text-foreground">
                  {approval.decisionAt ? formatDate(approval.decisionAt) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted">
                  Amount
                </dt>
                <dd className="text-foreground">
                  {approval.approvalAmount != null
                    ? `${approval.currency ? `${approval.currency} ` : ""}${approval.approvalAmount.toLocaleString()}`
                    : "—"}
                </dd>
              </div>
              {approval.approvedAmount != null ? (
                <div>
                  <dt className="text-xs uppercase tracking-wider text-muted">
                    Approved amount
                  </dt>
                  <dd className="text-foreground">
                    {approval.currency ? `${approval.currency} ` : ""}
                    {approval.approvedAmount.toLocaleString()}
                    {approval.decisionOutcome === "partially_approved"
                      ? " (partial)"
                      : ""}
                  </dd>
                </div>
              ) : null}
            </dl>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setViewOpen(true)}
              >
                Open approval
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPackageOpen(true)}
              >
                Preview package
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setWizardOpen(true)}
              >
                Revise / regenerate
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">No approval request created</p>
        )}
      </div>

      <GenerateApprovalWizardModal
        open={wizardOpen}
        workOrderId={workOrder.id}
        onClose={() => setWizardOpen(false)}
        onGenerated={(row) => {
          setApproval(row);
          onLinked?.(row);
          setPackageOpen(true);
        }}
      />

      <ViewApprovalModal
        open={viewOpen}
        approval={approval}
        onClose={() => setViewOpen(false)}
        onPackage={(row) => {
          setViewOpen(false);
          setApproval(row);
          setPackageOpen(true);
        }}
      />

      <ApprovalPackageModal
        open={packageOpen}
        approval={approval}
        onClose={() => setPackageOpen(false)}
      />
    </section>
  );
}
