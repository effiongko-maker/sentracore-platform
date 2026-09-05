"use client";

import { useMemo } from "react";
import { Wrench } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { formatDate } from "@/lib/utils";
import {
  useFacilityName,
  useUserName,
} from "@/hooks/useEntityLabel";
import {
  MAINTENANCE_PRIORITY_VARIANT,
  MAINTENANCE_STATUS_VARIANT,
} from "../constants";
import {
  displayMaintenanceLocation,
  displayMaintenanceTitle,
  labelize,
} from "../utils";
import type { Maintenance } from "../types";
import { MaintenanceRowActions } from "./MaintenanceRowActions";

interface MaintenanceTableProps {
  items: Maintenance[];
  loading: boolean;
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  onView: (maintenance: Maintenance) => void;
  onEdit: (maintenance: Maintenance) => void;
  onDeactivate: (maintenance: Maintenance) => void;
  canMutate?: boolean;
}

function FacilityCell({ row }: { row: Maintenance }) {
  const name = useFacilityName(row.facilityId);
  const location = displayMaintenanceLocation(row);

  return (
    <div>
      <span className="text-foreground">{name || row.facilityId || "—"}</span>
      {location ? <p className="text-xs text-muted">{location}</p> : null}
    </div>
  );
}

function AssigneeLabel({ id }: { id?: string }) {
  const name = useUserName(id);
  return <>{id ? name || "—" : "—"}</>;
}

export function MaintenanceTable({
  items,
  loading,
  page,
  totalPages,
  total,
  onPageChange,
  onView,
  onEdit,
  onDeactivate,
  canMutate = true,
}: MaintenanceTableProps) {
  const columns = useMemo<Column<Maintenance>[]>(
    () => [
      {
        key: "title",
        header: "Work",
        render: (row) => {
          const related = row.sourceRequestId
            ? `Request ${row.sourceRequestId}`
            : row.incidentId
              ? `Event ${row.incidentId}`
              : null;
          return (
            <div>
              <span className="font-medium text-foreground">
                {displayMaintenanceTitle(row)}
              </span>
              <p className="text-xs text-muted">{row.id}</p>
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
        render: (row) => <FacilityCell row={row} />,
      },
      {
        key: "priority",
        header: "Priority",
        render: (row) => (
          <Badge variant={MAINTENANCE_PRIORITY_VARIANT[row.priority]}>
            {labelize(row.priority)}
          </Badge>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (row) => (
          <Badge variant={MAINTENANCE_STATUS_VARIANT[row.status]}>
            {labelize(row.status)}
          </Badge>
        ),
      },
      {
        key: "assignedToUserId",
        header: "Assigned To",
        render: (row) => (
          <span className="text-muted">
            <AssigneeLabel id={row.assignedToUserId} />
            {row.department ? (
              <span className="block text-xs">{row.department}</span>
            ) : null}
          </span>
        ),
      },
      {
        key: "reportedAt",
        header: "Schedule / Done",
        render: (row) => {
          const when =
            row.status === "completed" && row.completedAt
              ? row.completedAt
              : row.scheduledStartAt || row.reportedAt;
          const label =
            row.status === "completed" && row.completedAt
              ? "Completed"
              : row.scheduledStartAt
                ? "Scheduled"
                : "Reported";
          return (
            <div>
              <span className="text-muted">{formatDate(when)}</span>
              <p className="text-xs text-muted">{label}</p>
            </div>
          );
        },
      },
      {
        key: "actions",
        header: "Actions",
        className: "w-20 text-right",
        render: (row) => (
          <MaintenanceRowActions
            key={`${row.id}:${page}:${total}`}
            maintenance={row}
            onView={onView}
            onEdit={onEdit}
            onDeactivate={onDeactivate}
            canMutate={canMutate}
          />
        ),
      },
    ],
    [onView, onEdit, onDeactivate, canMutate, page, total]
  );

  return (
    <DataTable
      columns={columns}
      data={items}
      rowKey={(row) => row.id}
      loading={loading}
      page={page}
      totalPages={totalPages}
      total={total}
      onPageChange={onPageChange}
      emptyIcon={Wrench}
      emptyTitle="No maintenance work matches your filters"
      emptyDescription="Clear search or adjust priority, status, type, facility, and assignee filters."
      className="min-w-0"
    />
  );
}
