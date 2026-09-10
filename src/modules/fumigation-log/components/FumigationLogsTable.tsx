"use client";

import { useMemo } from "react";
import { Bug } from "lucide-react";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { useFacilityName } from "@/hooks/useEntityLabel";
import { cn, formatDate } from "@/lib/utils";
import { getFumigationDueState, getFumigationDueStateLabel } from "../utils";
import type { FumigationLog } from "../types";
import { FumigationLogRowActions } from "./FumigationLogRowActions";

function FacilityLabel({ id }: { id: string }) {
  return <>{useFacilityName(id) || "—"}</>;
}

interface FumigationLogsTableProps {
  entries: FumigationLog[];
  loading: boolean;
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  onView: (entry: FumigationLog) => void;
  onEdit: (entry: FumigationLog) => void;
  canMutate?: boolean;
}

export function FumigationLogsTable({
  entries,
  loading,
  page,
  totalPages,
  total,
  onPageChange,
  onView,
  onEdit,
  canMutate = true,
}: FumigationLogsTableProps) {
  const columns = useMemo<Column<FumigationLog>[]>(
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
        key: "areaTreated",
        header: "Area Treated",
        render: (entry) => (
          <span className="text-foreground">{entry.areaTreated || "—"}</span>
        ),
      },
      {
        key: "pestType",
        header: "Pest Type",
        render: (entry) => (
          <span className="text-foreground">{entry.pestType || "—"}</span>
        ),
      },
      {
        key: "vendor",
        header: "Vendor",
        render: (entry) => (
          <span className="text-muted">{entry.vendor || "—"}</span>
        ),
      },
      {
        key: "nextDueDate",
        header: "Next Due",
        render: (entry) => {
          const state = getFumigationDueState(entry.nextDueDate);
          const label = getFumigationDueStateLabel(entry.nextDueDate);
          return (
            <div>
              <span className="text-foreground">
                {entry.nextDueDate ? formatDate(entry.nextDueDate) : "—"}
              </span>
              {label ? (
                <p
                  className={cn(
                    "mt-0.5 text-xs",
                    state === "overdue" && "text-danger",
                    state === "due_soon" && "text-amber-700",
                    state === "scheduled" && "text-muted"
                  )}
                >
                  {label}
                </p>
              ) : null}
            </div>
          );
        },
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
          <FumigationLogRowActions
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
      emptyIcon={Bug}
      emptyTitle="No fumigation logs match your filters"
      emptyDescription="Clear search or adjust facility, date, and next-due filters."
      className="min-w-0"
    />
  );
}
