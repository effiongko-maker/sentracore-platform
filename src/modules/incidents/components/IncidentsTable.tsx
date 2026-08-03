"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { formatDate } from "@/lib/utils";
import {
  useAssetName,
  useFacilityName,
  useUserName,
} from "@/hooks/useEntityLabel";
import {
  INCIDENT_SEVERITY_VARIANT,
  INCIDENT_STATUS_VARIANT,
} from "../constants";
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
}

function FacilityLabel({ id }: { id: string }) {
  return <>{useFacilityName(id) || "—"}</>;
}

function AssetLabel({ id }: { id?: string }) {
  const name = useAssetName(id);
  return <>{id ? name || "—" : "—"}</>;
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
}: IncidentsTableProps) {
  const columns = useMemo<Column<Incident>[]>(
    () => [
      {
        key: "title",
        header: "Incident",
        render: (incident) => (
          <div>
            <span className="font-medium text-foreground">{incident.title}</span>
            <p className="text-xs text-muted">{incident.id}</p>
          </div>
        ),
      },
      {
        key: "facilityId",
        header: "Facility",
        render: (incident) => (
          <span className="text-muted">
            <FacilityLabel id={incident.facilityId} />
          </span>
        ),
      },
      {
        key: "assetId",
        header: "Asset",
        render: (incident) => (
          <span className="text-muted">
            <AssetLabel id={incident.assetId} />
          </span>
        ),
      },
      {
        key: "severity",
        header: "Severity",
        render: (incident) => (
          <Badge variant={INCIDENT_SEVERITY_VARIANT[incident.severity]}>
            {labelize(incident.severity)}
          </Badge>
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
        header: "Reported At",
        render: (incident) => (
          <span className="text-muted">{formatDate(incident.reportedAt)}</span>
        ),
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
          />
        ),
      },
    ],
    [onView, onEdit, onDeactivate]
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
      emptyTitle="No incidents match your filters"
      emptyDescription="Clear search or adjust severity, status, facility, and assignee filters."
      className="min-w-0"
    />
  );
}
