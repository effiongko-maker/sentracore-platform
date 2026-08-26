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
import { AssetService } from "@/services/assets/AssetService";
import { MaintenanceService } from "@/services/maintenance/MaintenanceService";
import { UserService } from "@/services/users/UserService";
import type { Asset } from "@/modules/assets/types";
import type { Maintenance } from "@/modules/maintenance/types";
import type { User } from "@/modules/users/types";
import {
  DEFAULT_WORK_ORDER_SORT,
  WORK_ORDERS_PAGE_SIZE,
  WORK_ORDER_DUE_DATE_OPTIONS,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_SORT_OPTIONS,
  WORK_ORDER_STATUSES,
} from "../constants";
import { labelize } from "../utils";
import type {
  WorkOrderDueDateFilter,
  WorkOrderPriority,
  WorkOrderSort,
  WorkOrderStatus,
} from "../types";

interface WorkOrdersToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  status: WorkOrderStatus | "all";
  onStatusChange: (value: WorkOrderStatus | "all") => void;
  priority: WorkOrderPriority | "all";
  onPriorityChange: (value: WorkOrderPriority | "all") => void;
  facilityId: string | "all";
  onFacilityIdChange: (value: string | "all") => void;
  assetId: string | "all";
  onAssetIdChange: (value: string | "all") => void;
  assignedToUserId: string | "all";
  onAssignedToUserIdChange: (value: string | "all") => void;
  dueDate: WorkOrderDueDateFilter;
  onDueDateChange: (value: WorkOrderDueDateFilter) => void;
  maintenanceId: string | "all";
  onMaintenanceIdChange: (value: string | "all") => void;
  sort: WorkOrderSort;
  onSortChange: (value: WorkOrderSort) => void;
  total: number;
  loading?: boolean;
  onClearAll: () => void;
  onCreate: () => void;
}

function countActiveFilters(filters: {
  status: WorkOrderStatus | "all";
  priority: WorkOrderPriority | "all";
  facilityId: string | "all";
  assetId: string | "all";
  assignedToUserId: string | "all";
  dueDate: WorkOrderDueDateFilter;
  maintenanceId: string | "all";
}): number {
  let count = 0;
  if (filters.status !== "all") count += 1;
  if (filters.priority !== "all") count += 1;
  if (filters.facilityId !== "all") count += 1;
  if (filters.assetId !== "all") count += 1;
  if (filters.assignedToUserId !== "all") count += 1;
  if (filters.dueDate !== "all") count += 1;
  if (filters.maintenanceId !== "all") count += 1;
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
  assetId,
  onAssetIdChange,
  assignedToUserId,
  onAssignedToUserIdChange,
  dueDate,
  onDueDateChange,
  maintenanceId,
  onMaintenanceIdChange,
  sort = DEFAULT_WORK_ORDER_SORT,
  onSortChange,
  total,
  loading,
  onClearAll,
  onCreate,
}: WorkOrdersToolbarProps) {
  const { facilities } = useFacilityOptions();
  const [users, setUsers] = useState<User[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [maintenanceRows, setMaintenanceRows] = useState<Maintenance[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      UserService.listUsers({ page: 1, pageSize: 200 }),
      AssetService.listAssets({ page: 1, pageSize: 200 }),
      MaintenanceService.listMaintenance({ page: 1, pageSize: 200 }),
    ])
      .then(([userPage, assetPage, maintenancePage]) => {
        if (cancelled) return;
        setUsers(userPage.data);
        setAssets(assetPage.data);
        setMaintenanceRows(maintenancePage.data);
      })
      .catch(() => {
        if (cancelled) return;
        setUsers([]);
        setAssets([]);
        setMaintenanceRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeFilterCount = countActiveFilters({
    status,
    priority,
    facilityId,
    assetId,
    assignedToUserId,
    dueDate,
    maintenanceId,
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
    if (status !== "all") {
      next.push({
        id: "status",
        label: labelize(status),
        onRemove: () => onStatusChange("all"),
      });
    }
    if (priority !== "all") {
      next.push({
        id: "priority",
        label: labelize(priority),
        onRemove: () => onPriorityChange("all"),
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
    if (assetId !== "all") {
      const match = assets.find((item) => item.id === assetId);
      next.push({
        id: "asset",
        label: match?.name ?? assetId,
        onRemove: () => onAssetIdChange("all"),
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
    if (dueDate !== "all") {
      const match = WORK_ORDER_DUE_DATE_OPTIONS.find(
        (item) => item.value === dueDate
      );
      next.push({
        id: "dueDate",
        label: match?.label ?? dueDate,
        onRemove: () => onDueDateChange("all"),
      });
    }
    if (maintenanceId !== "all") {
      const match = maintenanceRows.find((item) => item.id === maintenanceId);
      next.push({
        id: "maintenance",
        label: match ? `${match.id} — ${match.title}` : maintenanceId,
        onRemove: () => onMaintenanceIdChange("all"),
      });
    }
    return next;
  }, [
    hasSearch,
    search,
    status,
    priority,
    facilityId,
    assetId,
    assignedToUserId,
    dueDate,
    maintenanceId,
    facilities,
    assets,
    users,
    maintenanceRows,
    onSearchChange,
    onStatusChange,
    onPriorityChange,
    onFacilityIdChange,
    onAssetIdChange,
    onAssignedToUserIdChange,
    onDueDateChange,
    onMaintenanceIdChange,
  ]);

  function clearFiltersOnly() {
    onStatusChange("all");
    onPriorityChange("all");
    onFacilityIdChange("all");
    onAssetIdChange("all");
    onAssignedToUserIdChange("all");
    onDueDateChange("all");
    onMaintenanceIdChange("all");
  }

  const facilityName = facilities.find((item) => item.id === facilityId)?.name;
  const filteredAssets =
    facilityId === "all"
      ? assets
      : assets.filter(
          (asset) =>
            asset.facility === facilityId ||
            (facilityName != null && asset.facility === facilityName)
        );

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
        sortOptions={WORK_ORDER_SORT_OPTIONS}
        onSortChange={(value) => onSortChange(value as WorkOrderSort)}
        leadingActions={
          <Button
            type="button"
            size="sm"
            className="h-9 shrink-0 rounded-md px-3.5 text-[0.8125rem] font-semibold shadow-none"
            onClick={onCreate}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            New work order
          </Button>
        }
        filterPanel={
          <>
            <FilterField
              id="wo-filter-status"
              label="Status"
              value={status}
              onChange={(value) =>
                onStatusChange(value as WorkOrderStatus | "all")
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
              id="wo-filter-priority"
              label="Priority"
              value={priority}
              onChange={(value) =>
                onPriorityChange(value as WorkOrderPriority | "all")
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
              id="wo-filter-facility"
              label="Facility"
              value={facilityId}
              onChange={(value) => {
                onFacilityIdChange(value as string | "all");
                onAssetIdChange("all");
              }}
            >
              <option value="all">All facilities</option>
              {facilities.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </FilterField>

            <FilterField
              id="wo-filter-asset"
              label="Asset"
              value={assetId}
              onChange={(value) => onAssetIdChange(value as string | "all")}
            >
              <option value="all">All assets</option>
              {filteredAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name}
                </option>
              ))}
            </FilterField>

            <FilterField
              id="wo-filter-assignee"
              label="Assigned To"
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
              id="wo-filter-due"
              label="Due date"
              value={dueDate}
              onChange={(value) =>
                onDueDateChange(value as WorkOrderDueDateFilter)
              }
            >
              {WORK_ORDER_DUE_DATE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </FilterField>

            <FilterField
              id="wo-filter-maintenance"
              label="Source Maintenance"
              value={maintenanceId}
              onChange={(value) =>
                onMaintenanceIdChange(value as string | "all")
              }
            >
              <option value="all">All maintenance</option>
              {maintenanceRows.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.id} — {row.title}
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
