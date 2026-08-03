"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { FACILITY_STATUS_VARIANT } from "../constants";
import { getFacilityInitials, labelize } from "../utils";
import type { Facility } from "../types";
import { FacilityRowActions } from "./FacilityRowActions";

interface FacilitiesTableProps {
  facilities: Facility[];
  loading: boolean;
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  onView: (facility: Facility) => void;
  onEdit: (facility: Facility) => void;
  onDeactivate: (facility: Facility) => void;
}

export function FacilitiesTable({
  facilities,
  loading,
  page,
  totalPages,
  total,
  onPageChange,
  onView,
  onEdit,
  onDeactivate,
}: FacilitiesTableProps) {
  const columns = useMemo<Column<Facility>[]>(
    () => [
      {
        key: "name",
        header: "Facility Name",
        render: (facility) => (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-semibold text-white">
              {getFacilityInitials(facility.name)}
            </div>
            <div>
              <span className="font-medium text-foreground">{facility.name}</span>
              <p className="text-xs text-muted">{facility.id}</p>
            </div>
          </div>
        ),
      },
      {
        key: "code",
        header: "Code",
        render: (facility) => (
          <span className="font-medium text-foreground">{facility.code}</span>
        ),
      },
      {
        key: "location",
        header: "Location",
        render: (facility) => (
          <span className="text-muted">{facility.location}</span>
        ),
      },
      {
        key: "type",
        header: "Facility Type",
        render: (facility) => (
          <span className="text-foreground">{labelize(facility.type)}</span>
        ),
      },
      {
        key: "manager",
        header: "Manager",
        render: (facility) => (
          <span className="text-muted">{facility.manager || "—"}</span>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (facility) => (
          <Badge variant={FACILITY_STATUS_VARIANT[facility.status]}>
            {labelize(facility.status)}
          </Badge>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        className: "w-20 text-right",
        render: (facility) => (
          <FacilityRowActions
            facility={facility}
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
      data={facilities}
      rowKey={(facility) => facility.id}
      loading={loading}
      page={page}
      totalPages={totalPages}
      total={total}
      onPageChange={onPageChange}
      emptyTitle="No facilities match your filters"
      emptyDescription="Clear search or adjust type, location, and status filters."
      className="min-w-0"
    />
  );
}
