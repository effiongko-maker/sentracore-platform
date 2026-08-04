"use client";

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
import {
  MAINTENANCE_PRIORITY_VARIANT,
  MAINTENANCE_STATUS_VARIANT,
} from "../constants";
import { labelize } from "../utils";
import type { Maintenance } from "../types";

interface ViewMaintenanceModalProps {
  open: boolean;
  maintenance: Maintenance | null;
  onClose: () => void;
  onEdit?: (maintenance: Maintenance) => void;
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

export function ViewMaintenanceModal({
  open,
  maintenance,
  onClose,
  onEdit,
}: ViewMaintenanceModalProps) {
  const facilityName = useFacilityName(maintenance?.facilityId);
  const assetName = useAssetName(maintenance?.assetId);
  const assigneeName = useUserName(maintenance?.assignedToUserId);
  const reportedByName = useUserName(maintenance?.reportedByUserId);
  const workOrderTitle = useWorkOrderTitle(maintenance?.workOrderId);

  if (!maintenance) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={maintenance.title}
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
              Edit maintenance
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
          value={facilityName || maintenance.facilityId}
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
        <Detail
          label="Reported by"
          value={
            maintenance.reportedByUserId
              ? reportedByName || maintenance.reportedByUserId
              : "—"
          }
        />
        <Detail label="Department" value={maintenance.department || "—"} />
        <Detail label="Event ID" value={maintenance.eventId || "—"} />
        <Detail label="Reported at" value={formatDate(maintenance.reportedAt)} />
        <Detail
          label="Completed at"
          value={
            maintenance.completedAt ? formatDate(maintenance.completedAt) : "—"
          }
        />
        <Detail
          label="Requires work order"
          value={maintenance.requiresWorkOrder ? "Yes" : "No"}
        />
        <Detail
          label="Work order"
          value={
            maintenance.workOrderId
              ? workOrderTitle || maintenance.workOrderId
              : "—"
          }
        />
        <Detail label="Created at" value={formatDate(maintenance.createdAt)} />
        <Detail
          label="Description"
          value={maintenance.description || "—"}
        />
        <Detail
          label="Completion notes"
          value={maintenance.completionNotes || "—"}
        />
        <Detail
          label="Work performed"
          value={maintenance.workPerformed || "—"}
        />
      </div>
    </Modal>
  );
}
