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
  ENERGY_READING_PAGE_SIZE,
  ENERGY_READING_SORT_OPTIONS,
} from "../constants";
import type { EnergyReadingSort } from "../types";

interface EnergyReadingsToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  meter: string;
  onMeterChange: (value: string) => void;
  dateFrom: string;
  onDateFromChange: (value: string) => void;
  dateTo: string;
  onDateToChange: (value: string) => void;
  sort: EnergyReadingSort;
  onSortChange: (value: EnergyReadingSort) => void;
  total: number;
  loading?: boolean;
  onClearAll: () => void;
  onCreate: () => void;
  canCreate?: boolean;
}

function countActiveFilters(filters: {
  meter: string;
  dateFrom: string;
  dateTo: string;
}): number {
  let count = 0;
  if (filters.meter.trim()) count += 1;
  if (filters.dateFrom.trim()) count += 1;
  if (filters.dateTo.trim()) count += 1;
  return count;
}

export function EnergyReadingsToolbar({
  search,
  onSearchChange,
  meter,
  onMeterChange,
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
}: EnergyReadingsToolbarProps) {
  const [filterOpen, setFilterOpen] = useState(false);

  const activeFilterCount = countActiveFilters({
    meter,
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
    if (meter.trim()) {
      next.push({
        id: "meter",
        label: meter.trim(),
        onRemove: () => onMeterChange(""),
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
    meter,
    dateFrom,
    dateTo,
    onSearchChange,
    onMeterChange,
    onDateFromChange,
    onDateToChange,
  ]);

  function clearFiltersOnly() {
    onMeterChange("");
    onDateFromChange("");
    onDateToChange("");
  }

  return (
    <div className="flex flex-col gap-3">
      <OperationalListToolbar
        search={search}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search by meter, remarks, or reading ID…"
        filterOpen={filterOpen}
        onFilterOpenChange={setFilterOpen}
        activeFilterCount={activeFilterCount}
        canClearFilters={activeFilterCount > 0}
        onClearFilters={clearFiltersOnly}
        filterMode="live"
        sortValue={sort}
        sortOptions={ENERGY_READING_SORT_OPTIONS}
        onSortChange={(value) => onSortChange(value as EnergyReadingSort)}
        leadingActions={
          canCreate ? (
            <Button
              type="button"
              size="sm"
              className="h-9 shrink-0 rounded-md px-3.5 text-[0.8125rem] font-semibold shadow-none"
              onClick={onCreate}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New reading
            </Button>
          ) : undefined
        }
        filterPanel={
          <>
            <div className="op-filter-field">
              <label htmlFor="energy-reading-filter-meter">Meter No.</label>
              <input
                id="energy-reading-filter-meter"
                className="op-filter-select"
                value={meter}
                onChange={(event) => onMeterChange(event.target.value)}
                placeholder="e.g. AEDC-01"
              />
            </div>
            <div className="op-filter-field">
              <label htmlFor="energy-reading-filter-from">Date from</label>
              <input
                id="energy-reading-filter-from"
                type="date"
                className="op-filter-select"
                value={dateFrom}
                onChange={(event) => onDateFromChange(event.target.value)}
              />
            </div>
            <div className="op-filter-field">
              <label htmlFor="energy-reading-filter-to">Date to</label>
              <input
                id="energy-reading-filter-to"
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
            noun: "reading",
            nounPlural: "readings",
            total,
            filtered,
            pageSize: ENERGY_READING_PAGE_SIZE,
          })}
        />
      ) : null}
    </div>
  );
}
