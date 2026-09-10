"use client";

import { useMemo } from "react";
import { Gauge } from "lucide-react";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { formatDate } from "@/lib/utils";
import type { EnergyReading } from "../types";
import { EnergyReadingRowActions } from "./EnergyReadingRowActions";

function formatReading(reading: number): string {
  if (!Number.isFinite(reading)) return "—";
  return String(reading);
}

interface EnergyReadingsTableProps {
  entries: EnergyReading[];
  loading: boolean;
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  onView: (entry: EnergyReading) => void;
  onEdit: (entry: EnergyReading) => void;
  canMutate?: boolean;
}

export function EnergyReadingsTable({
  entries,
  loading,
  page,
  totalPages,
  total,
  onPageChange,
  onView,
  onEdit,
  canMutate = true,
}: EnergyReadingsTableProps) {
  const columns = useMemo<Column<EnergyReading>[]>(
    () => [
      {
        key: "date",
        header: "Date",
        render: (entry) => (
          <div>
            <span className="font-medium text-foreground">
              {entry.date ? formatDate(entry.date) : "—"}
            </span>
            <p className="text-xs text-muted">{entry.id}</p>
          </div>
        ),
      },
      {
        key: "meter",
        header: "Meter No.",
        render: (entry) => (
          <span className="text-foreground">{entry.meter || "—"}</span>
        ),
      },
      {
        key: "reading",
        header: "Reading",
        render: (entry) => (
          <span className="tabular-nums text-foreground">
            {formatReading(entry.reading)}
          </span>
        ),
      },
      {
        key: "remarks",
        header: "Remarks",
        render: (entry) => (
          <span className="line-clamp-2 max-w-[14rem] text-muted">
            {entry.remarks?.trim() || "—"}
          </span>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        className: "w-20 text-right",
        render: (entry) => (
          <EnergyReadingRowActions
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
      emptyIcon={Gauge}
      emptyTitle="No energy readings match your filters"
      emptyDescription="Clear search or adjust meter and date filters to find meter readings."
      className="min-w-0"
    />
  );
}
