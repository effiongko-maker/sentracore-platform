"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ActiveFilters,
  FilterField,
  OperationalListToolbar,
  ResultContext,
  buildResultContext,
  type ActiveFilterChip,
} from "@/components/operational";
import { useFacilityOptions } from "@/hooks/useFacilityOptions";
import { UserService } from "@/services/users/UserService";
import type { User } from "@/modules/users/types";
import { WORK_STATUS_LABELS } from "@/lib/operational/work";
import { labelize } from "@/modules/maintenance/utils";
import type {
  MaintenancePriority,
  MaintenanceSort,
  MaintenanceStatus,
} from "@/modules/maintenance/types";
import {
  DEFAULT_WORK_SORT,
  WORK_PAGE_SIZE,
  WORK_PRIORITIES,
  WORK_SORT_OPTIONS,
  WORK_STATUSES,
} from "../constants";

interface WorkToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  priority: MaintenancePriority | "all";
  onPriorityChange: (value: MaintenancePriority | "all") => void;
  status: MaintenanceStatus | "all" | "active";
  onStatusChange: (value: MaintenanceStatus | "all" | "active") => void;
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
}

function countActiveFilters(filters: {
  priority: MaintenancePriority | "all";
  status: MaintenanceStatus | "all" | "active";
  facilityId: string | "all";
  assignedToUserId: string | "all";
  requiresWorkOrder: boolean | "all";
}): number {
  let count = 0;
  if (filters.priority !== "all") count += 1;
  if (filters.status !== "all" && filters.status !== "active") count += 1;
  if (filters.facilityId !== "all") count += 1;
  if (filters.assignedToUserId !== "all") count += 1;
  if (filters.requiresWorkOrder !== "all") count += 1;
  return count;
}

export function WorkToolbar({
  search,
  onSearchChange,
  priority,
  onPriorityChange,
  status,
  onStatusChange,
  facilityId,
  onFacilityIdChange,
  assignedToUserId,
  onAssignedToUserIdChange,
  requiresWorkOrder,
  onRequiresWorkOrderChange,
  sort = DEFAULT_WORK_SORT,
  onSortChange,
  total,
  loading,
  onClearAll,
}: WorkToolbarProps) {
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
    if (status !== "all" && status !== "active") {
      next.push({
        id: "status",
        label: WORK_STATUS_LABELS[status] ?? labelize(status),
        onRemove: () => onStatusChange("active"),
      });
    }
    if (requiresWorkOrder !== "all") {
      next.push({
        id: "requires-wo",
        label: requiresWorkOrder ? "Requires work order" : "No work order required",
        onRemove: () => onRequiresWorkOrderChange("all"),
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
    return next;
  }, [
    hasSearch,
    search,
    priority,
    status,
    facilityId,
    assignedToUserId,
    requiresWorkOrder,
    facilities,
    users,
    onSearchChange,
    onPriorityChange,
    onStatusChange,
    onFacilityIdChange,
    onAssignedToUserIdChange,
    onRequiresWorkOrderChange,
  ]);

  function clearFiltersOnly() {
    onPriorityChange("all");
    onStatusChange("active");
    onFacilityIdChange("all");
    onAssignedToUserIdChange("all");
    onRequiresWorkOrderChange("all");
  }

  return (
    <div className="flex flex-col gap-3">
      <OperationalListToolbar
        search={search}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search work, location, assignee, request…"
        filterOpen={filterOpen}
        onFilterOpenChange={setFilterOpen}
        activeFilterCount={activeFilterCount}
        canClearFilters={activeFilterCount > 0}
        onClearFilters={clearFiltersOnly}
        filterMode="live"
        sortValue={sort}
        sortOptions={WORK_SORT_OPTIONS}
        onSortChange={(value) => onSortChange(value as MaintenanceSort)}
        filterPanel={
          <>
            <FilterField
              id="work-filter-status"
              label="Status"
              value={status}
              onChange={(value) =>
                onStatusChange(value as MaintenanceStatus | "all" | "active")
              }
            >
              <option value="active">Active work (WIP)</option>
              <option value="all">All statuses</option>
              {WORK_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {WORK_STATUS_LABELS[value] ?? labelize(value)}
                </option>
              ))}
            </FilterField>

            <FilterField
              id="work-filter-priority"
              label="Priority"
              value={priority}
              onChange={(value) =>
                onPriorityChange(value as MaintenancePriority | "all")
              }
            >
              <option value="all">All priorities</option>
              {WORK_PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {labelize(value)}
                </option>
              ))}
            </FilterField>

            <FilterField
              id="work-filter-facility"
              label="Location"
              value={facilityId}
              onChange={(value) =>
                onFacilityIdChange(value as string | "all")
              }
            >
              <option value="all">All locations</option>
              {facilities.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </FilterField>

            <FilterField
              id="work-filter-assignee"
              label="Assignee"
              value={assignedToUserId}
              onChange={(value) =>
                onAssignedToUserIdChange(value as string | "all")
              }
            >
              <option value="all">Anyone</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </FilterField>

            <FilterField
              id="work-filter-requires-wo"
              label="Work order"
              value={
                requiresWorkOrder === "all"
                  ? "all"
                  : requiresWorkOrder
                    ? "yes"
                    : "no"
              }
              onChange={(value) => {
                if (value === "all") onRequiresWorkOrderChange("all");
                else onRequiresWorkOrderChange(value === "yes");
              }}
            >
              <option value="all">All work</option>
              <option value="yes">Requires work order</option>
              <option value="no">No work order required</option>
            </FilterField>
          </>
        }
      />

      <ActiveFilters chips={chips} onClearAll={onClearAll} />

      {!loading && filtered ? (
        <ResultContext
          text={buildResultContext({
            noun: "work item",
            nounPlural: "work items",
            total,
            filtered: true,
            pageSize: WORK_PAGE_SIZE,
          })}
        />
      ) : null}
    </div>
  );
}
