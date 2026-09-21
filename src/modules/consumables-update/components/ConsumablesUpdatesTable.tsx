"use client";

import { useMemo } from "react";
import { Package } from "lucide-react";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { useFacilityName } from "@/hooks/useEntityLabel";
import { formatDate } from "@/lib/utils";
import { getConsumablesUpdateFlagLabels } from "../utils";
import type { ConsumablesUpdate } from "../types";
import { ConsumablesUpdateRowActions } from "./ConsumablesUpdateRowActions";

function formatQty(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return String(value);
}

function FacilityLabel({ id }: { id: string }) {
  return <>{useFacilityName(id) || "—"}</>;
}

interface ConsumablesUpdatesTableProps {
  entries: ConsumablesUpdate[];
  loading: boolean;
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  onView: (entry: ConsumablesUpdate) => void;
  onEdit: (entry: ConsumablesUpdate) => void;
  canMutate?: boolean;
}

export function ConsumablesUpdatesTable({
  entries,
  loading,
  page,
  totalPages,
  total,
  onPageChange,
  onView,
  onEdit,
  canMutate = true,
}: ConsumablesUpdatesTableProps) {
  const columns = useMemo<Column<ConsumablesUpdate>[]>(
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
        key: "itemId",
        header: "Item ID",
        render: (entry) => (
          <span className="text-muted">{entry.itemId || "—"}</span>
        ),
      },
      {
        key: "facilityId",
        header: "Facility",
        render: (entry) => (
          <span className="text-foreground"><FacilityLabel id={entry.facilityId} /></span>
        ),
      },
      {
        key: "itemName",
        header: "Item Name",
        render: (entry) => (
          <span className="text-foreground">{entry.itemName || "—"}</span>
        ),
      },
      {
        key: "opening",
        header: "Opening",
        render: (entry) => (
          <span className="tabular-nums text-muted">
            {formatQty(entry.opening)}
          </span>
        ),
      },
      {
        key: "received",
        header: "Received",
        render: (entry) => (
          <span className="tabular-nums text-muted">
            {entry.received == null ? "—" : formatQty(entry.received)}
          </span>
        ),
      },
      {
        key: "issued",
        header: "Issued",
        render: (entry) => (
          <span className="tabular-nums text-muted">
            {formatQty(entry.issued)}
          </span>
        ),
      },
      {
        key: "closing",
        header: "Closing",
        render: (entry) => {
          const flags = getConsumablesUpdateFlagLabels(
            entry.closing,
            entry.reorderLevel
          );
          return (
            <div>
              <span className="tabular-nums font-medium text-foreground">
                {formatQty(entry.closing)}
              </span>
              {flags.length > 0 ? (
                <p className="mt-0.5 text-xs text-danger">{flags.join(" · ")}</p>
              ) : null}
            </div>
          );
        },
      },
      {
        key: "reorderLevel",
        header: "Reorder Level",
        render: (entry) => (
          <span className="tabular-nums text-muted">
            {entry.reorderLevel == null ? "—" : formatQty(entry.reorderLevel)}
          </span>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        className: "w-20 text-right",
        render: (entry) => (
          <ConsumablesUpdateRowActions
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
      emptyIcon={Package}
      emptyTitle="No consumables updates match your filters"
      emptyDescription="Clear search or adjust facility, item, and date filters."
      className="min-w-0"
    />
  );
}
