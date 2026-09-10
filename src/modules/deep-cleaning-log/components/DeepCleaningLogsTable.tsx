"use client";

import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { useFacilityName } from "@/hooks/useEntityLabel";
import { formatDate } from "@/lib/utils";
import type { DeepCleaningLog } from "../types";
import { DeepCleaningLogRowActions } from "./DeepCleaningLogRowActions";

function FacilityLabel({ id }: { id: string }) {
  return <>{useFacilityName(id) || "—"}</>;
}

interface DeepCleaningLogsTableProps {
  entries: DeepCleaningLog[];
  loading: boolean;
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  onView: (entry: DeepCleaningLog) => void;
  onEdit: (entry: DeepCleaningLog) => void;
  canMutate?: boolean;
}

export function DeepCleaningLogsTable({
  entries,
  loading,
  page,
  totalPages,
  total,
  onPageChange,
  onView,
  onEdit,
  canMutate = true,
}: DeepCleaningLogsTableProps) {
  const columns = useMemo<Column<DeepCleaningLog>[]>(
    () => [
      {
        key: "id",
        header: "Log ID",
        render: (entry) => (
          <span className="font-medium text-foreground">{entry.id || "—"}</span>
        ),
      },
      {
        key: "date",
        header: "Date",
        render: (entry) => (
          <span className="text-muted">
            {entry.date ? formatDate(entry.date) : "—"}
          </span>
        ),
      },
      {
        key: "facilityId",
        header: "Facility",
        render: (entry) => <FacilityLabel id={entry.facilityId} />,
      },
      {
        key: "area",
        header: "Area",
        render: (entry) => (
          <span className="text-foreground">{entry.area || "—"}</span>
        ),
      },
      {
        key: "vendorTeam",
        header: "Vendor/Team",
        render: (entry) => (
          <span className="text-muted">{entry.vendorTeam || "—"}</span>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (entry) => (
          <span className="text-foreground">{entry.status || "—"}</span>
        ),
      },
      {
        key: "remarks",
        header: "Remarks",
        render: (entry) => (
          <span className="line-clamp-2 text-muted">
            {entry.remarks?.trim() || "—"}
          </span>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        className: "w-20 text-right",
        render: (entry) => (
          <DeepCleaningLogRowActions
            entry={entry}
            onView={onView}
            onEdit={onEdit}
            canMutate={canMutate}
          />
        ),
      },
    ],
    [onView, onEdit, canMutate]
  );

  return (
    <DataTable
      columns={columns}
      data={entries}
      rowKey={(entry) => entry.id}
      loading={loading}
      page={page}
      totalPages={totalPages}
      total={total}
      onPageChange={onPageChange}
      emptyIcon={Sparkles}
      emptyTitle="No deep cleaning logs match your filters"
      emptyDescription="Clear search or adjust facility, status, and date filters."
      className="min-w-0"
    />
  );
}
