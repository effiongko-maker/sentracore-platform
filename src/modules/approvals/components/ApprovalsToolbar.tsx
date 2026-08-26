"use client";

import { useMemo, useState } from "react";
import {
  ActiveFilters,
  FilterField,
  OperationalListToolbar,
  ResultContext,
  buildResultContext,
  type ActiveFilterChip,
} from "@/components/operational";
import { useFacilityOptions } from "@/hooks/useFacilityOptions";
import {
  APPROVALS_PAGE_SIZE,
  APPROVAL_SORT_OPTIONS,
  APPROVAL_STATUS_FILTER_OPTIONS,
  APPROVAL_TYPES,
  DEFAULT_APPROVAL_SORT,
} from "../constants";
import { labelizeApprovalStatus, labelizeApprovalType } from "../utils";
import type { ApprovalSort, ApprovalStatus, ApprovalType } from "../types";

interface ApprovalsToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  status: ApprovalStatus | "all";
  onStatusChange: (value: ApprovalStatus | "all") => void;
  type: ApprovalType | "all";
  onTypeChange: (value: ApprovalType | "all") => void;
  facilityId: string | "all";
  onFacilityIdChange: (value: string | "all") => void;
  sort: ApprovalSort;
  onSortChange: (value: ApprovalSort) => void;
  total: number;
  loading?: boolean;
  onClearAll: () => void;
}

export function ApprovalsToolbar({
  search,
  onSearchChange,
  status,
  onStatusChange,
  type,
  onTypeChange,
  facilityId,
  onFacilityIdChange,
  sort = DEFAULT_APPROVAL_SORT,
  onSortChange,
  total,
  loading,
  onClearAll,
}: ApprovalsToolbarProps) {
  const { facilities } = useFacilityOptions();
  const [filterOpen, setFilterOpen] = useState(false);

  const activeFilterCount =
    (status !== "all" ? 1 : 0) +
    (type !== "all" ? 1 : 0) +
    (facilityId !== "all" ? 1 : 0);
  const filtered = activeFilterCount > 0 || Boolean(search.trim());

  const chips = useMemo(() => {
    const next: ActiveFilterChip[] = [];
    if (status !== "all") {
      next.push({
        id: "status",
        label: `Status: ${labelizeApprovalStatus(status)}`,
        onRemove: () => onStatusChange("all"),
      });
    }
    if (type !== "all") {
      next.push({
        id: "type",
        label: `Type: ${labelizeApprovalType(type)}`,
        onRemove: () => onTypeChange("all"),
      });
    }
    if (facilityId !== "all") {
      const facility = facilities.find((row) => row.id === facilityId);
      next.push({
        id: "facility",
        label: `Facility: ${facility?.name ?? facilityId}`,
        onRemove: () => onFacilityIdChange("all"),
      });
    }
    return next;
  }, [
    status,
    type,
    facilityId,
    facilities,
    onStatusChange,
    onTypeChange,
    onFacilityIdChange,
  ]);

  function clearFiltersOnly() {
    onStatusChange("all");
    onTypeChange("all");
    onFacilityIdChange("all");
  }

  return (
    <div className="flex flex-col gap-3">
      <OperationalListToolbar
        search={search}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search by reference, title, work order…"
        filterOpen={filterOpen}
        onFilterOpenChange={setFilterOpen}
        activeFilterCount={activeFilterCount}
        canClearFilters={activeFilterCount > 0}
        onClearFilters={clearFiltersOnly}
        filterMode="live"
        sortValue={sort}
        sortOptions={APPROVAL_SORT_OPTIONS}
        onSortChange={(value) => onSortChange(value as ApprovalSort)}
        filterPanel={
          <>
            <FilterField
              id="apr-filter-status"
              label="Status"
              value={status}
              onChange={(value) =>
                onStatusChange(value as ApprovalStatus | "all")
              }
            >
              <option value="all">All statuses</option>
              {APPROVAL_STATUS_FILTER_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {labelizeApprovalStatus(value)}
                </option>
              ))}
            </FilterField>

            <FilterField
              id="apr-filter-type"
              label="Type"
              value={type}
              onChange={(value) =>
                onTypeChange(value as ApprovalType | "all")
              }
            >
              <option value="all">All types</option>
              {APPROVAL_TYPES.map((value) => (
                <option key={value} value={value}>
                  {labelizeApprovalType(value)}
                </option>
              ))}
            </FilterField>

            <FilterField
              id="apr-filter-facility"
              label="Facility"
              value={facilityId}
              onChange={(value) =>
                onFacilityIdChange(value as string | "all")
              }
            >
              <option value="all">All facilities</option>
              {facilities.map((facility) => (
                <option key={facility.id} value={facility.id}>
                  {facility.name}
                </option>
              ))}
            </FilterField>
          </>
        }
      />

      <ActiveFilters chips={chips} onClearAll={onClearAll} />

      {!loading && filtered ? (
        <ResultContext
          text={buildResultContext({
            noun: "approval",
            nounPlural: "approvals",
            total,
            filtered,
            pageSize: APPROVALS_PAGE_SIZE,
          })}
        />
      ) : null}
    </div>
  );
}
