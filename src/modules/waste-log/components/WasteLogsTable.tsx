"use client";

import { useMemo } from "react";
import { Recycle } from "lucide-react";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { useFacilityName } from "@/hooks/useEntityLabel";
import { formatDate } from "@/lib/utils";
import type { WasteLog } from "../types";
import { WasteLogRowActions } from "./WasteLogRowActions";

function FacilityLabel({ id }: { id: string }) {
  return <>{useFacilityName(id) || "—"}</>;
}

function formatQuantity(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return String(value);
}

interface WasteLogsTableProps {
  entries: WasteLog[];
  loading: boolean;
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  onView: (entry: WasteLog) => void;
  onEdit: (entry: WasteLog) => void;
  canMutate?: boolean;
}

export function WasteLogsTable({
  entries,
  loading,
  page,
  totalPages,
  total,
  onPageChange,
  onView,
  onEdit,
  canMutate = true,
}: WasteLogsTableProps) {
  const columns = useMemo<Column<WasteLog>[]>(
    () => [
      {
        key: "id",
        header: "Log ID",
        render: (entry) => (
          <span className="font-medium text-foreground">{entry.id || "—"}</span>
        ),
      },
      {
        key: "facilityId",
        header: "Facility",
        render: (entry) => <FacilityLabel id={entry.facilityId} />,
      },
      {
        key: "wasteType",
        header: "Waste Type",
        render: (entry) => (
          <span className="text-foreground">{entry.wasteType || "—"}</span>
        ),
      },
      {
        key: "quantity",
        header: "Quantity",
        render: (entry) => (
          <span className="tabular-nums text-muted">
            {formatQuantity(entry.quantity)}
          </span>
        ),
      },
      {
        key: "unit",
        header: "Unit",
        render: (entry) => (
          <span className="text-muted">{entry.unit || "—"}</span>
        ),
      },
      {
        key: "disposalMethod",
        header: "Disposal Method",
        render: (entry) => (
          <span className="text-foreground">
            {entry.disposalMethod || "—"}
          </span>
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
          <WasteLogRowActions
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
      emptyIcon={Recycle}
      emptyTitle="No waste logs match your filters"
      emptyDescription="Clear search or adjust facility, waste type, and date filters."
      className="min-w-0"
    />
  );
}
