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
  MAINTENANCE_PRIORITY_VARIANT,
  MAINTENANCE_STATUS_VARIANT,
} from "../constants";
import { labelize } from "../utils";
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
}: MaintenanceTableProps) {
  const columns = useMemo<Column<Maintenance>[]>(
    () => [
      {
        key: "title",
        header: "Maintenance",
        render: (row) => (
          <div>
            <span className="font-medium text-foreground">{row.title}</span>
            <p className="text-xs text-muted">{row.id}</p>
          </div>
        ),
      },
      {
        key: "facilityId",
        header: "Facility",
        render: (row) => (
          <span className="text-muted">
            <FacilityLabel id={row.facilityId} />
          </span>
        ),
      },
      {
        key: "assetId",
        header: "Asset",
        render: (row) => (
          <span className="text-muted">
            <AssetLabel id={row.assetId} />
          </span>
        ),
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
          </span>
        ),
      },
      {
        key: "reportedAt",
        header: "Reported At",
        render: (row) => (
          <span className="text-muted">{formatDate(row.reportedAt)}</span>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        className: "w-20 text-right",
        render: (row) => (
          <MaintenanceRowActions
            maintenance={row}
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
      data={items}
      rowKey={(row) => row.id}
      loading={loading}
      page={page}
      totalPages={totalPages}
      total={total}
      onPageChange={onPageChange}
      emptyTitle="No maintenance records match your filters"
      emptyDescription="Clear search or adjust priority, status, type, facility, and assignee filters."
      className="min-w-0"
    />
  );
}
