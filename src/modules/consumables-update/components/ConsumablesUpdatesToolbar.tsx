"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import {
  ActiveFilters,
  OperationalListToolbar,
  ResultContext,
  buildResultContext,
  type ActiveFilterChip,
} from "@/components/operational";
import { Button } from "@/components/ui/Button";
import {
  CONSUMABLES_UPDATE_PAGE_SIZE,
  CONSUMABLES_UPDATE_SORT_OPTIONS,
} from "../constants";
import type { ConsumablesUpdateSort } from "../types";

interface ConsumablesUpdatesToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  facilityId: string;
  onFacilityIdChange: (value: string) => void;
  itemName: string;
  onItemNameChange: (value: string) => void;
  dateFrom: string;
  onDateFromChange: (value: string) => void;
  dateTo: string;
  onDateToChange: (value: string) => void;
  sort: ConsumablesUpdateSort;
  onSortChange: (value: ConsumablesUpdateSort) => void;
  total: number;
  loading?: boolean;
  onClearAll: () => void;
  onCreate: () => void;
  canCreate?: boolean;
}

function countActiveFilters(filters: {
  facilityId: string;
  itemName: string;
  dateFrom: string;
  dateTo: string;
}): number {
  let count = 0;
  if (filters.facilityId.trim()) count += 1;
  if (filters.itemName.trim()) count += 1;
  if (filters.dateFrom.trim()) count += 1;
  if (filters.dateTo.trim()) count += 1;
  return count;
}

export function ConsumablesUpdatesToolbar({
  search,
  onSearchChange,
  facilityId,
  onFacilityIdChange,
  itemName,
  onItemNameChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  sort,
  onSortChange,
  total,
  loading,
  onClearAll,
  onCreate,
  canCreate = true,
}: ConsumablesUpdatesToolbarProps) {
  const [filterOpen, setFilterOpen] = useState(false);

  const activeFilterCount = countActiveFilters({
    facilityId,
    itemName,
    dateFrom,
    dateTo,
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
    if (facilityId.trim()) {
      next.push({
        id: "facilityId",
        label: facilityId.trim(),
        onRemove: () => onFacilityIdChange(""),
      });
    }
    if (itemName.trim()) {
      next.push({
        id: "itemName",
        label: itemName.trim(),
        onRemove: () => onItemNameChange(""),
      });
    }
    if (dateFrom.trim()) {
      next.push({
        id: "dateFrom",
        label: `From ${dateFrom}`,
        onRemove: () => onDateFromChange(""),
      });
    }
    if (dateTo.trim()) {
      next.push({
        id: "dateTo",
        label: `To ${dateTo}`,
        onRemove: () => onDateToChange(""),
      });
    }
    return next;
  }, [
    hasSearch,
    search,
    facilityId,
    itemName,
    dateFrom,
    dateTo,
    onSearchChange,
    onFacilityIdChange,
    onItemNameChange,
    onDateFromChange,
    onDateToChange,
  ]);

  function clearFiltersOnly() {
    onFacilityIdChange("");
    onItemNameChange("");
    onDateFromChange("");
    onDateToChange("");
  }

  return (
    <div className="flex flex-col gap-3">
      <OperationalListToolbar
        search={search}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search by facility, item, or ID…"
        filterOpen={filterOpen}
        onFilterOpenChange={setFilterOpen}
        activeFilterCount={activeFilterCount}
        canClearFilters={activeFilterCount > 0}
        onClearFilters={clearFiltersOnly}
        filterMode="live"
        sortValue={sort}
        sortOptions={CONSUMABLES_UPDATE_SORT_OPTIONS}
        onSortChange={(value) => onSortChange(value as ConsumablesUpdateSort)}
        leadingActions={
          canCreate ? (
            <Button
              type="button"
              size="sm"
              className="h-9 shrink-0 rounded-md px-3.5 text-[0.8125rem] font-semibold shadow-none"
              onClick={onCreate}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New update
            </Button>
          ) : undefined
        }
        filterPanel={
          <>
            <div className="op-filter-field">
              <label htmlFor="consumables-filter-facility">Facility ID</label>
              <input
                id="consumables-filter-facility"
                className="op-filter-select"
                value={facilityId}
                onChange={(event) => onFacilityIdChange(event.target.value)}
                placeholder="e.g. FAC-0001"
              />
            </div>
            <div className="op-filter-field">
              <label htmlFor="consumables-filter-item">Item Name</label>
              <input
                id="consumables-filter-item"
                className="op-filter-select"
                value={itemName}
                onChange={(event) => onItemNameChange(event.target.value)}
                placeholder="e.g. Gloves"
              />
            </div>
            <div className="op-filter-field">
              <label htmlFor="consumables-filter-from">Date from</label>
              <input
                id="consumables-filter-from"
                type="date"
                className="op-filter-select"
                value={dateFrom}
                onChange={(event) => onDateFromChange(event.target.value)}
              />
            </div>
            <div className="op-filter-field">
              <label htmlFor="consumables-filter-to">Date to</label>
              <input
                id="consumables-filter-to"
                type="date"
                className="op-filter-select"
                value={dateTo}
                onChange={(event) => onDateToChange(event.target.value)}
              />
            </div>
          </>
        }
      />

      <ActiveFilters chips={chips} onClearAll={onClearAll} />

      {!loading && filtered ? (
        <ResultContext
          text={buildResultContext({
            noun: "update",
            nounPlural: "updates",
            total,
            filtered,
            pageSize: CONSUMABLES_UPDATE_PAGE_SIZE,
          })}
        />
      ) : null}
    </div>
  );
}
