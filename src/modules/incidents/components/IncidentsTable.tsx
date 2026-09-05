"use client";

import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { OperationalTone } from "@/components/operational";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { formatDate } from "@/lib/utils";
import {
  useFacilityName,
  useUserName,
} from "@/hooks/useEntityLabel";
import { INCIDENT_STATUS_VARIANT } from "../constants";
import { labelize } from "../utils";
import type { Incident } from "../types";
import { IncidentRowActions } from "./IncidentRowActions";

interface IncidentsTableProps {
  incidents: Incident[];
  loading: boolean;
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  onView: (incident: Incident) => void;
  onEdit: (incident: Incident) => void;
  onDeactivate: (incident: Incident) => void;
  canMutate?: boolean;
}

function LocationCell({ incident }: { incident: Incident }) {
  const name = useFacilityName(incident.facilityId);
  const detail = incident.locationDetail?.trim();

  return (
    <div>
      <span className="text-foreground">
        {name || incident.facilityId || "—"}
      </span>
      {detail ? <p className="text-xs text-muted">{detail}</p> : null}
    </div>
  );
}

function AssigneeLabel({ id }: { id?: string }) {
  const name = useUserName(id);
  return <>{id ? name || "—" : "—"}</>;
}

export function IncidentsTable({
  incidents,
  loading,
  page,
  totalPages,
  total,
  onPageChange,
  onView,
  onEdit,
  onDeactivate,
  canMutate = true,
}: IncidentsTableProps) {
  const columns = useMemo<Column<Incident>[]>(
    () => [
      {
        key: "title",
        header: "Event",
        render: (incident) => {
          const related = incident.sourceRequestId
            ? `Request ${incident.sourceRequestId}`
            : null;
          return (
            <div>
              <span className="font-medium text-foreground">
                {incident.title}
              </span>
              <p className="text-xs text-muted">{incident.id}</p>
              {related ? (
                <p className="text-xs text-muted">{related}</p>
              ) : null}
            </div>
          );
        },
      },
      {
        key: "facilityId",
        header: "Location",
        render: (incident) => <LocationCell incident={incident} />,
      },
      {
        key: "severity",
        header: "Severity",
        render: (incident) => (
          <OperationalTone
            value={incident.severity}
            label={labelize(incident.severity)}
          />
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (incident) => (
          <Badge variant={INCIDENT_STATUS_VARIANT[incident.status]}>
            {labelize(incident.status)}
          </Badge>
        ),
      },
      {
        key: "assignedToUserId",
        header: "Assigned To",
        render: (incident) => (
          <span className="text-muted">
            <AssigneeLabel id={incident.assignedToUserId} />
          </span>
        ),
      },
      {
        key: "reportedAt",
        header: "Reported",
        render: (incident) => {
          const contained = incident.containedAt;
          return (
            <div>
              <span className="text-muted">
                {formatDate(incident.reportedAt)}
              </span>
              {contained ? (
                <p className="text-xs text-muted">
                  Contained {formatDate(contained)}
                </p>
              ) : null}
            </div>
          );
        },
      },
      {
        key: "actions",
        header: "Actions",
        className: "w-20 text-right",
        render: (incident) => (
          <IncidentRowActions
            incident={incident}
            onView={onView}
            onEdit={onEdit}
            onDeactivate={onDeactivate}
            canMutate={canMutate}
          />
        ),
      },
    ],
    [onView, onEdit, onDeactivate, canMutate]
  );

  return (
    <DataTable
      columns={columns}
      data={incidents}
      rowKey={(incident) => incident.id}
      loading={loading}
      page={page}
      totalPages={totalPages}
      total={total}
      onPageChange={onPageChange}
      emptyIcon={AlertTriangle}
      emptyTitle="No significant events match your filters"
      emptyDescription="Clear search or adjust severity, status, facility, and assignee filters."
      className="min-w-0"
    />
  );
}
