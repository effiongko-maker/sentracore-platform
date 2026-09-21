"use client";

import { useMemo } from "react";
import { ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { OperationalTone } from "@/components/operational";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { formatDate } from "@/lib/utils";
import {
  useAssetName,
  useFacilityName,
  useUserName,
} from "@/hooks/useEntityLabel";
import {
  WORK_ORDER_STATUS_VARIANT,
  type WorkOrderOrderTypeScope,
} from "../constants";
import {
  resolveWorkInstructionKind,
  WORK_INSTRUCTION_KIND_LABELS,
  type WorkInstructionKind,
} from "../instructionKind";
import { displayWorkOrderTitle, labelize } from "../utils";
import type { WorkOrder } from "../types";
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

function AssetLabel({ id }: { id?: string }) {
  const name = useAssetName(id);
  return <>{id ? name || "—" : "—"}</>;
}

function AssigneeLabel({ id }: { id?: string }) {
  const name = useUserName(id);
  return <>{id ? name || "—" : "—"}</>;
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
        key: "type",
        header: "Work Category",
        render: (workOrder) => (
          <span className="text-sm text-muted">{labelize(workOrder.type)}</span>
        ),
      },
      {
        key: "facilityId",
        header: "Facility",
        render: (workOrder) => (
          <span className="text-muted">
            <FacilityLabel id={workOrder.facilityId} />
          </span>
        ),
      },
      {
        key: "assetId",
        header: "Asset",
        render: (workOrder) => (
          <span className="text-muted">
            <AssetLabel id={workOrder.assetId} />
          </span>
        ),
      },
      {
        key: "assignedToUserId",
        header: "Assigned To",
        render: (workOrder) => (
          <span className="text-muted">
            <AssigneeLabel id={workOrder.assignedToUserId} />
          </span>
        ),
      },
      {
        key: "priority",
        header: "Priority",
        render: (workOrder) => (
          <OperationalTone
            value={workOrder.priority}
            label={labelize(workOrder.priority)}
          />
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (workOrder) => (
          <Badge variant={WORK_ORDER_STATUS_VARIANT[workOrder.status]}>
            {labelize(workOrder.status)}
          </Badge>
        ),
      },
      {
        key: "dueAt",
        header: "Due Date",
        render: (workOrder) => (
          <span className="text-muted">
            {workOrder.dueAt ? formatDate(workOrder.dueAt) : "—"}
          </span>
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
