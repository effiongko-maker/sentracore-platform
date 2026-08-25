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
import {
  ASSETS_PAGE_SIZE,
  ASSET_CATEGORIES,
  ASSET_FILTER_STATUSES,
  ASSET_SORT_OPTIONS,
} from "../constants";
import { labelize } from "../utils";
import type { AssetCategory, AssetSort, AssetStatus } from "../types";

interface AssetsToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  category: AssetCategory | "all";
  onCategoryChange: (value: AssetCategory | "all") => void;
  facility: string | "all";
  onFacilityChange: (value: string | "all") => void;
  status: AssetStatus | "all";
  onStatusChange: (value: AssetStatus | "all") => void;
  sort: AssetSort;
  onSortChange: (value: AssetSort) => void;
  total: number;
  loading?: boolean;
  onClearAll: () => void;
  onCreate: () => void;
}

function countActiveFilters(filters: {
  status: AssetStatus | "all";
  category: AssetCategory | "all";
  facility: string | "all";
}): number {
  let count = 0;
  if (filters.status !== "all") count += 1;
  if (filters.category !== "all") count += 1;
  if (filters.facility !== "all") count += 1;
  return count;
}

export function AssetsToolbar({
  search,
  onSearchChange,
  category,
  onCategoryChange,
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
}: AssetsToolbarProps) {
  const { facilities } = useFacilityOptions();
  const [filterOpen, setFilterOpen] = useState(false);

  const activeFilterCount = countActiveFilters({ status, category, facility });
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
    if (category !== "all") {
      next.push({
        id: "category",
        label: labelize(category),
        onRemove: () => onCategoryChange("all"),
      });
    }
    if (facility !== "all") {
      const match = facilities.find(
        (item) => item.id === facility || item.name === facility
      );
      next.push({
        id: "facility",
        label: match?.name ?? facility,
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
    category,
    facility,
    status,
    facilities,
    onSearchChange,
    onCategoryChange,
    onFacilityChange,
    onStatusChange,
  ]);

  function clearFiltersOnly() {
    onStatusChange("all");
    onCategoryChange("all");
    onFacilityChange("all");
  }

  return (
    <div className="flex flex-col gap-3">
      <OperationalListToolbar
        search={search}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search by name, asset ID, facility, serial number…"
        filterOpen={filterOpen}
        onFilterOpenChange={setFilterOpen}
        activeFilterCount={activeFilterCount}
        canClearFilters={activeFilterCount > 0}
        onClearFilters={clearFiltersOnly}
        filterMode="live"
        sortValue={sort}
        sortOptions={ASSET_SORT_OPTIONS}
        onSortChange={(value) => onSortChange(value as AssetSort)}
        leadingActions={
          <Button
            type="button"
            size="sm"
            className="h-9 shrink-0 rounded-md px-3.5 text-[0.8125rem] font-semibold shadow-none"
            onClick={onCreate}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            New asset
          </Button>
        }
        filterPanel={
          <>
            <FilterField
              id="asset-filter-category"
              label="Category"
              value={category}
              onChange={(value) =>
                onCategoryChange(value as AssetCategory | "all")
              }
            >
              <option value="all">All categories</option>
              {ASSET_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {labelize(value)}
                </option>
              ))}
            </FilterField>

            <FilterField
              id="asset-filter-facility"
              label="Facility"
              value={facility}
              onChange={(value) =>
                onFacilityChange(value as string | "all")
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
              id="asset-filter-status"
              label="Status"
              value={status}
              onChange={(value) =>
                onStatusChange(value as AssetStatus | "all")
              }
            >
              <option value="all">All statuses</option>
              {ASSET_FILTER_STATUSES.map((value) => (
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
            noun: "asset",
            nounPlural: "assets",
            total,
            filtered,
            pageSize: ASSETS_PAGE_SIZE,
          })}
        />
      ) : null}
    </div>
  );
}
