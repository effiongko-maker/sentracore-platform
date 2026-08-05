"use client";

import { SlidersHorizontal } from "lucide-react";
import { SearchBox } from "@/components/ui/SearchBox";
import { toolbarSelectClassName } from "@/components/forms/FormField";
import { useFacilityOptions } from "@/hooks/useFacilityOptions";
import { ASSET_CATEGORIES, ASSET_STATUSES } from "../constants";
import { labelize } from "../utils";
import type { AssetCategory, AssetStatus } from "../types";

interface AssetsToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  category: AssetCategory | "all";
  onCategoryChange: (value: AssetCategory | "all") => void;
  facility: string | "all";
  onFacilityChange: (value: string | "all") => void;
  status: AssetStatus | "all";
  onStatusChange: (value: AssetStatus | "all") => void;
}

export function AssetsToolbar({
  search,
  onSearchChange,
  category,
  onCategoryChange,
  facility,
  onFacilityChange,
  status,
  onStatusChange,
}: AssetsToolbarProps) {
  const { facilities } = useFacilityOptions();

  return (
    <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <SearchBox
        value={search}
        onChange={onSearchChange}
        placeholder="Search by name, tag, facility, serial..."
        className="w-full xl:max-w-md"
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-border bg-card px-3 text-sm text-muted">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
        </div>

        <select
          value={category}
          onChange={(event) =>
            onCategoryChange(event.target.value as AssetCategory | "all")
          }
          className={toolbarSelectClassName}
          aria-label="Filter by category"
        >
          <option value="all">All categories</option>
          {ASSET_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {labelize(value)}
            </option>
          ))}
        </select>

        <select
          value={facility}
          onChange={(event) =>
            onFacilityChange(event.target.value as string | "all")
          }
          className={toolbarSelectClassName}
          aria-label="Filter by facility"
        >
          <option value="all">All facilities</option>
          {facilities.map((item) => (
            <option key={item.id} value={item.name}>
              {item.name}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(event) =>
            onStatusChange(event.target.value as AssetStatus | "all")
          }
          className={toolbarSelectClassName}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          {ASSET_STATUSES.map((value) => (
            <option key={value} value={value}>
              {labelize(value)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
