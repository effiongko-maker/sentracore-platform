"use client";

import { OperationalSearch } from "./OperationalSearch";
import {
  FilterPopover,
  FiltersTriggerButton,
} from "./FilterPopover";
import { SortMenu } from "./SortMenu";

export function OperationalListToolbar({
  search,
  onSearchChange,
  searchPlaceholder,
  filterOpen,
  onFilterOpenChange,
  activeFilterCount,
  canClearFilters,
  onClearFilters,
  onApplyFilters,
  filterMode = "apply",
  filterPanel,
  sortValue,
  sortOptions,
  onSortChange,
  leadingActions,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  filterOpen: boolean;
  onFilterOpenChange: (open: boolean) => void;
  activeFilterCount: number;
  canClearFilters?: boolean;
  onClearFilters: () => void;
  onApplyFilters?: () => void;
  filterMode?: "live" | "apply";
  filterPanel: React.ReactNode;
  sortValue: string;
  sortOptions: Array<{ value: string; label: string }>;
  onSortChange?: (value: string) => void;
  /** Primary/list actions rendered before Filters (e.g. New asset). */
  leadingActions?: React.ReactNode;
}) {
  return (
    <div className="op-toolbar">
      <OperationalSearch
        value={search}
        onChange={onSearchChange}
        placeholder={searchPlaceholder}
      />

      <div className="op-toolbar-actions">
        {leadingActions}

        <FilterPopover
          open={filterOpen}
          onClose={() => onFilterOpenChange(false)}
          activeCount={activeFilterCount}
          canClear={canClearFilters ?? activeFilterCount > 0}
          onClear={onClearFilters}
          onApply={onApplyFilters}
          mode={filterMode}
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

        <SortMenu
          value={sortValue}
          options={sortOptions}
          onChange={onSortChange}
        />
      </div>
    </div>
  );
}
