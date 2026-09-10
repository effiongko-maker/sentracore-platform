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
import { WASTE_LOG_PAGE_SIZE, WASTE_LOG_SORT_OPTIONS } from "../constants";
import type { WasteLogSort } from "../types";

interface WasteLogsToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  facilityId: string;
  onFacilityIdChange: (value: string) => void;
  wasteType: string;
  onWasteTypeChange: (value: string) => void;
  dateFrom: string;
  onDateFromChange: (value: string) => void;
  dateTo: string;
  onDateToChange: (value: string) => void;
  sort: WasteLogSort;
  onSortChange: (value: WasteLogSort) => void;
  total: number;
  loading?: boolean;
  onClearAll: () => void;
  onCreate: () => void;
  canCreate?: boolean;
}

function countActiveFilters(filters: {
  facilityId: string;
  wasteType: string;
  dateFrom: string;
  dateTo: string;
}): number {
  let count = 0;
  if (filters.facilityId.trim()) count += 1;
  if (filters.wasteType.trim()) count += 1;
  if (filters.dateFrom.trim()) count += 1;
  if (filters.dateTo.trim()) count += 1;
  return count;
}

export function WasteLogsToolbar({
  search,
  onSearchChange,
  facilityId,
  onFacilityIdChange,
  wasteType,
  onWasteTypeChange,
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
}: WasteLogsToolbarProps) {
  const [filterOpen, setFilterOpen] = useState(false);

  const activeFilterCount = countActiveFilters({
    facilityId,
    wasteType,
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
    if (wasteType.trim()) {
      next.push({
        id: "wasteType",
        label: wasteType.trim(),
        onRemove: () => onWasteTypeChange(""),
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
    wasteType,
    dateFrom,
    dateTo,
    onSearchChange,
    onFacilityIdChange,
    onWasteTypeChange,
    onDateFromChange,
    onDateToChange,
  ]);

  function clearFiltersOnly() {
    onFacilityIdChange("");
    onWasteTypeChange("");
    onDateFromChange("");
    onDateToChange("");
  }

  return (
    <div className="flex flex-col gap-3">
      <OperationalListToolbar
        search={search}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search by facility, waste type, disposal, or log ID…"
        filterOpen={filterOpen}
        onFilterOpenChange={setFilterOpen}
        activeFilterCount={activeFilterCount}
        canClearFilters={activeFilterCount > 0}
        onClearFilters={clearFiltersOnly}
        filterMode="live"
        sortValue={sort}
        sortOptions={WASTE_LOG_SORT_OPTIONS}
        onSortChange={(value) => onSortChange(value as WasteLogSort)}
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
              <label htmlFor="waste-log-filter-facility">Facility ID</label>
              <input
                id="waste-log-filter-facility"
                className="op-filter-select"
                value={facilityId}
                onChange={(event) => onFacilityIdChange(event.target.value)}
                placeholder="e.g. FAC-0001"
              />
            </div>
            <div className="op-filter-field">
              <label htmlFor="waste-log-filter-type">Waste Type</label>
              <input
                id="waste-log-filter-type"
                className="op-filter-select"
                value={wasteType}
                onChange={(event) => onWasteTypeChange(event.target.value)}
                placeholder="e.g. General"
              />
            </div>
            <div className="op-filter-field">
              <label htmlFor="waste-log-filter-from">Date from</label>
              <input
                id="waste-log-filter-from"
                type="date"
                className="op-filter-select"
                value={dateFrom}
                onChange={(event) => onDateFromChange(event.target.value)}
              />
            </div>
            <div className="op-filter-field">
              <label htmlFor="waste-log-filter-to">Date to</label>
              <input
                id="waste-log-filter-to"
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
            pageSize: WASTE_LOG_PAGE_SIZE,
          })}
        />
      ) : null}
    </div>
  );
}
