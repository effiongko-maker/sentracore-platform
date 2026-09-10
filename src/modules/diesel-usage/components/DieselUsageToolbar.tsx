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
  DIESEL_USAGE_PAGE_SIZE,
  DIESEL_USAGE_SORT_OPTIONS,
} from "../constants";
import type { DieselUsageSort } from "../types";

interface DieselUsageToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  facilityId: string;
  onFacilityIdChange: (value: string) => void;
  generatorId: string;
  onGeneratorIdChange: (value: string) => void;
  dateFrom: string;
  onDateFromChange: (value: string) => void;
  dateTo: string;
  onDateToChange: (value: string) => void;
  sort: DieselUsageSort;
  onSortChange: (value: DieselUsageSort) => void;
  total: number;
  loading?: boolean;
  onClearAll: () => void;
  onCreate: () => void;
  canCreate?: boolean;
}

function countActiveFilters(filters: {
  facilityId: string;
  generatorId: string;
  dateFrom: string;
  dateTo: string;
}): number {
  let count = 0;
  if (filters.facilityId.trim()) count += 1;
  if (filters.generatorId.trim()) count += 1;
  if (filters.dateFrom.trim()) count += 1;
  if (filters.dateTo.trim()) count += 1;
  return count;
}

export function DieselUsageToolbar({
  search,
  onSearchChange,
  facilityId,
  onFacilityIdChange,
  generatorId,
  onGeneratorIdChange,
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
}: DieselUsageToolbarProps) {
  const [filterOpen, setFilterOpen] = useState(false);

  const activeFilterCount = countActiveFilters({
    facilityId,
    generatorId,
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
    if (generatorId.trim()) {
      next.push({
        id: "generatorId",
        label: generatorId.trim(),
        onRemove: () => onGeneratorIdChange(""),
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
    generatorId,
    dateFrom,
    dateTo,
    onSearchChange,
    onFacilityIdChange,
    onGeneratorIdChange,
    onDateFromChange,
    onDateToChange,
  ]);

  function clearFiltersOnly() {
    onFacilityIdChange("");
    onGeneratorIdChange("");
    onDateFromChange("");
    onDateToChange("");
  }

  return (
    <div className="flex flex-col gap-3">
      <OperationalListToolbar
        search={search}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search by facility, generator, or entry ID…"
        filterOpen={filterOpen}
        onFilterOpenChange={setFilterOpen}
        activeFilterCount={activeFilterCount}
        canClearFilters={activeFilterCount > 0}
        onClearFilters={clearFiltersOnly}
        filterMode="live"
        sortValue={sort}
        sortOptions={DIESEL_USAGE_SORT_OPTIONS}
        onSortChange={(value) => onSortChange(value as DieselUsageSort)}
        leadingActions={
          canCreate ? (
            <Button
              type="button"
              size="sm"
              className="h-9 shrink-0 rounded-md px-3.5 text-[0.8125rem] font-semibold shadow-none"
              onClick={onCreate}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New entry
            </Button>
          ) : undefined
        }
        filterPanel={
          <>
            <div className="op-filter-field">
              <label htmlFor="diesel-usage-filter-facility">Facility ID</label>
              <input
                id="diesel-usage-filter-facility"
                className="op-filter-select"
                value={facilityId}
                onChange={(event) => onFacilityIdChange(event.target.value)}
                placeholder="e.g. FAC-0001"
              />
            </div>
            <div className="op-filter-field">
              <label htmlFor="diesel-usage-filter-generator">Generator ID</label>
              <input
                id="diesel-usage-filter-generator"
                className="op-filter-select"
                value={generatorId}
                onChange={(event) => onGeneratorIdChange(event.target.value)}
                placeholder="e.g. Gen-01"
              />
            </div>
            <div className="op-filter-field">
              <label htmlFor="diesel-usage-filter-from">Date from</label>
              <input
                id="diesel-usage-filter-from"
                type="date"
                className="op-filter-select"
                value={dateFrom}
                onChange={(event) => onDateFromChange(event.target.value)}
              />
            </div>
            <div className="op-filter-field">
              <label htmlFor="diesel-usage-filter-to">Date to</label>
              <input
                id="diesel-usage-filter-to"
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
            noun: "entry",
            nounPlural: "entries",
            total,
            filtered,
            pageSize: DIESEL_USAGE_PAGE_SIZE,
          })}
        />
      ) : null}
    </div>
  );
}
