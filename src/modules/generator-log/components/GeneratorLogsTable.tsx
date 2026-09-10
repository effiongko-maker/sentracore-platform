"use client";

import { useMemo } from "react";
import { Zap } from "lucide-react";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { formatDate } from "@/lib/utils";
import type { GeneratorLog } from "../types";
import { GeneratorLogRowActions } from "./GeneratorLogRowActions";

function formatDateTime(iso?: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatHours(hours: number): string {
  if (!Number.isFinite(hours)) return "—";
  return hours.toFixed(2);
}

function formatFuel(fuelUsed: number): string {
  if (!Number.isFinite(fuelUsed)) return "—";
  return String(fuelUsed);
}

interface GeneratorLogsTableProps {
  entries: GeneratorLog[];
  loading: boolean;
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  onView: (entry: GeneratorLog) => void;
  onEdit: (entry: GeneratorLog) => void;
  canMutate?: boolean;
}

export function GeneratorLogsTable({
  entries,
  loading,
  page,
  totalPages,
  total,
  onPageChange,
  onView,
  onEdit,
  canMutate = true,
}: GeneratorLogsTableProps) {
  const columns = useMemo<Column<GeneratorLog>[]>(
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
        key: "generator",
        header: "Generator",
        render: (entry) => (
          <span className="text-foreground">{entry.generator || "—"}</span>
        ),
      },
      {
        key: "startedAt",
        header: "Start",
        render: (entry) => (
          <span className="text-muted">{formatDateTime(entry.startedAt)}</span>
        ),
      },
      {
        key: "endedAt",
        header: "End",
        render: (entry) => (
          <span className="text-muted">{formatDateTime(entry.endedAt)}</span>
        ),
      },
      {
        key: "hours",
        header: "Hours",
        render: (entry) => (
          <span className="tabular-nums text-foreground">
            {formatHours(entry.hours)}
          </span>
        ),
      },
      {
        key: "fuelUsed",
        header: "Diesel Used",
        render: (entry) => (
          <span className="tabular-nums text-muted">
            {formatFuel(entry.fuelUsed)}
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
          <GeneratorLogRowActions
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
      emptyIcon={Zap}
      emptyTitle="No generator logs match your filters"
      emptyDescription="Clear search or adjust generator and date filters to find run logs."
      className="min-w-0"
    />
  );
}
