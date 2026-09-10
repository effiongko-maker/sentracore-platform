"use client";

import { useMemo } from "react";
import { Fuel } from "lucide-react";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { formatDate } from "@/lib/utils";
import { getDieselUsageFlagLabels } from "../utils";
import type { DieselUsage } from "../types";
import { DieselUsageRowActions } from "./DieselUsageRowActions";

function formatLitres(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return String(value);
}

interface DieselUsageTableProps {
  entries: DieselUsage[];
  loading: boolean;
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  onView: (entry: DieselUsage) => void;
  onEdit: (entry: DieselUsage) => void;
  canMutate?: boolean;
}

export function DieselUsageTable({
  entries,
  loading,
  page,
  totalPages,
  total,
  onPageChange,
  onView,
  onEdit,
  canMutate = true,
}: DieselUsageTableProps) {
  const columns = useMemo<Column<DieselUsage>[]>(
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
        key: "facilityId",
        header: "Facility ID",
        render: (entry) => (
          <span className="text-foreground">{entry.facilityId || "—"}</span>
        ),
      },
      {
        key: "generatorId",
        header: "Generator ID",
        render: (entry) => (
          <span className="text-foreground">{entry.generatorId || "—"}</span>
        ),
      },
      {
        key: "openingLevel",
        header: "Opening (L)",
        render: (entry) => (
          <span className="tabular-nums text-muted">
            {formatLitres(entry.openingLevel)}
          </span>
        ),
      },
      {
        key: "added",
        header: "Added (L)",
        render: (entry) => (
          <span className="tabular-nums text-muted">
            {entry.added == null ? "—" : formatLitres(entry.added)}
          </span>
        ),
      },
      {
        key: "closingLevel",
        header: "Closing (L)",
        render: (entry) => (
          <span className="tabular-nums text-muted">
            {formatLitres(entry.closingLevel)}
          </span>
        ),
      },
      {
        key: "consumption",
        header: "Consumption (L)",
        render: (entry) => {
          const flags = getDieselUsageFlagLabels(entry.consumption);
          return (
            <div>
              <span className="tabular-nums font-medium text-foreground">
                {formatLitres(entry.consumption)}
              </span>
              {flags.length > 0 ? (
                <p className="mt-0.5 text-xs text-danger">{flags.join(" · ")}</p>
              ) : null}
            </div>
          );
        },
      },
      {
        key: "actions",
        header: "Actions",
        className: "w-20 text-right",
        render: (entry) => (
          <DieselUsageRowActions
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
      emptyIcon={Fuel}
      emptyTitle="No diesel usage entries match your filters"
      emptyDescription="Clear search or adjust facility, generator, and date filters."
      className="min-w-0"
    />
  );
}
