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
import { FacilityService } from "@/services/facilities/FacilityService";
import { UserService } from "@/services/users/UserService";
import type { Facility } from "@/modules/facilities/types";
import type { User } from "@/modules/users/types";
import {
  WORK_ORDERS_PAGE_SIZE,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_STATUSES,
} from "../constants";
import { labelize } from "../utils";
import type { WorkOrderPriority, WorkOrderStatus } from "../types";

interface WorkOrdersToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  status: WorkOrderStatus | "all";
  onStatusChange: (value: WorkOrderStatus | "all") => void;
  priority: WorkOrderPriority | "all";
  onPriorityChange: (value: WorkOrderPriority | "all") => void;
  facilityId: string | "all";
  onFacilityIdChange: (value: string | "all") => void;
  assignedToUserId: string | "all";
  onAssignedToUserIdChange: (value: string | "all") => void;
  total: number;
  loading?: boolean;
}

type DraftFilters = {
  status: WorkOrderStatus | "all";
  priority: WorkOrderPriority | "all";
  facilityId: string | "all";
  assignedToUserId: string | "all";
};

function countActive(filters: DraftFilters): number {
  let count = 0;
  if (filters.status !== "all") count += 1;
  if (filters.priority !== "all") count += 1;
  if (filters.facilityId !== "all") count += 1;
  if (filters.assignedToUserId !== "all") count += 1;
  return count;
}

export function WorkOrdersToolbar({
  search,
  onSearchChange,
  status,
  onStatusChange,
  priority,
  onPriorityChange,
  facilityId,
  onFacilityIdChange,
  assignedToUserId,
  onAssignedToUserIdChange,
  total,
  loading,
}: WorkOrdersToolbarProps) {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draft, setDraft] = useState<DraftFilters>({
    status,
    priority,
    facilityId,
    assignedToUserId,
  });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      FacilityService.listFacilities({ page: 1, pageSize: 200 }),
      UserService.listUsers({ page: 1, pageSize: 200 }),
    ])
      .then(([facilityPage, userPage]) => {
        if (cancelled) return;
        setFacilities(facilityPage.data);
        setUsers(userPage.data);
      })
      .catch(() => {
        if (cancelled) return;
        setFacilities([]);
        setUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (filterOpen) {
      setDraft({
        status,
        priority,
        facilityId,
        assignedToUserId,
      });
    }
  }, [filterOpen, status, priority, facilityId, assignedToUserId]);

  const applied: DraftFilters = {
    status,
    priority,
    facilityId,
    assignedToUserId,
  };
  const activeFilterCount = countActive(applied);
  const filtered = activeFilterCount > 0 || Boolean(search.trim());

  const chips: ActiveFilterChip[] = useMemo(() => {
    const next: ActiveFilterChip[] = [];
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
    if (facilityId !== "all") {
      const facility = facilities.find((item) => item.id === facilityId);
      next.push({
        id: "facility",
        label: facility?.name ?? facilityId,
        onRemove: () => onFacilityIdChange("all"),
      });
    }
    if (assignedToUserId !== "all") {
      const user = users.find((item) => item.id === assignedToUserId);
      next.push({
        id: "assignee",
        label: user?.name ?? assignedToUserId,
        onRemove: () => onAssignedToUserIdChange("all"),
      });
    }
    return next;
  }, [
    priority,
    status,
    facilityId,
    assignedToUserId,
    facilities,
    users,
    onPriorityChange,
    onStatusChange,
    onFacilityIdChange,
    onAssignedToUserIdChange,
  ]);

  function clearAll() {
    onStatusChange("all");
    onPriorityChange("all");
    onFacilityIdChange("all");
    onAssignedToUserIdChange("all");
    setDraft({
      status: "all",
      priority: "all",
      facilityId: "all",
      assignedToUserId: "all",
    });
  }

  function applyDraft() {
    onStatusChange(draft.status);
    onPriorityChange(draft.priority);
    onFacilityIdChange(draft.facilityId);
    onAssignedToUserIdChange(draft.assignedToUserId);
  }

  return (
    <div className="flex flex-col gap-3">
      <OperationalListToolbar
        search={search}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search work orders..."
        filterOpen={filterOpen}
        onFilterOpenChange={setFilterOpen}
        activeFilterCount={activeFilterCount}
        onClearFilters={clearAll}
        onApplyFilters={applyDraft}
        sortValue="newest"
        sortOptions={[{ value: "newest", label: "Newest" }]}
        filterPanel={
          <>
            <FilterField
              id="wo-filter-priority"
              label="Priority"
              value={draft.priority}
              onChange={(value) =>
                setDraft((prev) => ({
                  ...prev,
                  priority: value as WorkOrderPriority | "all",
                }))
              }
            >
              <option value="all">All priorities</option>
              {WORK_ORDER_PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {labelize(value)}
                </option>
              ))}
            </FilterField>

            <FilterField
              id="wo-filter-status"
              label="Status"
              value={draft.status}
              onChange={(value) =>
                setDraft((prev) => ({
                  ...prev,
                  status: value as WorkOrderStatus | "all",
                }))
              }
            >
              <option value="all">All statuses</option>
              {WORK_ORDER_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {labelize(value)}
                </option>
              ))}
            </FilterField>

            <FilterField
              id="wo-filter-facility"
              label="Facility"
              value={draft.facilityId}
              onChange={(value) =>
                setDraft((prev) => ({
                  ...prev,
                  facilityId: value as string | "all",
                }))
              }
            >
              <option value="all">All facilities</option>
              {facilities.map((facility) => (
                <option key={facility.id} value={facility.id}>
                  {facility.name}
                </option>
              ))}
            </FilterField>

            <FilterField
              id="wo-filter-assignee"
              label="Assigned to"
              value={draft.assignedToUserId}
              onChange={(value) =>
                setDraft((prev) => ({
                  ...prev,
                  assignedToUserId: value as string | "all",
                }))
              }
            >
              <option value="all">All technicians</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </FilterField>
          </>
        }
      />

      <ActiveFilters chips={chips} onClearAll={clearAll} />

      {!loading && filtered ? (
        <ResultContext
          text={buildResultContext({
            noun: "work order",
            nounPlural: "work orders",
            total,
            filtered,
            pageSize: WORK_ORDERS_PAGE_SIZE,
          })}
        />
      ) : null}
    </div>
  );
}
