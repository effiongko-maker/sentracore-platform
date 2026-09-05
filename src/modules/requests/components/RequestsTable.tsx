"use client";

import { useMemo } from "react";
import { Inbox } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { formatDate } from "@/lib/utils";
import { useFacilityName } from "@/hooks/useEntityLabel";
import { REQUEST_STATUS_LABELS, REQUEST_STATUS_VARIANT, REQUEST_TYPE_LABELS } from "../constants";
import type { RequestRecord } from "../types";
import { RequestRowActions } from "./RequestRowActions";

interface RequestsTableProps {
  requests: RequestRecord[];
  loading: boolean;
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  onView: (request: RequestRecord) => void;
  onEdit: (request: RequestRecord) => void;
  onDeactivate: (request: RequestRecord) => void;
  canMutate?: boolean;
}

function FacilityLabel({ id }: { id: string }) {
  return <>{useFacilityName(id) || "—"}</>;
}

export function RequestsTable({
  requests,
  loading,
  page,
  totalPages,
  total,
  onPageChange,
  onView,
  onEdit,
  onDeactivate,
  canMutate = true,
}: RequestsTableProps) {
  const columns = useMemo<Column<RequestRecord>[]>(
    () => [
      {
        key: "id",
        header: "Request ID",
        render: (request) => (
          <div>
            <span className="font-medium text-foreground">{request.id}</span>
            <p className="text-xs text-muted line-clamp-1">{request.title}</p>
          </div>
        ),
      },
      {
        key: "title",
        header: "Title",
        render: (request) => (
          <span className="text-foreground">{request.title}</span>
        ),
      },
      {
        key: "requestType",
        header: "Type",
        render: (request) => (
          <span className="text-muted">
            {request.requestType
              ? REQUEST_TYPE_LABELS[request.requestType]
              : "—"}
          </span>
        ),
      },
      {
        key: "facilityId",
        header: "Facility",
        render: (request) => (
          <span className="text-muted">
            <FacilityLabel id={request.facilityId} />
          </span>
        ),
      },
      {
        key: "reporterName",
        header: "Reporter",
        render: (request) => (
          <span className="text-muted">{request.reporterName || "—"}</span>
        ),
      },
      {
        key: "occurredAt",
        header: "Occurred at",
        render: (request) => (
          <span className="text-muted">{formatDate(request.occurredAt)}</span>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (request) => (
          <Badge variant={REQUEST_STATUS_VARIANT[request.status]}>
            {REQUEST_STATUS_LABELS[request.status]}
          </Badge>
        ),
      },
      {
        key: "createdAt",
        header: "Created at",
        render: (request) => (
          <span className="text-muted">{formatDate(request.createdAt)}</span>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        className: "w-20 text-right",
        render: (request) => (
          <RequestRowActions
            request={request}
            onView={onView}
            onEdit={onEdit}
            onDeactivate={onDeactivate}
            canMutate={canMutate}
          />
        ),
      },
    ],
    [onView, onEdit, onDeactivate, canMutate]
  );

  return (
    <DataTable
      columns={columns}
      data={requests}
      rowKey={(request) => request.id}
      loading={loading}
      page={page}
      totalPages={totalPages}
      total={total}
      onPageChange={onPageChange}
      emptyIcon={Inbox}
      emptyTitle="No incoming reports yet"
      emptyDescription="When reports arrive, they will show up here for review."
      className="min-w-0"
    />
  );
}
