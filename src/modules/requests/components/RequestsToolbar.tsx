"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ActiveFilters,
  FilterField,
  OperationalListToolbar,
  ResultContext,
  buildResultContext,
  type ActiveFilterChip,
} from "@/components/operational";
import { FacilityService } from "@/services/facilities/FacilityService";
import type { Facility } from "@/modules/facilities/types";
import {
  REQUESTS_PAGE_SIZE,
  REQUEST_STATUSES,
  REQUEST_STATUS_LABELS,
} from "../constants";
import type { RequestStatus } from "../types";

interface RequestsToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  status: RequestStatus | "all";
  onStatusChange: (value: RequestStatus | "all") => void;
  facilityId: string | "all";
  onFacilityIdChange: (value: string | "all") => void;
  total: number;
  loading?: boolean;
}

type DraftFilters = {
  status: RequestStatus | "all";
  facilityId: string | "all";
};

function countActive(filters: DraftFilters): number {
  let count = 0;
  if (filters.status !== "all") count += 1;
  if (filters.facilityId !== "all") count += 1;
  return count;
}

export function RequestsToolbar({
  search,
  onSearchChange,
  status,
  onStatusChange,
  facilityId,
  onFacilityIdChange,
  total,
  loading,
}: RequestsToolbarProps) {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draft, setDraft] = useState<DraftFilters>({
    status,
    facilityId,
  });

  useEffect(() => {
    let cancelled = false;
    FacilityService.listFacilities({ page: 1, pageSize: 200 })
      .then((facilityPage) => {
        if (cancelled) return;
        setFacilities(facilityPage.data);
      })
      .catch(() => {
        if (cancelled) return;
        setFacilities([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (filterOpen) {
      setDraft({ status, facilityId });
    }
  }, [filterOpen, status, facilityId]);

  const applied: DraftFilters = { status, facilityId };
  const activeFilterCount = countActive(applied);
  const filtered = activeFilterCount > 0 || Boolean(search.trim());

  const chips: ActiveFilterChip[] = useMemo(() => {
    const next: ActiveFilterChip[] = [];
    if (status !== "all") {
      next.push({
        id: "status",
        label: REQUEST_STATUS_LABELS[status],
        onRemove: () => onStatusChange("all"),
      });
    }
    if (facilityId !== "all") {
      const facility = facilities.find((item) => item.id === facilityId);
      next.push({
        id: "facility",
        label: facility?.name ?? facilityId,
        onRemove: () => onFacilityIdChange("all"),
      });
    }
    return next;
  }, [status, facilityId, facilities, onStatusChange, onFacilityIdChange]);

  function clearAll() {
    onStatusChange("all");
    onFacilityIdChange("all");
    setDraft({ status: "all", facilityId: "all" });
  }

  function applyDraft() {
    onStatusChange(draft.status);
    onFacilityIdChange(draft.facilityId);
  }

  return (
    <div className="flex flex-col gap-3">
      <OperationalListToolbar
        search={search}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search requests..."
        filterOpen={filterOpen}
        onFilterOpenChange={setFilterOpen}
        activeFilterCount={activeFilterCount}
        canClearFilters={countActive(draft) > 0 || activeFilterCount > 0}
        onClearFilters={clearAll}
        onApplyFilters={applyDraft}
        sortValue="newest"
        sortOptions={[{ value: "newest", label: "Newest" }]}
        filterPanel={
          <>
            <FilterField
              id="req-filter-status"
              label="Status"
              value={draft.status}
              onChange={(value) =>
                setDraft((prev) => ({
                  ...prev,
                  status: value as RequestStatus | "all",
                }))
              }
            >
              <option value="all">All statuses</option>
              {REQUEST_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {REQUEST_STATUS_LABELS[value]}
                </option>
              ))}
            </FilterField>

            <FilterField
              id="req-filter-facility"
              label="Facility"
              value={draft.facilityId}
              onChange={(value) =>
                setDraft((prev) => ({
                  ...prev,
                  facilityId: value as string | "all",
                }))
              }
            >
              <option value="all">All facilities</option>
              {facilities.map((facility) => (
                <option key={facility.id} value={facility.id}>
                  {facility.name}
                </option>
              ))}
            </FilterField>
          </>
        }
      />

      <ActiveFilters chips={chips} onClearAll={clearAll} />

      {!loading && filtered ? (
        <ResultContext
          text={buildResultContext({
            noun: "request",
            nounPlural: "requests",
            total,
            filtered,
            pageSize: REQUESTS_PAGE_SIZE,
          })}
        />
      ) : null}
    </div>
  );
}
