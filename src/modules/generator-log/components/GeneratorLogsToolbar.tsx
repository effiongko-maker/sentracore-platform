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
  GENERATOR_LOG_PAGE_SIZE,
  GENERATOR_LOG_SORT_OPTIONS,
} from "../constants";
import type { GeneratorLogSort } from "../types";

interface GeneratorLogsToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  generator: string;
  onGeneratorChange: (value: string) => void;
  dateFrom: string;
  onDateFromChange: (value: string) => void;
  dateTo: string;
  onDateToChange: (value: string) => void;
  sort: GeneratorLogSort;
  onSortChange: (value: GeneratorLogSort) => void;
  total: number;
  loading?: boolean;
  onClearAll: () => void;
  onCreate: () => void;
  canCreate?: boolean;
}

function countActiveFilters(filters: {
  generator: string;
  dateFrom: string;
  dateTo: string;
}): number {
  let count = 0;
  if (filters.generator.trim()) count += 1;
  if (filters.dateFrom.trim()) count += 1;
  if (filters.dateTo.trim()) count += 1;
  return count;
}

export function GeneratorLogsToolbar({
  search,
  onSearchChange,
  generator,
  onGeneratorChange,
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
}: GeneratorLogsToolbarProps) {
  const [filterOpen, setFilterOpen] = useState(false);

  const activeFilterCount = countActiveFilters({
    generator,
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
    if (generator.trim()) {
      next.push({
        id: "generator",
        label: generator.trim(),
        onRemove: () => onGeneratorChange(""),
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
    generator,
    dateFrom,
    dateTo,
    onSearchChange,
    onGeneratorChange,
    onDateFromChange,
    onDateToChange,
  ]);

  function clearFiltersOnly() {
    onGeneratorChange("");
    onDateFromChange("");
    onDateToChange("");
  }

  return (
    <div className="flex flex-col gap-3">
      <OperationalListToolbar
        search={search}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search by generator, remarks, or log ID…"
        filterOpen={filterOpen}
        onFilterOpenChange={setFilterOpen}
        activeFilterCount={activeFilterCount}
        canClearFilters={activeFilterCount > 0}
        onClearFilters={clearFiltersOnly}
        filterMode="live"
        sortValue={sort}
        sortOptions={GENERATOR_LOG_SORT_OPTIONS}
        onSortChange={(value) => onSortChange(value as GeneratorLogSort)}
        leadingActions={
          canCreate ? (
            <Button
              type="button"
              size="sm"
              className="h-9 shrink-0 rounded-md px-3.5 text-[0.8125rem] font-semibold shadow-none"
              onClick={onCreate}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New log
            </Button>
          ) : undefined
        }
        filterPanel={
          <>
            <div className="op-filter-field">
              <label htmlFor="generator-log-filter-generator">Generator</label>
              <input
                id="generator-log-filter-generator"
                className="op-filter-select"
                value={generator}
                onChange={(event) => onGeneratorChange(event.target.value)}
                placeholder="e.g. Gen-01"
              />
            </div>
            <div className="op-filter-field">
              <label htmlFor="generator-log-filter-from">Date from</label>
              <input
                id="generator-log-filter-from"
                type="date"
                className="op-filter-select"
                value={dateFrom}
                onChange={(event) => onDateFromChange(event.target.value)}
              />
            </div>
            <div className="op-filter-field">
              <label htmlFor="generator-log-filter-to">Date to</label>
              <input
                id="generator-log-filter-to"
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
            noun: "log",
            nounPlural: "logs",
            total,
            filtered,
            pageSize: GENERATOR_LOG_PAGE_SIZE,
          })}
        />
      ) : null}
    </div>
  );
}
