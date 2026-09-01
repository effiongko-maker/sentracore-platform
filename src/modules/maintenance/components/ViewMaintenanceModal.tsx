"use client";

import { useState } from "react";
import { Modal } from "@/components/modals/Modal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/utils";
import {
  useAssetName,
  useFacilityName,
  useUserName,
  useWorkOrderTitle,
} from "@/hooks/useEntityLabel";
import { createWorkOrderFromMaintenance } from "@/modules/work-orders/actions/createWorkOrderFromMaintenance";
import { useToast } from "@/components/ui/Toast";
import {
  MAINTENANCE_PRIORITY_VARIANT,
  MAINTENANCE_STATUS_VARIANT,
} from "../constants";
import {
  displayMaintenanceTitle,
  labelize,
  parseMaintenanceDescriptionNotes,
} from "../utils";
import type { Maintenance } from "../types";

interface ViewMaintenanceModalProps {
  open: boolean;
  maintenance: Maintenance | null;
  onClose: () => void;
  onEdit?: (maintenance: Maintenance) => void;
  onUpdated?: (maintenance: Maintenance) => void;
  onOpenWorkOrder?: (workOrderId: string) => void;
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">
        {label}
      </p>
      <div className="text-sm text-foreground whitespace-pre-wrap">
        {value || "—"}
      </div>
    </div>
  );
}

export function ViewMaintenanceModal({
  open,
  maintenance,
  onClose,
  onEdit,
  onUpdated,
  onOpenWorkOrder,
}: ViewMaintenanceModalProps) {
  const { toast } = useToast();
  const [creatingWorkOrder, setCreatingWorkOrder] = useState(false);
  const facilityName = useFacilityName(maintenance?.facilityId);
  const assetName = useAssetName(maintenance?.assetId);
  const assigneeName = useUserName(maintenance?.assignedToUserId);
  const reportedByName = useUserName(maintenance?.reportedByUserId);
  const workOrderTitle = useWorkOrderTitle(maintenance?.workOrderId);

  if (!maintenance) return null;

  const title = displayMaintenanceTitle(maintenance);
  const notes = parseMaintenanceDescriptionNotes(maintenance.description);
  const requesterLabel =
    notes.requestedBy ||
    (maintenance.reportedByUserId
      ? reportedByName || maintenance.reportedByUserId
      : undefined);
  const needsWorkOrderLink =
    Boolean(maintenance.requiresWorkOrder) && !maintenance.workOrderId;

  async function handleCreateWorkOrder() {
    if (!maintenance) return;
    setCreatingWorkOrder(true);
    try {
      const result = await createWorkOrderFromMaintenance(maintenance.id);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      toast({
        type: "success",
        title: "Work order created",
        description: `${result.data.workOrder.id} linked to this maintenance record.`,
      });
      onUpdated?.(result.data.maintenance);
    } catch (err) {
      toast({
        type: "error",
        title: "Unable to create work order",
        description:
          err instanceof Error ? err.message : "Please try again in a moment.",
      });
    } finally {
      setCreatingWorkOrder(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={maintenance.id}
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
                onEdit(maintenance);
              }}
            >
              Treat work
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 pb-5">
        <Badge variant={MAINTENANCE_STATUS_VARIANT[maintenance.status]}>
          {labelize(maintenance.status)}
        </Badge>
        <Badge variant={MAINTENANCE_PRIORITY_VARIANT[maintenance.priority]}>
          {labelize(maintenance.priority)}
        </Badge>
        <span className="text-sm text-muted">{labelize(maintenance.type)}</span>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Detail label="Maintenance ID" value={maintenance.id} />
        <Detail label="Source" value={labelize(maintenance.source)} />
        <Detail
          label="Facility"
          value={
            <div>
              <div>{facilityName || maintenance.facilityId}</div>
              {notes.location ? (
                <p className="mt-1 text-xs text-muted">{notes.location}</p>
              ) : null}
            </div>
          }
        />
        <Detail
          label="Category"
          value={
            notes.category ||
            (maintenance.categoryId
              ? labelize(maintenance.categoryId)
              : "—")
          }
        />
        <Detail
          label="Asset"
          value={maintenance.assetId ? assetName || maintenance.assetId : "—"}
        />
        <Detail
          label="Assigned to"
          value={
            maintenance.assignedToUserId
              ? assigneeName || maintenance.assignedToUserId
              : "—"
          }
        />
        <Detail label="Requested by" value={requesterLabel || "—"} />
        <Detail label="Department" value={maintenance.department || "—"} />
        <Detail label="Event ID" value={maintenance.eventId || "—"} />
        <Detail label="Reported at" value={formatDate(maintenance.reportedAt)} />
        {maintenance.status === "completed" ? (
          <>
            <Detail
              label="Completed at"
              value={
                maintenance.completedAt
                  ? formatDate(maintenance.completedAt)
                  : "—"
              }
            />
            <Detail
              label="Completion notes"
              value={maintenance.completionNotes || "—"}
            />
          </>
        ) : (
          <Detail
            label="Completed at"
            value={
              maintenance.completedAt
                ? formatDate(maintenance.completedAt)
                : "—"
            }
          />
        )}
        <Detail
          label="Requires work order"
          value={maintenance.requiresWorkOrder ? "Yes" : "No"}
        />
        <Detail
          label="Work order"
          value={
            maintenance.workOrderId ? (
              <button
                type="button"
                className="text-left text-sm font-medium text-accent underline-offset-2 hover:underline"
                onClick={() => onOpenWorkOrder?.(maintenance.workOrderId!)}
              >
                {maintenance.workOrderId}
                {workOrderTitle ? ` — ${workOrderTitle}` : ""}
              </button>
            ) : needsWorkOrderLink ? (
              <div className="space-y-2">
                <p className="text-sm text-muted">No work order linked yet</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    loading={creatingWorkOrder}
                    onClick={() => void handleCreateWorkOrder()}
                  >
                    Create new work order
                  </Button>
                  {onEdit ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        onClose();
                        onEdit(maintenance);
                      }}
                    >
                      Link existing work order
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              "—"
            )
          }
        />
        <Detail label="Created at" value={formatDate(maintenance.createdAt)} />
        <Detail
          label="Description"
          value={notes.body || maintenance.description || "—"}
        />
        {notes.attachment ? (
          <Detail label="Attachment" value={notes.attachment} />
        ) : null}
        {maintenance.status !== "completed" ? (
          <Detail
            label="Completion notes"
            value={maintenance.completionNotes || "—"}
          />
        ) : null}
        <Detail
          label="Work performed"
          value={maintenance.workPerformed || "—"}
        />
      </div>
    </Modal>
  );
}
