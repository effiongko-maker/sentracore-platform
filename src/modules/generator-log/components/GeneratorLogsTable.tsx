"use client";

import { useMemo } from "react";
import { Zap } from "lucide-react";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { formatDate } from "@/lib/utils";
import type { GeneratorLog } from "../types";
import { GeneratorLogRowActions } from "./GeneratorLogRowActions";

/** Hour-meter readings are counter values, not times. */
function formatReading(value: number | null): string {
  return value == null ? "—" : value.toLocaleString("en-GB", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
}

function formatHours(hours: number): string {
  if (!Number.isFinite(hours)) return "—";
  return hours.toFixed(2);
}

/**
 * Diesel is ONE total per date for all generators (carried by one log of the date). Other logs of that date show that
 * their fuel is inside that date total — never an amount of their own. null with no date total = not recorded (never 0).
 */
function formatFuel(fuelUsed: number | null, dateHasTotal: boolean): string {
  if (fuelUsed != null) return `${fuelUsed.toLocaleString("en-GB")} L · date total`;
  return dateHasTotal ? "In date total" : "Not recorded";
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
  // Dates in view whose diesel total is carried by one of their logs.
  const datesWithTotal = useMemo(
    () => new Set(entries.filter((entry) => entry.fuelUsed != null).map((entry) => entry.date)),
    [entries]
  );

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
        key: "startMeterReading",
        header: "Start reading",
        render: (entry) => (
          <span className="tabular-nums text-muted">{formatReading(entry.startMeterReading)}</span>
        ),
      },
      {
        key: "endMeterReading",
        header: "End reading",
        render: (entry) => (
          <span className="tabular-nums text-muted">{formatReading(entry.endMeterReading)}</span>
        ),
      },
      {
        key: "hours",
        header: "Run hours",
        render: (entry) => (
          <span className="tabular-nums text-foreground">
            {formatHours(entry.hours)}
          </span>
        ),
      },
      {
        key: "fuelUsed",
        header: "Diesel (date total, all generators)",
        render: (entry) => (
          <span className="tabular-nums text-muted" title="Total diesel used on this date by all generators — not this generator's own consumption.">
            {formatFuel(entry.fuelUsed, datesWithTotal.has(entry.date))}
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
    [onView, onEdit, canMutate, datesWithTotal]
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
