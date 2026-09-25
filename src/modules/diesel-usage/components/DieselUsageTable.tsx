"use client";

import { useMemo } from "react";
import { Fuel } from "lucide-react";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { formatDate } from "@/lib/utils";
import { useFacilityName } from "@/hooks/useEntityLabel";
import { dieselGeneratorPresentation, dieselVariance, getDieselUsageFlagLabels } from "../utils";
import type { DieselUsage } from "../types";
import { DieselUsageRowActions } from "./DieselUsageRowActions";

function FacilityLabel({ id }: { id: string }) {
  return <>{useFacilityName(id) || "—"}</>;
}

/** null = not recorded (never 0). */
function formatLitres(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "Not recorded";
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
        header: "Facility",
        render: (entry) => (
          <span className="text-foreground">
            <FacilityLabel id={entry.facilityId} />
          </span>
        ),
      },
      {
        key: "generatorId",
        header: "Generator ID",
        render: (entry) => {
          const generator = dieselGeneratorPresentation(entry);
          return (
            <div>
              <span className="text-foreground">{generator.primary}</span>
              {generator.note ? <p className="text-xs text-muted">{generator.note}</p> : null}
            </div>
          );
        },
      },
      {
        key: "openingLevel",
        header: "Opening (L)",
        render: (entry) => (
          <div>
            <span className="tabular-nums text-muted">{formatLitres(entry.openingLevel)}</span>
            {entry.undergroundTankQty != null || entry.surfaceTankQty != null ? (
              <p className="text-xs text-muted">
                Underground {formatLitres(entry.undergroundTankQty)} · Surface {formatLitres(entry.surfaceTankQty)}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        key: "added",
        header: "Added (L)",
        render: (entry) => (
          <span className="tabular-nums text-muted">
            {formatLitres(entry.added)}
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
          const flags = getDieselUsageFlagLabels(entry.consumption, entry.recordOrigin);
          const v = dieselVariance(entry);
          return (
            <div>
              <span className="tabular-nums font-medium text-foreground">
                {formatLitres(entry.consumption)}
              </span>
              {v && Math.abs(v.variance) >= 0.005 ? (
                <p className="mt-0.5 text-xs text-muted" title="Readings are physical measurements; the difference is shown, not corrected.">
                  Reading variance {v.variance > 0 ? "+" : ""}{v.variance} L
                </p>
              ) : null}
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
