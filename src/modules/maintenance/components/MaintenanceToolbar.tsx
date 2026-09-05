"use client";

import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  ActiveFilters,
  FilterField,
  OperationalListToolbar,
  ResultContext,
  buildResultContext,
  type ActiveFilterChip,
} from "@/components/operational";
import { Button } from "@/components/ui/Button";
import { useFacilityOptions } from "@/hooks/useFacilityOptions";
import { UserService } from "@/services/users/UserService";
import type { User } from "@/modules/users/types";
import {
  DEFAULT_MAINTENANCE_SORT,
  MAINTENANCE_PAGE_SIZE,
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_SORT_OPTIONS,
  MAINTENANCE_STATUSES,
  MAINTENANCE_TYPES,
} from "../constants";
import { labelize } from "../utils";
import type {
  MaintenancePriority,
  MaintenanceSort,
  MaintenanceStatus,
  MaintenanceType,
} from "../types";

interface MaintenanceToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  priority: MaintenancePriority | "all";
  onPriorityChange: (value: MaintenancePriority | "all") => void;
  status: MaintenanceStatus | "all";
  onStatusChange: (value: MaintenanceStatus | "all") => void;
  type: MaintenanceType | "all";
  onTypeChange: (value: MaintenanceType | "all") => void;
  facilityId: string | "all";
  onFacilityIdChange: (value: string | "all") => void;
  assignedToUserId: string | "all";
  onAssignedToUserIdChange: (value: string | "all") => void;
  requiresWorkOrder: boolean | "all";
  onRequiresWorkOrderChange: (value: boolean | "all") => void;
  sort: MaintenanceSort;
  onSortChange: (value: MaintenanceSort) => void;
  total: number;
  loading?: boolean;
  onClearAll: () => void;
  onCreate: () => void;
  canCreate?: boolean;
}

function countActiveFilters(filters: {
  priority: MaintenancePriority | "all";
  status: MaintenanceStatus | "all";
  type: MaintenanceType | "all";
  facilityId: string | "all";
  assignedToUserId: string | "all";
  requiresWorkOrder: boolean | "all";
}): number {
  let count = 0;
  if (filters.priority !== "all") count += 1;
  if (filters.status !== "all") count += 1;
  if (filters.type !== "all") count += 1;
  if (filters.facilityId !== "all") count += 1;
  if (filters.assignedToUserId !== "all") count += 1;
  if (filters.requiresWorkOrder !== "all") count += 1;
  return count;
}

export function MaintenanceToolbar({
  search,
  onSearchChange,
  priority,
  onPriorityChange,
  status,
  onStatusChange,
  type,
  onTypeChange,
  facilityId,
  onFacilityIdChange,
  assignedToUserId,
  onAssignedToUserIdChange,
  requiresWorkOrder,
  onRequiresWorkOrderChange,
  sort = DEFAULT_MAINTENANCE_SORT,
  onSortChange,
  total,
  loading,
  onClearAll,
  onCreate,
  canCreate = true,
}: MaintenanceToolbarProps) {
  const { facilities } = useFacilityOptions();
  const [users, setUsers] = useState<User[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    UserService.listUsersCatalog({ page: 1, pageSize: 200 })
      .then((page) => {
        if (!cancelled) setUsers(page.data);
      })
      .catch(() => {
        if (!cancelled) setUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeFilterCount = countActiveFilters({
    priority,
    status,
    type,
    facilityId,
    assignedToUserId,
    requiresWorkOrder,
  });
  const hasSearch = Boolean(search.trim());
  const filtered = activeFilterCount > 0 || hasSearch;

  const chips: ActiveFilterChip[] = useMemo(() => {
    const next: ActiveFilterChip[] = [];
    if (hasSearch) {
      next.push({
        id: "search",
        label: `“${search.trim()}”`,
        onRemove: () => onSearchChange(""),
      });
    }
    if (priority !== "all") {
      next.push({
        id: "priority",
        label: labelize(priority),
        onRemove: () => onPriorityChange("all"),
      });
    }
    if (status !== "all") {
      next.push({
        id: "status",
        label: labelize(status),
        onRemove: () => onStatusChange("all"),
      });
    }
    if (type !== "all") {
      next.push({
        id: "type",
        label: labelize(type),
        onRemove: () => onTypeChange("all"),
      });
    }
    if (facilityId !== "all") {
      const match = facilities.find((item) => item.id === facilityId);
      next.push({
        id: "facility",
        label: match?.name ?? facilityId,
        onRemove: () => onFacilityIdChange("all"),
      });
    }
    if (assignedToUserId !== "all") {
      const match = users.find((item) => item.id === assignedToUserId);
      next.push({
        id: "assignee",
        label: match?.name ?? assignedToUserId,
        onRemove: () => onAssignedToUserIdChange("all"),
      });
    }
    if (requiresWorkOrder !== "all") {
      next.push({
        id: "requiresWorkOrder",
        label: requiresWorkOrder
          ? "Requires work order"
          : "No work order required",
        onRemove: () => onRequiresWorkOrderChange("all"),
      });
    }
    return next;
  }, [
    hasSearch,
    search,
    priority,
    status,
    type,
    facilityId,
    assignedToUserId,
    requiresWorkOrder,
    facilities,
    users,
    onSearchChange,
    onPriorityChange,
    onStatusChange,
    onTypeChange,
    onFacilityIdChange,
    onAssignedToUserIdChange,
    onRequiresWorkOrderChange,
  ]);

  function clearFiltersOnly() {
    onPriorityChange("all");
    onStatusChange("all");
    onTypeChange("all");
    onFacilityIdChange("all");
    onAssignedToUserIdChange("all");
    onRequiresWorkOrderChange("all");
  }

  return (
    <div className="flex flex-col gap-3">
      <OperationalListToolbar
        search={search}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search by title, id, description…"
        filterOpen={filterOpen}
        onFilterOpenChange={setFilterOpen}
        activeFilterCount={activeFilterCount}
        canClearFilters={activeFilterCount > 0}
        onClearFilters={clearFiltersOnly}
        filterMode="live"
        sortValue={sort}
        sortOptions={MAINTENANCE_SORT_OPTIONS}
        onSortChange={(value) => onSortChange(value as MaintenanceSort)}
        leadingActions={
          canCreate ? (
          <Button
            type="button"
            size="sm"
            className="h-9 shrink-0 rounded-md px-3.5 text-[0.8125rem] font-semibold shadow-none"
            onClick={onCreate}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            New maintenance
          </Button>
          ) : undefined
        }
        filterPanel={
          <>
            <FilterField
              id="mnt-filter-priority"
              label="Priority"
              value={priority}
              onChange={(value) =>
                onPriorityChange(value as MaintenancePriority | "all")
              }
            >
              <option value="all">All priorities</option>
              {MAINTENANCE_PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {labelize(value)}
                </option>
              ))}
            </FilterField>

            <FilterField
              id="mnt-filter-status"
              label="Status"
              value={status}
              onChange={(value) =>
                onStatusChange(value as MaintenanceStatus | "all")
              }
            >
              <option value="all">All statuses</option>
              {MAINTENANCE_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {labelize(value)}
                </option>
              ))}
            </FilterField>

            <FilterField
              id="mnt-filter-type"
              label="Type"
              value={type}
              onChange={(value) =>
                onTypeChange(value as MaintenanceType | "all")
              }
            >
              <option value="all">All types</option>
              {MAINTENANCE_TYPES.map((value) => (
                <option key={value} value={value}>
                  {labelize(value)}
                </option>
              ))}
            </FilterField>

            <FilterField
              id="mnt-filter-facility"
              label="Facility"
              value={facilityId}
              onChange={(value) =>
                onFacilityIdChange(value as string | "all")
              }
            >
              <option value="all">All facilities</option>
              {facilities.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </FilterField>

            <FilterField
              id="mnt-filter-assignee"
              label="Assignee"
              value={assignedToUserId}
              onChange={(value) =>
                onAssignedToUserIdChange(value as string | "all")
              }
            >
              <option value="all">All assignees</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </FilterField>

            <FilterField
              id="mnt-filter-requires-wo"
              label="Work order"
              value={
                requiresWorkOrder === "all"
                  ? "all"
                  : requiresWorkOrder
                    ? "true"
                    : "false"
              }
              onChange={(value) =>
                onRequiresWorkOrderChange(
                  value === "all" ? "all" : value === "true"
                )
              }
            >
              <option value="all">All</option>
              <option value="true">Requires work order</option>
              <option value="false">No work order required</option>
            </FilterField>
          </>
        }
      />

      <ActiveFilters chips={chips} onClearAll={onClearAll} />

      {!loading && filtered ? (
        <ResultContext
          text={buildResultContext({
            noun: "maintenance record",
            nounPlural: "maintenance records",
            total,
            filtered,
            pageSize: MAINTENANCE_PAGE_SIZE,
          })}
        />
      ) : null}
    </div>
  );
}
