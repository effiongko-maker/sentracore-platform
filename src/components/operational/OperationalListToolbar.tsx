"use client";

import { OperationalSearch } from "./OperationalSearch";
import {
  FilterPopover,
  FiltersTriggerButton,
} from "./FilterPopover";

export function OperationalListToolbar({
  search,
  onSearchChange,
  searchPlaceholder,
  filterOpen,
  onFilterOpenChange,
  activeFilterCount,
  onClearFilters,
  onApplyFilters,
  filterPanel,
  sortValue,
  sortOptions,
  onSortChange,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  filterOpen: boolean;
  onFilterOpenChange: (open: boolean) => void;
  activeFilterCount: number;
  onClearFilters: () => void;
  onApplyFilters: () => void;
  filterPanel: React.ReactNode;
  sortValue: string;
  sortOptions: Array<{ value: string; label: string }>;
  onSortChange?: (value: string) => void;
}) {
  return (
    <div className="op-toolbar">
      <OperationalSearch
        value={search}
        onChange={onSearchChange}
        placeholder={searchPlaceholder}
      />

      <div className="op-toolbar-actions">
        <FilterPopover
          open={filterOpen}
          onClose={() => onFilterOpenChange(false)}
          activeCount={activeFilterCount}
          onClear={onClearFilters}
          onApply={onApplyFilters}
          trigger={
            <FiltersTriggerButton
              activeCount={activeFilterCount}
              open={filterOpen}
              onClick={() => onFilterOpenChange(!filterOpen)}
            />
          }
        >
          {filterPanel}
        </FilterPopover>

        <div className="op-sort">
          <label htmlFor="op-sort-select">Sort</label>
          <select
            id="op-sort-select"
            value={sortValue}
            onChange={(event) => onSortChange?.(event.target.value)}
            aria-label="Sort"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
