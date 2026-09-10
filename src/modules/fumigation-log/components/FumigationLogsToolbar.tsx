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
  FUMIGATION_LOG_PAGE_SIZE,
  FUMIGATION_LOG_SORT_OPTIONS,
} from "../constants";
import type { FumigationLogSort } from "../types";

interface FumigationLogsToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  facilityId: string;
  onFacilityIdChange: (value: string) => void;
  dateFrom: string;
  onDateFromChange: (value: string) => void;
  dateTo: string;
  onDateToChange: (value: string) => void;
  nextDueFrom: string;
  onNextDueFromChange: (value: string) => void;
  nextDueTo: string;
  onNextDueToChange: (value: string) => void;
  sort: FumigationLogSort;
  onSortChange: (value: FumigationLogSort) => void;
  total: number;
  loading?: boolean;
  onClearAll: () => void;
  onCreate: () => void;
  canCreate?: boolean;
}

function countActiveFilters(filters: {
  facilityId: string;
  dateFrom: string;
  dateTo: string;
  nextDueFrom: string;
  nextDueTo: string;
}): number {
  let count = 0;
  if (filters.facilityId.trim()) count += 1;
  if (filters.dateFrom.trim()) count += 1;
  if (filters.dateTo.trim()) count += 1;
  if (filters.nextDueFrom.trim()) count += 1;
  if (filters.nextDueTo.trim()) count += 1;
  return count;
}

export function FumigationLogsToolbar({
  search,
  onSearchChange,
  facilityId,
  onFacilityIdChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  nextDueFrom,
  onNextDueFromChange,
  nextDueTo,
  onNextDueToChange,
  sort,
  onSortChange,
  total,
  loading,
  onClearAll,
  onCreate,
  canCreate = true,
}: FumigationLogsToolbarProps) {
  const [filterOpen, setFilterOpen] = useState(false);

  const activeFilterCount = countActiveFilters({
    facilityId,
    dateFrom,
    dateTo,
    nextDueFrom,
    nextDueTo,
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
    if (nextDueFrom.trim()) {
      next.push({
        id: "nextDueFrom",
        label: `Due from ${nextDueFrom}`,
        onRemove: () => onNextDueFromChange(""),
      });
    }
    if (nextDueTo.trim()) {
      next.push({
        id: "nextDueTo",
        label: `Due to ${nextDueTo}`,
        onRemove: () => onNextDueToChange(""),
      });
    }
    return next;
  }, [
    hasSearch,
    search,
    facilityId,
    dateFrom,
    dateTo,
    nextDueFrom,
    nextDueTo,
    onSearchChange,
    onFacilityIdChange,
    onDateFromChange,
    onDateToChange,
    onNextDueFromChange,
    onNextDueToChange,
  ]);

  function clearFiltersOnly() {
    onFacilityIdChange("");
    onDateFromChange("");
    onDateToChange("");
    onNextDueFromChange("");
    onNextDueToChange("");
  }

  return (
    <div className="flex flex-col gap-3">
      <OperationalListToolbar
        search={search}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search by facility, area, pest, vendor, or log ID…"
        filterOpen={filterOpen}
        onFilterOpenChange={setFilterOpen}
        activeFilterCount={activeFilterCount}
        canClearFilters={activeFilterCount > 0}
        onClearFilters={clearFiltersOnly}
        filterMode="live"
        sortValue={sort}
        sortOptions={FUMIGATION_LOG_SORT_OPTIONS}
        onSortChange={(value) => onSortChange(value as FumigationLogSort)}
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
              <label htmlFor="fumigation-log-filter-facility">Facility ID</label>
              <input
                id="fumigation-log-filter-facility"
                className="op-filter-select"
                value={facilityId}
                onChange={(event) => onFacilityIdChange(event.target.value)}
                placeholder="e.g. FAC-0001"
              />
            </div>
            <div className="op-filter-field">
              <label htmlFor="fumigation-log-filter-from">Date from</label>
              <input
                id="fumigation-log-filter-from"
                type="date"
                className="op-filter-select"
                value={dateFrom}
                onChange={(event) => onDateFromChange(event.target.value)}
              />
            </div>
            <div className="op-filter-field">
              <label htmlFor="fumigation-log-filter-to">Date to</label>
              <input
                id="fumigation-log-filter-to"
                type="date"
                className="op-filter-select"
                value={dateTo}
                onChange={(event) => onDateToChange(event.target.value)}
              />
            </div>
            <div className="op-filter-field">
              <label htmlFor="fumigation-log-filter-due-from">
                Next due from
              </label>
              <input
                id="fumigation-log-filter-due-from"
                type="date"
                className="op-filter-select"
                value={nextDueFrom}
                onChange={(event) => onNextDueFromChange(event.target.value)}
              />
            </div>
            <div className="op-filter-field">
              <label htmlFor="fumigation-log-filter-due-to">Next due to</label>
              <input
                id="fumigation-log-filter-due-to"
                type="date"
                className="op-filter-select"
                value={nextDueTo}
                onChange={(event) => onNextDueToChange(event.target.value)}
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
            pageSize: FUMIGATION_LOG_PAGE_SIZE,
          })}
        />
      ) : null}
    </div>
  );
}
