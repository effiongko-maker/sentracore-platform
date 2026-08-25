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
import { useMasterDataOptions } from "@/hooks/useMasterDataOptions";
import {
  DEFAULT_MASTER_DATA_SORT,
  MASTER_DATA_PAGE_SIZE,
  MASTER_DATA_SORT_OPTIONS,
  MASTER_DATA_STATUSES,
  VENDOR_CATEGORIES,
  entityNoun,
} from "../constants";
import { labelize } from "../utils";
import type {
  MasterDataEntity,
  MasterDataSort,
  MasterDataStatus,
} from "../types";

interface MasterDataToolbarProps {
  entity: MasterDataEntity;
  search: string;
  onSearchChange: (value: string) => void;
  status: MasterDataStatus | "all";
  onStatusChange: (value: MasterDataStatus | "all") => void;
  facilityId: string | "all";
  onFacilityIdChange: (value: string | "all") => void;
  buildingId: string | "all";
  onBuildingIdChange: (value: string | "all") => void;
  floorId: string | "all";
  onFloorIdChange: (value: string | "all") => void;
  category: string | "all";
  onCategoryChange: (value: string | "all") => void;
  sort?: MasterDataSort;
  onSortChange?: (value: MasterDataSort) => void;
  total: number;
  loading?: boolean;
  onClearAll: () => void;
  onCreate: () => void;
  createLabel: string;
}

function countActiveFilters(args: {
  entity: MasterDataEntity;
  status: MasterDataStatus | "all";
  facilityId: string | "all";
  buildingId: string | "all";
  floorId: string | "all";
  category: string | "all";
}): number {
  let count = 0;
  if (args.status !== "all") count += 1;
  if (
    (args.entity === "buildings" ||
      args.entity === "floors" ||
      args.entity === "rooms") &&
    args.facilityId !== "all"
  ) {
    count += 1;
  }
  if (
    (args.entity === "floors" || args.entity === "rooms") &&
    args.buildingId !== "all"
  ) {
    count += 1;
  }
  if (args.entity === "rooms" && args.floorId !== "all") count += 1;
  if (args.entity === "vendors" && args.category !== "all") count += 1;
  return count;
}

export function MasterDataToolbar({
  entity,
  search,
  onSearchChange,
  status,
  onStatusChange,
  facilityId,
  onFacilityIdChange,
  buildingId,
  onBuildingIdChange,
  floorId,
  onFloorIdChange,
  category,
  onCategoryChange,
  sort = DEFAULT_MASTER_DATA_SORT,
  onSortChange,
  total,
  loading,
  onClearAll,
  onCreate,
  createLabel,
}: MasterDataToolbarProps) {
  const { facilities } = useFacilityOptions();
  const [filterOpen, setFilterOpen] = useState(false);
  const showFacility =
    entity === "buildings" || entity === "floors" || entity === "rooms";
  const showBuilding = entity === "floors" || entity === "rooms";
  const showFloor = entity === "rooms";
  const showCategory = entity === "vendors";

  const { items: buildings } = useMasterDataOptions("buildings", {
    enabled: showBuilding,
    facilityId: facilityId !== "all" ? facilityId : undefined,
  });
  const { items: floors } = useMasterDataOptions("floors", {
    enabled: showFloor,
    facilityId: facilityId !== "all" ? facilityId : undefined,
    buildingId: buildingId !== "all" ? buildingId : undefined,
  });

  const activeFilterCount = countActiveFilters({
    entity,
    status,
    facilityId,
    buildingId,
    floorId,
    category,
  });
  const hasSearch = Boolean(search.trim());
  const filtered = activeFilterCount > 0 || hasSearch;
  const nouns = entityNoun(entity);

  const chips: ActiveFilterChip[] = useMemo(() => {
    const next: ActiveFilterChip[] = [];
    if (hasSearch) {
      next.push({
        id: "search",
        label: `“${search.trim()}”`,
        onRemove: () => onSearchChange(""),
      });
    }
    if (showFacility && facilityId !== "all") {
      const match = facilities.find((item) => item.id === facilityId);
      next.push({
        id: "facility",
        label: match?.name ?? facilityId,
        onRemove: () => onFacilityIdChange("all"),
      });
    }
    if (showBuilding && buildingId !== "all") {
      const match = buildings.find((item) => item.id === buildingId);
      next.push({
        id: "building",
        label: match?.name ?? buildingId,
        onRemove: () => onBuildingIdChange("all"),
      });
    }
    if (showFloor && floorId !== "all") {
      const match = floors.find((item) => item.id === floorId);
      next.push({
        id: "floor",
        label: match?.name ?? floorId,
        onRemove: () => onFloorIdChange("all"),
      });
    }
    if (showCategory && category !== "all") {
      next.push({
        id: "category",
        label: category,
        onRemove: () => onCategoryChange("all"),
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
    showFacility,
    facilityId,
    facilities,
    showBuilding,
    buildingId,
    buildings,
    showFloor,
    floorId,
    floors,
    showCategory,
    category,
    status,
    onSearchChange,
    onFacilityIdChange,
    onBuildingIdChange,
    onFloorIdChange,
    onCategoryChange,
    onStatusChange,
  ]);

  function clearFiltersOnly() {
    onStatusChange("all");
    onFacilityIdChange("all");
    onBuildingIdChange("all");
    onFloorIdChange("all");
    onCategoryChange("all");
  }

  return (
    <div className="flex flex-col gap-3">
      <OperationalListToolbar
        search={search}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search by name, code…"
        filterOpen={filterOpen}
        onFilterOpenChange={setFilterOpen}
        activeFilterCount={activeFilterCount}
        canClearFilters={activeFilterCount > 0}
        onClearFilters={clearFiltersOnly}
        filterMode="live"
        sortValue={sort}
        sortOptions={MASTER_DATA_SORT_OPTIONS}
        onSortChange={(value) => onSortChange?.(value as MasterDataSort)}
        leadingActions={
          <Button
            type="button"
            size="sm"
            className="h-9 shrink-0 rounded-md px-3.5 text-[0.8125rem] font-semibold shadow-none"
            onClick={onCreate}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {createLabel}
          </Button>
        }
        filterPanel={
          <>
            {showFacility ? (
              <FilterField
                id="md-filter-facility"
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
            ) : null}

            {showBuilding ? (
              <FilterField
                id="md-filter-building"
                label="Building"
                value={buildingId}
                onChange={(value) =>
                  onBuildingIdChange(value as string | "all")
                }
              >
                <option value="all">All buildings</option>
                {buildings.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </FilterField>
            ) : null}

            {showFloor ? (
              <FilterField
                id="md-filter-floor"
                label="Floor"
                value={floorId}
                onChange={(value) => onFloorIdChange(value as string | "all")}
              >
                <option value="all">All floors</option>
                {floors.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </FilterField>
            ) : null}

            {showCategory ? (
              <FilterField
                id="md-filter-category"
                label="Category"
                value={category}
                onChange={(value) => onCategoryChange(value as string | "all")}
              >
                <option value="all">All categories</option>
                {VENDOR_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </FilterField>
            ) : null}

            <FilterField
              id="md-filter-status"
              label="Status"
              value={status}
              onChange={(value) =>
                onStatusChange(value as MasterDataStatus | "all")
              }
            >
              <option value="all">All statuses</option>
              {MASTER_DATA_STATUSES.map((value) => (
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
            noun: nouns.singular,
            nounPlural: nouns.plural,
            total,
            filtered,
            pageSize: MASTER_DATA_PAGE_SIZE,
          })}
        />
      ) : null}
    </div>
  );
}
