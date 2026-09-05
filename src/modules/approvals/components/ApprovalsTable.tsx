"use client";

import { useMemo } from "react";
import { FileCheck2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { formatDate } from "@/lib/utils";
import { useFacilityName } from "@/hooks/useEntityLabel";
import { APPROVAL_STATUS_VARIANT } from "../constants";
import {
  displayApprovalTitle,
  labelizeApprovalStatus,
  labelizeApprovalType,
} from "../utils";
import type { Approval } from "../types";
import { ApprovalRowActions } from "./ApprovalRowActions";

interface ApprovalsTableProps {
  items: Approval[];
  loading: boolean;
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  onView: (approval: Approval) => void;
  onEdit: (approval: Approval) => void;
  onPackage: (approval: Approval) => void;
  onSubmit: (approval: Approval) => void;
  onFollowUp: (approval: Approval) => void;
  onDecision: (approval: Approval) => void;
  onDeactivate: (approval: Approval) => void;
  canManage?: boolean;
}

function FacilityLabel({ id }: { id?: string }) {
  const name = useFacilityName(id);
  return <>{id ? name || id : "—"}</>;
}

export function ApprovalsTable({
  items,
  loading,
  page,
  totalPages,
  total,
  onPageChange,
  onView,
  onEdit,
  onPackage,
  onSubmit,
  onFollowUp,
  onDecision,
  onDeactivate,
  canManage = true,
}: ApprovalsTableProps) {
  const columns = useMemo<Column<Approval>[]>(
    () => [
      {
        key: "title",
        header: "Approval",
        render: (row) => (
          <div>
            <span className="font-medium text-foreground">
              {displayApprovalTitle(row)}
            </span>
            <p className="text-xs text-muted">{row.id}</p>
          </div>
        ),
      },
      {
        key: "workOrderId",
        header: "Work Order",
        render: (row) => (
          <span className="text-muted">{row.workOrderId || "—"}</span>
        ),
      },
      {
        key: "facilityId",
        header: "Facility",
        render: (row) => (
          <span className="text-muted">
            <FacilityLabel id={row.facilityId} />
          </span>
        ),
      },
      {
        key: "type",
        header: "Type",
        render: (row) => (
          <span className="text-muted">{labelizeApprovalType(row.type)}</span>
        ),
      },
      {
        key: "approvalAmount",
        header: "Estimated Cost",
        render: (row) => (
          <span className="text-muted">
            {row.approvalAmount != null
              ? `${row.currency ? `${row.currency} ` : ""}${row.approvalAmount.toLocaleString()}`
              : "—"}
          </span>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (row) => (
          <div className="space-y-1">
            <Badge variant={APPROVAL_STATUS_VARIANT[row.status]}>
              {labelizeApprovalStatus(row.status)}
            </Badge>
            {row.lastFollowUpAt ? (
              <p className="text-[11px] text-muted">
                Followed up {formatDate(row.lastFollowUpAt)}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        key: "submittedAt",
        header: "Submitted",
        render: (row) => (
          <span className="text-muted">
            {row.submittedAt ? formatDate(row.submittedAt) : "—"}
          </span>
        ),
      },
      {
        key: "decisionAt",
        header: "Decision Date",
        render: (row) => (
          <span className="text-muted">
            {row.decisionAt ? formatDate(row.decisionAt) : "—"}
          </span>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        className: "w-20 text-right",
        render: (row) => (
          <ApprovalRowActions
            approval={row}
            onView={onView}
            onEdit={onEdit}
            onPackage={onPackage}
            onSubmit={onSubmit}
            onFollowUp={onFollowUp}
            onDecision={onDecision}
            onDeactivate={onDeactivate}
            canManage={canManage}
          />
        ),
      },
    ],
    [onView, onEdit, onPackage, onSubmit, onFollowUp, onDecision, onDeactivate, canManage]
  );

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
      emptyIcon={FileCheck2}
      emptyTitle="No approval requests match your filters"
      emptyDescription="Generate an approval request from a Work Order when client authorisation is required."
      className="min-w-0"
    />
  );
}
