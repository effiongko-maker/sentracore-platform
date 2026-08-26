"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/modals/Modal";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/utils";
import { useFacilityName } from "@/hooks/useEntityLabel";
import { useToast } from "@/components/ui/Toast";
import { WorkOrderService } from "@/services/workOrders/WorkOrderService";
import type { WorkOrder } from "@/modules/work-orders/types";
import { displayWorkOrderTitle, labelize } from "@/modules/work-orders/utils";
import { APPROVAL_PACKAGE_DOCUMENT_ID } from "../constants";
import { downloadApprovalPackagePdf } from "../export/downloadApprovalPackagePdf";
import { displayApprovalTitle, labelizeApprovalStatus } from "../utils";
import type { Approval } from "../types";

interface ApprovalPackageModalProps {
  open: boolean;
  approval: Approval | null;
  onClose: () => void;
}

export function ApprovalPackageModal({
  open,
  approval,
  onClose,
}: ApprovalPackageModalProps) {
  const { toast } = useToast();
  const packageRef = useRef<HTMLDivElement>(null);
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const facilityName = useFacilityName(
    approval?.facilityId || workOrder?.facilityId
  );

  useEffect(() => {
    if (!open || !approval?.workOrderId) {
      setWorkOrder(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void WorkOrderService.getWorkOrder(approval.workOrderId)
      .then((row) => {
        if (!cancelled) setWorkOrder(row);
      })
      .catch(() => {
        if (!cancelled) setWorkOrder(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, approval?.workOrderId]);

  if (!approval) return null;

  const current = approval;

  async function handlePdf() {
    const element = packageRef.current;
    if (!element) return;
    setExporting(true);
    try {
      await downloadApprovalPackagePdf(
        `${current.id}_${displayApprovalTitle(current)}`,
        element
      );
    } catch (err) {
      toast({
        type: "error",
        title: "Unable to export PDF",
        description:
          err instanceof Error ? err.message : "Please try again in a moment.",
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Approval package"
      description={`${current.id} · Cover letter + Work Order form`}
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} className="print:hidden">
            Close
          </Button>
          <Button
            variant="outline"
            onClick={() => window.print()}
            className="print:hidden"
          >
            Print
          </Button>
          <Button
            onClick={() => void handlePdf()}
            disabled={exporting}
            className="print:hidden"
          >
            {exporting ? "Preparing PDF…" : "Download PDF"}
          </Button>
        </>
      }
    >
      <div
        id={APPROVAL_PACKAGE_DOCUMENT_ID}
        ref={packageRef}
        className="approval-package space-y-8 bg-white print:space-y-10"
      >
        <section className="rounded-xl border border-border bg-card p-6 print:rounded-none print:border-0 print:p-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">
            Cover letter
          </p>
          <div className="mt-4 space-y-1 text-sm text-foreground">
            <p>
              <span className="text-muted">Reference:</span> {current.id}
            </p>
            <p>
              <span className="text-muted">Status:</span>{" "}
              {labelizeApprovalStatus(current.status)}
            </p>
            <p>
              <span className="text-muted">Work Order:</span>{" "}
              {current.workOrderId}
            </p>
            <p>
              <span className="text-muted">Facility:</span>{" "}
              {facilityName || current.facilityId || "—"}
            </p>
            {current.approvalAmount != null ? (
              <p>
                <span className="text-muted">Estimated cost:</span>{" "}
                {current.currency ? `${current.currency} ` : ""}
                {current.approvalAmount.toLocaleString()}
              </p>
            ) : null}
          </div>
          <div className="mt-6 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {current.coverLetter ||
              "No cover letter content has been prepared."}
          </div>
        </section>

        <section className="break-before-page rounded-xl border border-border bg-card p-6 print:rounded-none print:border-0 print:p-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">
            Work Order form
          </p>
          {loading ? (
            <p className="mt-4 text-sm text-muted">Loading work order…</p>
          ) : workOrder ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <PackageDetail label="Work Order ID" value={workOrder.id} />
              <PackageDetail
                label="Title"
                value={displayWorkOrderTitle(workOrder)}
              />
              <PackageDetail
                label="Status"
                value={labelize(workOrder.status)}
              />
              <PackageDetail
                label="Priority"
                value={labelize(workOrder.priority)}
              />
              <PackageDetail label="Type" value={labelize(workOrder.type)} />
              <PackageDetail
                label="Facility"
                value={facilityName || workOrder.facilityId}
              />
              <PackageDetail label="Asset" value={workOrder.assetId || "—"} />
              <PackageDetail
                label="Assigned to"
                value={workOrder.assignedToUserId || "—"}
              />
              <PackageDetail
                label="Due"
                value={workOrder.dueAt ? formatDate(workOrder.dueAt) : "—"}
              />
              <PackageDetail
                label="Estimated cost"
                value={
                  workOrder.estimatedCost != null
                    ? String(workOrder.estimatedCost)
                    : "—"
                }
              />
              <PackageDetail
                label="Estimated hours"
                value={
                  workOrder.estimatedHours != null
                    ? String(workOrder.estimatedHours)
                    : "—"
                }
              />
              <PackageDetail
                label="Requested"
                value={
                  workOrder.requestedAt
                    ? formatDate(workOrder.requestedAt)
                    : formatDate(workOrder.createdAt)
                }
              />
              <div className="sm:col-span-2">
                <PackageDetail
                  label="Description / scope"
                  value={workOrder.description || "—"}
                />
              </div>
              <div className="sm:col-span-2">
                <PackageDetail
                  label="Work instructions"
                  value={workOrder.workInstructions || "—"}
                />
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted">
              Work order {current.workOrderId} could not be loaded. The package
              still retains the Approval cover letter from the Approval record.
            </p>
          )}
        </section>
      </div>
    </Modal>
  );
}

function PackageDetail({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">
        {label}
      </p>
      <div className="whitespace-pre-wrap text-sm text-foreground">{value}</div>
    </div>
  );
}
