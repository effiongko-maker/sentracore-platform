"use client";

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
import { displayWorkOrderTitle, labelize } from "../utils";
import type { WorkOrder } from "../types";
import { WorkOrderClientApprovalSection } from "./WorkOrderClientApprovalSection";

interface ViewWorkOrderModalProps {
  open: boolean;
  workOrder: WorkOrder | null;
  onClose: () => void;
  onEdit?: (workOrder: WorkOrder) => void;
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
}: ViewWorkOrderModalProps) {
  const facilityName = useFacilityName(workOrder?.facilityId);
  const assetName = useAssetName(workOrder?.assetId);
  const assigneeName = useUserName(workOrder?.assignedToUserId);
  const reportedByName = useUserName(workOrder?.reportedByUserId);
  const maintenanceTitle = useMaintenanceTitle(workOrder?.maintenanceId);

  if (!workOrder) return null;

  const title = displayWorkOrderTitle(workOrder);

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
          {onEdit ? (
            <Button
              onClick={() => {
                onClose();
                onEdit(workOrder);
              }}
            >
              Edit work order
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 pb-5">
        <Badge variant={WORK_ORDER_STATUS_VARIANT[workOrder.status]}>
          {labelize(workOrder.status)}
        </Badge>
        <Badge variant={WORK_ORDER_PRIORITY_VARIANT[workOrder.priority]}>
          {labelize(workOrder.priority)}
        </Badge>
        <span className="text-sm text-muted">
          {labelize(workOrder.type)}
          {workOrder.maintenanceType
            ? ` · ${labelize(workOrder.maintenanceType)}`
            : ""}
        </span>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Detail label="Work Order ID" value={workOrder.id} />
        <Detail label="Source" value={labelize(workOrder.source)} />
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

      <WorkOrderClientApprovalSection workOrder={workOrder} />
    </Modal>
  );
}
