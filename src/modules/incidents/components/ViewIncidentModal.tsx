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
  INCIDENT_SEVERITY_VARIANT,
  INCIDENT_STATUS_VARIANT,
} from "../constants";
import { labelize } from "../utils";
import type { Incident } from "../types";
import { IncidentIntelligencePanel } from "./intelligence/IncidentIntelligencePanel";

interface ViewIncidentModalProps {
  open: boolean;
  incident: Incident | null;
  onClose: () => void;
  onEdit?: (incident: Incident) => void;
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

export function ViewIncidentModal({
  open,
  incident,
  onClose,
  onEdit,
}: ViewIncidentModalProps) {
  const facilityName = useFacilityName(incident?.facilityId);
  const assetName = useAssetName(incident?.assetId);
  const assigneeName = useUserName(incident?.assignedToUserId);
  const reportedByName = useUserName(incident?.reportedByUserId);
  const workOrderTitle = useWorkOrderTitle(incident?.workOrderId);

  if (!incident) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={incident.title}
      description={incident.id}
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {onEdit ? (
            <Button
              onClick={() => {
                onClose();
                onEdit(incident);
              }}
            >
              Edit incident
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 pb-5">
        <Badge variant={INCIDENT_STATUS_VARIANT[incident.status]}>
          {labelize(incident.status)}
        </Badge>
        <Badge variant={INCIDENT_SEVERITY_VARIANT[incident.severity]}>
          {labelize(incident.severity)}
        </Badge>
        <span className="text-sm text-muted">{labelize(incident.type)}</span>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Detail label="Incident ID" value={incident.id} />
        <Detail label="Source" value={labelize(incident.source)} />
        <Detail
          label="Facility"
          value={facilityName || incident.facilityId}
        />
        <Detail
          label="Asset"
          value={incident.assetId ? assetName || incident.assetId : "—"}
        />
        <Detail
          label="Assigned to"
          value={
            incident.assignedToUserId
              ? assigneeName || incident.assignedToUserId
              : "—"
          }
        />
        <Detail
          label="Reported by"
          value={
            incident.reportedByUserId
              ? reportedByName || incident.reportedByUserId
              : "—"
          }
        />
        <Detail label="Reported at" value={formatDate(incident.reportedAt)} />
        <Detail
          label="Reported via"
          value={incident.reportedVia ? labelize(incident.reportedVia) : "—"}
        />
        <Detail
          label="Requires work order"
          value={incident.requiresWorkOrder ? "Yes" : "No"}
        />
        <Detail
          label="Work order"
          value={
            incident.workOrderId
              ? workOrderTitle || incident.workOrderId
              : "—"
          }
        />
        <Detail label="Location detail" value={incident.locationDetail || "—"} />
        <Detail label="Created at" value={formatDate(incident.createdAt)} />
        <Detail
          label="Description"
          value={incident.description || "—"}
        />
        <Detail label="Root cause" value={incident.rootCause || "—"} />
        <Detail
          label="Resolution notes"
          value={incident.resolutionNotes || "—"}
        />
      </div>

      <IncidentIntelligencePanel
        incidentId={incident.id}
        active={open}
      />
    </Modal>
  );
}
