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
import { WORK_ORDER_STATUS_VARIANT } from "../constants";
import { displayWorkOrderTitle, labelize } from "../utils";
import type { WorkOrder } from "../types";
import { WorkOrderRowActions } from "./WorkOrderRowActions";

interface WorkOrdersTableProps {
  workOrders: WorkOrder[];
  loading: boolean;
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  onView: (workOrder: WorkOrder) => void;
  onEdit: (workOrder: WorkOrder) => void;
  onDeactivate: (workOrder: WorkOrder) => void;
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

export function WorkOrdersTable({
  workOrders,
  loading,
  page,
  totalPages,
  total,
  onPageChange,
  onView,
  onEdit,
  onDeactivate,
}: WorkOrdersTableProps) {
  const columns = useMemo<Column<WorkOrder>[]>(
    () => [
      {
        key: "title",
        header: "Work Order",
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
          />
        ),
      },
    ],
    [onView, onEdit, onDeactivate]
  );

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
      emptyTitle="No work orders match your filters"
      emptyDescription="Clear search or adjust status, priority, facility, and assignee filters."
      className="min-w-0"
    />
  );
}
