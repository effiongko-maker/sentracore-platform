"use client";

import { SlidersHorizontal } from "lucide-react";
import { SearchBox } from "@/components/ui/SearchBox";
import { toolbarSelectClassName } from "@/components/forms/FormField";
import {
  FACILITY_LOCATIONS,
  FACILITY_STATUSES,
  FACILITY_TYPES,
} from "../constants";
import { labelize } from "../utils";
import type { FacilityStatus, FacilityType } from "../types";

interface FacilitiesToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  type: FacilityType | "all";
  onTypeChange: (value: FacilityType | "all") => void;
  location: string | "all";
  onLocationChange: (value: string | "all") => void;
  status: FacilityStatus | "all";
  onStatusChange: (value: FacilityStatus | "all") => void;
}


export function FacilitiesToolbar({
  search,
  onSearchChange,
  type,
  onTypeChange,
  location,
  onLocationChange,
  status,
  onStatusChange,
}: FacilitiesToolbarProps) {
  return (
    <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <SearchBox
        value={search}
        onChange={onSearchChange}
        placeholder="Search by name, code, location, manager..."
        className="w-full xl:max-w-md"
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-border bg-card px-3 text-sm text-muted">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
        </div>

        <select
          value={type}
          onChange={(event) =>
            onTypeChange(event.target.value as FacilityType | "all")
          }
          className={toolbarSelectClassName}
          aria-label="Filter by type"
        >
          <option value="all">All types</option>
          {FACILITY_TYPES.map((value) => (
            <option key={value} value={value}>
              {labelize(value)}
            </option>
          ))}
        </select>

        <select
          value={location}
          onChange={(event) =>
            onLocationChange(event.target.value as string | "all")
          }
          className={toolbarSelectClassName}
          aria-label="Filter by location"
        >
          <option value="all">All locations</option>
          {FACILITY_LOCATIONS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(event) =>
            onStatusChange(event.target.value as FacilityStatus | "all")
          }
          className={toolbarSelectClassName}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          {FACILITY_STATUSES.map((value) => (
            <option key={value} value={value}>
              {labelize(value)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
