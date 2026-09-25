"use client";

import { useMemo } from "react";
import { ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { formatDate } from "@/lib/utils";
import { useFacilityName } from "@/hooks/useEntityLabel";
import { formatFinancialAmount } from "@/modules/finance/utils/formatFinancialAmount";
import { type WorkOrderOrderTypeScope } from "../constants";
import {
  resolveWorkInstructionKind,
  WORK_INSTRUCTION_KIND_LABELS,
  type WorkInstructionKind,
} from "../instructionKind";
import { displayWorkOrderTitle } from "../utils";
import { WORK_ORDER_SUBMISSION_STATUS_LABELS, type WorkOrder } from "../types";
import { WorkOrderRowActions } from "./WorkOrderRowActions";

interface WorkOrdersTableProps {
  workOrders: WorkOrder[];
  loading: boolean;
  orderTypeScope?: WorkOrderOrderTypeScope;
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  onView: (workOrder: WorkOrder) => void;
  onEdit: (workOrder: WorkOrder) => void;
  onDeactivate: (workOrder: WorkOrder) => void;
  canMutate?: boolean;
}

function FacilityLabel({ id }: { id: string }) {
  return <>{useFacilityName(id) || "—"}</>;
}

/** Every facility the WO/JO covers (primary first). */
function FacilitiesLabel({ ids }: { ids: string[] }) {
  return (
    <>
      {ids.map((id, index) => (
        <span key={id}>
          {index > 0 ? " + " : ""}
          <FacilityLabel id={id} />
        </span>
      ))}
    </>
  );
}

function orderTypeBadgeVariant(
  kind: WorkInstructionKind
): "info" | "warning" {
  return kind === "job_order" ? "warning" : "info";
}

export function WorkOrdersTable({
  workOrders,
  loading,
  orderTypeScope = "all",
  page,
  totalPages,
  total,
  onPageChange,
  onView,
  onEdit,
  onDeactivate,
  canMutate = true,
}: WorkOrdersTableProps) {
  const columns = useMemo<Column<WorkOrder>[]>(
    () => [
      {
        key: "title",
        header: "Title",
        render: (workOrder) => (
          <div>
            <span className="font-medium text-foreground">
              {displayWorkOrderTitle(workOrder)}
            </span>
            <p className="text-xs text-muted">{workOrder.id}</p>
          </div>
        ),
      },
      {
        key: "orderType",
        header: "Order Type",
        render: (workOrder) => {
          const kind = resolveWorkInstructionKind(workOrder);
          return (
            <Badge
              variant={orderTypeBadgeVariant(kind)}
              withDot
              className="normal-case"
            >
              {WORK_INSTRUCTION_KIND_LABELS[kind]}
            </Badge>
          );
        },
      },
      {
        key: "facilityId",
        header: "Facility",
        render: (workOrder) => (
          <span className="text-muted">
            <FacilitiesLabel ids={workOrder.facilityIds?.length ? workOrder.facilityIds : [workOrder.facilityId]} />
          </span>
        ),
      },
      {
        key: "linkedWorkIds",
        header: "Work",
        render: (workOrder) => {
          const works = workOrder.linkedWorkIds ?? [];
          return (
            <span className="text-muted" title={works.join(", ")}>
              {works.length === 0 ? "None linked" : works.length === 1 ? works[0] : `${works.length} Works`}
            </span>
          );
        },
      },
      {
        key: "submissionDate",
        header: "Submitted",
        render: (workOrder) => (
          <span className="text-muted">{workOrder.submissionDate ? formatDate(workOrder.submissionDate) : "—"}</span>
        ),
      },
      {
        key: "submissionAmount",
        header: "Amount",
        render: (workOrder) =>
          workOrder.submissionAmount != null || workOrder.executionCost != null ? (
            <span className="font-medium text-foreground">
              {formatFinancialAmount(workOrder.submissionAmount ?? workOrder.executionCost, "NGN")}
              <span className="block text-xs font-normal text-muted">
                {workOrder.submissionAmount != null ? "Submitted amount" : "Execution cost · source register"}
              </span>
            </span>
          ) : <span className="text-muted">Not recorded</span>,
      },
      {
        key: "submissionStatus",
        header: "Submission",
        render: (workOrder) => (
          <div>
            {workOrder.submissionStatus ? (
              <Badge variant={workOrder.submissionStatus === "draft" ? "default" : "info"}>
                {WORK_ORDER_SUBMISSION_STATUS_LABELS[workOrder.submissionStatus]}
              </Badge>
            ) : (
              <span className="text-muted">
                {workOrder.recordOrigin === "migrated_historical" ? "Imported — not recorded" : "Not recorded"}
              </span>
            )}
            {workOrder.lastFollowUpAt ? (
              <p className="mt-0.5 text-xs text-muted">Followed up {formatDate(workOrder.lastFollowUpAt)}</p>
            ) : null}
          </div>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        className: "w-20 text-right",
        render: (workOrder) => (
          <WorkOrderRowActions
            workOrder={workOrder}
            onView={onView}
            onEdit={onEdit}
            onDeactivate={onDeactivate}
            // Imported historical Work Instructions are read-only evidence (also refused server-side).
            canMutate={canMutate && workOrder.recordOrigin !== "migrated_historical"}
          />
        ),
      },
    ],
    [onView, onEdit, onDeactivate, canMutate]
  );

  const emptyTitle =
    orderTypeScope === "job_order"
      ? "No Job Orders match your filters"
      : orderTypeScope === "work_order"
        ? "No Work Orders match your filters"
        : "No work orders match your filters";

  const emptyDescription =
    orderTypeScope === "all"
      ? "Clear search or adjust status, priority, facility, and assignee filters."
      : "Try All, or clear search and other filters to widen the register.";

  return (
    <DataTable
      columns={columns}
      data={workOrders}
      rowKey={(workOrder) => workOrder.id}
      loading={loading}
      page={page}
      totalPages={totalPages}
      total={total}
      onPageChange={onPageChange}
      emptyIcon={ClipboardList}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      className="min-w-0"
    />
  );
}
