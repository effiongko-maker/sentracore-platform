"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
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
import { USERS_PAGE_SIZE, USER_STATUSES, USER_SORT_OPTIONS } from "../constants";
import { labelize } from "../utils";
import type { UserRole, UserSort, UserStatus } from "../types";

interface UsersToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  role: UserRole | "all";
  onRoleChange: (value: UserRole | "all") => void;
  roleOptions: string[];
  facility: string | "all";
  onFacilityChange: (value: string | "all") => void;
  status: UserStatus | "all";
  onStatusChange: (value: UserStatus | "all") => void;
  sort: UserSort;
  onSortChange: (value: UserSort) => void;
  total: number;
  loading?: boolean;
  onClearAll: () => void;
  onCreate: () => void;
}

function countActiveFilters(filters: {
  status: UserStatus | "all";
  role: UserRole | "all";
  facility: string | "all";
}): number {
  let count = 0;
  if (filters.status !== "all") count += 1;
  if (filters.role !== "all") count += 1;
  if (filters.facility !== "all") count += 1;
  return count;
}

export function UsersToolbar({
  search,
  onSearchChange,
  role,
  onRoleChange,
  roleOptions,
  facility,
  onFacilityChange,
  status,
  onStatusChange,
  sort,
  onSortChange,
  total,
  loading,
  onClearAll,
  onCreate,
}: UsersToolbarProps) {
  const { facilities } = useFacilityOptions();
  const [filterOpen, setFilterOpen] = useState(false);

  const activeFilterCount = countActiveFilters({ status, role, facility });
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
    if (role !== "all") {
      next.push({
        id: "role",
        label: role,
        onRemove: () => onRoleChange("all"),
      });
    }
    if (facility !== "all") {
      next.push({
        id: "facility",
        label: facility,
        onRemove: () => onFacilityChange("all"),
      });
    }
    if (status !== "all") {
      next.push({
        id: "status",
        label: labelize(status),
        onRemove: () => onStatusChange("all"),
      });
    }
    return next;
  }, [
    hasSearch,
    search,
    role,
    facility,
    status,
    onSearchChange,
    onRoleChange,
    onFacilityChange,
    onStatusChange,
  ]);

  function clearFiltersOnly() {
    onStatusChange("all");
    onRoleChange("all");
    onFacilityChange("all");
  }

  return (
    <div className="flex flex-col gap-3">
      <OperationalListToolbar
        search={search}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search by name, email, phone, role, specialization…"
        filterOpen={filterOpen}
        onFilterOpenChange={setFilterOpen}
        activeFilterCount={activeFilterCount}
        canClearFilters={activeFilterCount > 0}
        onClearFilters={clearFiltersOnly}
        filterMode="live"
        sortValue={sort}
        sortOptions={USER_SORT_OPTIONS}
        onSortChange={(value) => onSortChange(value as UserSort)}
        leadingActions={
          <Button
            type="button"
            size="sm"
            className="h-9 shrink-0 rounded-md px-3.5 text-[0.8125rem] font-semibold shadow-none"
            onClick={onCreate}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            New user
          </Button>
        }
        filterPanel={
          <>
            <FilterField
              id="user-filter-role"
              label="Role"
              value={role}
              onChange={(value) => onRoleChange(value as UserRole | "all")}
            >
              <option value="all">All roles</option>
              {roleOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </FilterField>

            <FilterField
              id="user-filter-facility"
              label="Facility"
              value={facility}
              onChange={(value) =>
                onFacilityChange(value as string | "all")
              }
            >
              <option value="all">All facilities</option>
              {facilities.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </FilterField>

            <FilterField
              id="user-filter-status"
              label="Status"
              value={status}
              onChange={(value) =>
                onStatusChange(value as UserStatus | "all")
              }
            >
              <option value="all">All statuses</option>
              {USER_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {labelize(value)}
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
            noun: "person",
            nounPlural: "people",
            total,
            filtered,
            pageSize: USERS_PAGE_SIZE,
          })}
        />
      ) : null}
    </div>
  );
}
