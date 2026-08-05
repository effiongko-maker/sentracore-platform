"use client";

import { SlidersHorizontal } from "lucide-react";
import { SearchBox } from "@/components/ui/SearchBox";
import { toolbarSelectClassName } from "@/components/forms/FormField";
import { MASTER_DATA_STATUSES } from "../constants";
import { labelize } from "../utils";
import type { MasterDataStatus } from "../types";

export function MasterDataToolbar({
  search,
  onSearchChange,
  status,
  onStatusChange,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  status: MasterDataStatus | "all";
  onStatusChange: (value: MasterDataStatus | "all") => void;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <SearchBox
        value={search}
        onChange={onSearchChange}
        placeholder="Search by name, code..."
        className="w-full sm:max-w-md"
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-border bg-card px-3 text-sm text-muted">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
        </div>
        <select
          value={status}
          onChange={(event) =>
            onStatusChange(event.target.value as MasterDataStatus | "all")
          }
          className={toolbarSelectClassName}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          {MASTER_DATA_STATUSES.map((value) => (
            <option key={value} value={value}>
              {labelize(value)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
