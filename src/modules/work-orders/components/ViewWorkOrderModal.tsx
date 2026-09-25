"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/modals/Modal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/utils";
import {
  useAssetName,
  useFacilityName,
  useMaintenanceTitle,
  useUserName,
} from "@/hooks/useEntityLabel";
import {
  WORK_ORDER_PRIORITY_VARIANT,
  WORK_ORDER_STATUS_VARIANT,
} from "../constants";
import {
  resolveWorkInstructionKind,
  WORK_INSTRUCTION_KIND_LABELS,
  WORK_INSTRUCTION_KIND_SUMMARIES,
} from "../instructionKind";
import { displayWorkOrderTitle, labelize } from "../utils";
import { WORK_ORDER_SUBMISSION_STATUS_LABELS, type CommercialFollowUp, type WorkOrder } from "../types";
import { WorkOrderService } from "@/services/workOrders/WorkOrderService";
import { formatFinancialAmount } from "@/modules/finance/utils/formatFinancialAmount";
import { COMMERCIAL_FOLLOW_UP_METHODS } from "@/components/commercial/CommercialFollowUpModal";
import { WorkOrderClientApprovalSection } from "./WorkOrderClientApprovalSection";

interface ViewWorkOrderModalProps {
  open: boolean;
  workOrder: WorkOrder | null;
  onClose: () => void;
  onEdit?: (workOrder: WorkOrder) => void;
  /** Edit the commercial submission facts (date, amount, status, facilities, Works). */
  onEditSubmission?: (workOrder: WorkOrder) => void;
  onRecordFollowUp?: (workOrder: WorkOrder) => void;
  /** Bumped by the parent after a follow-up is recorded, to reload the history. */
  followUpsVersion?: number;
}

function FacilityName({ id }: { id: string }) {
  return <>{useFacilityName(id) || id}</>;
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">
        {label}
      </p>
      <div className="text-sm text-foreground">{value || "—"}</div>
    </div>
  );
}

export function ViewWorkOrderModal({
  open,
  workOrder,
  onClose,
  onEdit,
  onEditSubmission,
  onRecordFollowUp,
  followUpsVersion = 0,
}: ViewWorkOrderModalProps) {
  const [followUps, setFollowUps] = useState<CommercialFollowUp[] | null>(null);
  const workOrderId = open ? workOrder?.id : undefined;
  useEffect(() => {
    if (!workOrderId) return;
    let cancelled = false;
    WorkOrderService.listFollowUps(workOrderId)
      .then((list) => !cancelled && setFollowUps(list))
      .catch(() => !cancelled && setFollowUps(null));
    return () => {
      cancelled = true;
    };
  }, [workOrderId, followUpsVersion]);
  const facilityName = useFacilityName(workOrder?.facilityId);
  const assetName = useAssetName(workOrder?.assetId);
  const assigneeName = useUserName(workOrder?.assignedToUserId);
  const reportedByName = useUserName(workOrder?.reportedByUserId);
  const maintenanceTitle = useMaintenanceTitle(workOrder?.maintenanceId);
  const instructionKind = workOrder
    ? resolveWorkInstructionKind(workOrder)
    : "work_order";

  if (!workOrder) return null;

  const title = displayWorkOrderTitle(workOrder);
  // A WO/JO created as a commercial submission has no operational lifecycle of its own (operations live on Work).
  const operational = Boolean(workOrder.maintenanceId) || workOrder.recordOrigin === "migrated_historical";
  const facilities = workOrder.facilityIds?.length ? workOrder.facilityIds : [workOrder.facilityId];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={workOrder.id}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {onRecordFollowUp ? (
            <Button variant="outline" onClick={() => onRecordFollowUp(workOrder)}>
              Record follow-up
            </Button>
          ) : null}
          {onEditSubmission ? (
            <Button
              variant={operational && onEdit ? "outline" : undefined}
              onClick={() => {
                onClose();
                onEditSubmission(workOrder);
              }}
            >
              Edit submission
            </Button>
          ) : null}
          {onEdit && operational ? (
            <Button
              onClick={() => {
                onClose();
                onEdit(workOrder);
              }}
            >
              Treat work order
            </Button>
          ) : null}
        </>
      }
    >
      {workOrder.recordOrigin === "migrated_historical" ? (
        <div className="mb-4 rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-sm" role="note">
          <p className="font-medium text-foreground">Historical imported record</p>
          <p className="mt-0.5 text-muted">
            This record reflects source evidence migrated into SentraCore™ and is read-only.
          </p>
        </div>
      ) : null}
      <section className="mb-5 space-y-3 rounded-lg border border-border/70 p-4" aria-label="Commercial submission">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">Commercial submission</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Detail
            label="Submission status"
            value={
              workOrder.submissionStatus
                ? WORK_ORDER_SUBMISSION_STATUS_LABELS[workOrder.submissionStatus]
                : workOrder.recordOrigin === "migrated_historical"
                  ? "Not recorded in the imported register"
                  : "Not recorded"
            }
          />
          <Detail label="Submitted" value={workOrder.submissionDate ? formatDate(workOrder.submissionDate) : "—"} />
          <Detail label="Submitted amount" value={workOrder.submissionAmount != null ? formatFinancialAmount(workOrder.submissionAmount, "NGN") : "Not recorded"} />
          {workOrder.executionCost != null ? (
            <Detail label="Execution cost · source register" value={formatFinancialAmount(workOrder.executionCost, "NGN")} />
          ) : null}
          <Detail
            label="Facility"
            value={facilities.map((id, index) => (
              <span key={id}>
                {index > 0 ? " + " : ""}
                <FacilityName id={id} />
              </span>
            ))}
          />
          <Detail
            label="Work included"
            value={(workOrder.linkedWorkIds ?? []).length ? (workOrder.linkedWorkIds ?? []).join(", ") : "None linked"}
          />
          <Detail label="Last follow-up" value={workOrder.lastFollowUpAt ? formatDate(workOrder.lastFollowUpAt) : "None recorded"} />
        </div>
        {followUps && followUps.length ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted">Follow-up history</p>
            <ul className="mt-2 space-y-2">
              {followUps.map((f) => (
                <li key={f.id} className="rounded-md bg-muted/30 px-3 py-2 text-sm">
                  <p className="font-medium text-foreground">
                    {formatDate(f.followedUpAt)} · {COMMERCIAL_FOLLOW_UP_METHODS.find((m) => m.value === f.method)?.label ?? f.method}
                    {f.contactPerson ? ` · ${f.contactPerson}` : ""}
                  </p>
                  <p className="text-muted">{f.outcomeNotes}</p>
                  {f.nextFollowUpAt ? <p className="text-xs text-muted">Next follow-up {formatDate(f.nextFollowUpAt)}</p> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 pb-5">
        {operational ? (
          <>
            <Badge variant={WORK_ORDER_STATUS_VARIANT[workOrder.status]}>
              {labelize(workOrder.status)}
            </Badge>
            <Badge variant={WORK_ORDER_PRIORITY_VARIANT[workOrder.priority]}>
              {labelize(workOrder.priority)}
            </Badge>
          </>
        ) : null}
        <Badge
          variant={instructionKind === "job_order" ? "warning" : "default"}
        >
          {WORK_INSTRUCTION_KIND_LABELS[instructionKind]}
        </Badge>
        <span className="text-sm text-muted">
          {labelize(workOrder.type)}
          {workOrder.maintenanceType
            ? ` · ${labelize(workOrder.maintenanceType)}`
            : ""}
        </span>
      </div>

      {operational ? (
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Detail label="Record ID" value={workOrder.id} />
        <Detail
          label="Order type"
          value={
            <div className="space-y-1">
              <p>{WORK_INSTRUCTION_KIND_LABELS[instructionKind]}</p>
              <p className="text-xs text-muted font-normal normal-case tracking-normal">
                {WORK_INSTRUCTION_KIND_SUMMARIES[instructionKind]}
              </p>
            </div>
          }
        />
        <Detail label="Source" value={labelize(workOrder.source)} />
        <Detail label="Work category" value={labelize(workOrder.type)} />
        <Detail label="Facility" value={facilityName || workOrder.facilityId} />
        <Detail
          label="Asset"
          value={
            workOrder.assetId ? assetName || workOrder.assetId : "—"
          }
        />
        <Detail
          label="Source maintenance"
          value={
            workOrder.maintenanceId
              ? `${workOrder.maintenanceId}${
                  maintenanceTitle ? ` — ${maintenanceTitle}` : ""
                }`
              : "—"
          }
        />
        <Detail
          label="Source incident"
          value={workOrder.incidentId || "—"}
        />
        <Detail
          label="Assigned to"
          value={
            workOrder.assignedToUserId
              ? assigneeName || workOrder.assignedToUserId
              : "—"
          }
        />
        <Detail
          label="Reported by"
          value={
            workOrder.reportedByUserId
              ? reportedByName || workOrder.reportedByUserId
              : "—"
          }
        />
        <Detail
          label="Due date"
          value={workOrder.dueAt ? formatDate(workOrder.dueAt) : "—"}
        />
        <Detail
          label="Estimated hours"
          value={
            workOrder.estimatedHours != null
              ? String(workOrder.estimatedHours)
              : "—"
          }
        />
        <Detail
          label="Estimated cost"
          value={
            workOrder.estimatedCost != null
              ? String(workOrder.estimatedCost)
              : "—"
          }
        />
        <Detail label="Created at" value={formatDate(workOrder.createdAt)} />
        <Detail label="Updated at" value={formatDate(workOrder.updatedAt)} />
        <Detail
          label="Description"
          value={workOrder.description || "—"}
        />
        <Detail
          label="Work instructions"
          value={workOrder.workInstructions || "—"}
        />
        <Detail
          label="Completion notes"
          value={workOrder.completionNotes || "—"}
        />
      </div>
      ) : null}

      <WorkOrderClientApprovalSection workOrder={workOrder} />
    </Modal>
  );
}
