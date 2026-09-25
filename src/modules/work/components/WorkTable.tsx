"use client";

import { FacilityNames } from "@/components/operational/FacilityNames";
import Link from "next/link";
import { useMemo } from "react";
import { Wrench } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { formatDate } from "@/lib/utils";
import {
  issueHrefForWork,
  WORK_STATUS_LABELS,
} from "@/lib/operational/work";
import {
  useFacilityName,
} from "@/hooks/useEntityLabel";
import {
  displayMaintenanceLocation,
  displayMaintenanceTitle,
  labelize,
} from "@/modules/maintenance/utils";
import type { Maintenance } from "@/modules/maintenance/types";
import { WORK_COMMERCIAL_ROUTE_LABELS } from "@/modules/maintenance/constants";
import type { WorkOrder } from "@/modules/work-orders/types";
import { WORK_PRIORITY_VARIANT, WORK_STATUS_VARIANT, WORK_SCOPES, type WorkScope } from "../constants";
import { collectLinkedWorkOrderIds } from "../utils/linkedWorkOrderIds";
import { isHistoricalWork } from "../utils/historicalWork";
import { WorkExecutionAssigneeCell } from "./WorkOrderExecutionAssignees";
import { WorkRowActions } from "./WorkRowActions";

interface WorkTableProps {
  scope?: WorkScope;
  items: Maintenance[];
  loading: boolean;
  page: number;
  totalPages: number;
  total: number;
  linkedWorkOrdersById?: Record<string, WorkOrder | null>;
  linkedWorkOrdersLoading?: boolean;
  onPageChange: (page: number) => void;
  onView: (work: Maintenance) => void;
  onTreat: (work: Maintenance) => void;
  onCancel: (work: Maintenance) => void;
  canMutate?: boolean;
}

function FacilityCell({ row }: { row: Maintenance }) {
  const name = useFacilityName(row.facilityId);
  const location = displayMaintenanceLocation(row);

  return (
    <div>
      <span className="text-foreground">
        {(row.facilityIds?.length ?? 0) > 1 ? <FacilityNames ids={row.facilityIds} /> : name || row.facilityId || "—"}
      </span>
      {location ? <p className="text-xs text-muted">{location}</p> : null}
    </div>
  );
}

export function WorkTable({
  scope = "in_progress",
  items,
  loading,
  page,
  totalPages,
  total,
  linkedWorkOrdersById = {},
  linkedWorkOrdersLoading = false,
  onPageChange,
  onView,
  onTreat,
  onCancel,
  canMutate = true,
}: WorkTableProps) {
  const columns = useMemo<Column<Maintenance>[]>(
    () => [
      {
        key: "title",
        header: "Work",
        render: (row) => (
          <div>
            <button
              type="button"
              className="text-left font-medium text-foreground hover:underline"
              onClick={() => onView(row)}
            >
              {displayMaintenanceTitle(row)}
            </button>
            <p className="text-xs text-muted">
              {row.id}
              {isHistoricalWork(row) ? <span> · Imported record</span> : null}
            </p>
            {collectLinkedWorkOrderIds(row).map((woId) => (
              <p key={woId} className="text-xs text-muted">
                <Link
                  href={`/work-orders?id=${encodeURIComponent(woId)}`}
                  className="text-accent underline-offset-2 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {woId}
                </Link>
              </p>
            ))}
          </div>
        ),
      },
      {
        key: "facilityId",
        header: "Location",
        render: (row) => <FacilityCell row={row} />,
      },
      {
        key: "status",
        header: "Status",
        render: (row) => (
          <Badge variant={WORK_STATUS_VARIANT[row.status]}>
            {WORK_STATUS_LABELS[row.status] ?? labelize(row.status)}
          </Badge>
        ),
      },
      {
        key: "priority",
        header: "Priority",
        render: (row) => (
          <Badge variant={WORK_PRIORITY_VARIANT[row.priority]}>
            {row.priority === "unknown" ? "Not recorded" : labelize(row.priority)}
          </Badge>
        ),
      },
      {
        key: "assignedToUserId",
        header: "Assigned to",
        render: (row) => (
          <span className="text-muted">
            <WorkExecutionAssigneeCell
              work={row}
              workOrdersById={linkedWorkOrdersById}
              loading={linkedWorkOrdersLoading}
              unassignedLabel={isHistoricalWork(row) ? "Not recorded" : undefined}
            />
          </span>
        ),
      },
      {
        key: "context",
        header: "Context",
        render: (row) => (
          <div className="text-xs text-muted">
            <Link
              href={issueHrefForWork(row.id)}
              className="text-accent underline-offset-2 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              Issue
            </Link>
            {row.sourceRequestId ? (
              <p className="mt-0.5">Request {row.sourceRequestId}</p>
            ) : null}
            {row.commercialRoute ? (
              <p className="mt-0.5">{WORK_COMMERCIAL_ROUTE_LABELS[row.commercialRoute]} basis</p>
            ) : null}
          </div>
        ),
      },
      {
        key: "schedule",
        header: "Schedule",
        render: (row) => {
          const when =
            row.status === "completed" && row.completedAt
              ? row.completedAt
              : row.scheduledStartAt || row.dueAt || row.reportedAt;
          // Only label a date that exists; a missing date is "Not recorded", never a substitute date.
          const label =
            row.status === "completed" && row.completedAt
              ? "Completed"
              : row.scheduledStartAt
                ? "Scheduled"
                : row.dueAt
                  ? "Due"
                  : row.reportedAt
                    ? "Reported"
                    : null;
          return (
            <div>
              <span className="text-muted">{when ? formatDate(when) : "Not recorded"}</span>
              {when && label ? <p className="text-xs text-muted">{label}</p> : null}
            </div>
          );
        },
      },
      {
        key: "actions",
        header: "Actions",
        className: "w-20 text-right",
        render: (row) => (
          <WorkRowActions
            key={`${row.id}:${page}:${total}`}
            work={row}
            onView={onView}
            onTreat={onTreat}
            onCancel={onCancel}
            canMutate={canMutate && !isHistoricalWork(row)}
          />
        ),
      },
    ],
    [onView, onTreat, onCancel, canMutate, page, total, linkedWorkOrdersById, linkedWorkOrdersLoading]
  );

  const scopeLabel = WORK_SCOPES.find((s) => s.value === scope)?.label ?? "Work";
  const emptyTitle =
    total === 0 && !loading
      ? scope === "in_progress"
        ? "No work currently in progress"
        : scope === "all"
          ? "No Work recorded"
          : `No Work in “${scopeLabel}”`
      : "No work matches your filters";
  const emptyDescription =
    total === 0 && !loading
      ? scope === "in_progress"
        ? "When Issues are treated, work appears here. Nothing in progress does not mean there is no Work — see All Work."
        : "There is no Work in this scope."
      : "Clear search or adjust status, priority, location, and assignee filters.";

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
      emptyIcon={Wrench}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      className="min-w-0"
    />
  );
}
