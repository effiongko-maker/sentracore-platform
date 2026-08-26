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
import { UserService } from "@/services/users/UserService";
import type { Facility } from "@/modules/facilities/types";
import type { User } from "@/modules/users/types";
import { INCIDENTS_PAGE_SIZE, INCIDENT_SEVERITIES, INCIDENT_STATUSES } from "../constants";
import { labelize } from "../utils";
import type { IncidentSeverity, IncidentStatus } from "../types";

interface IncidentsToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  severity: IncidentSeverity | "all";
  onSeverityChange: (value: IncidentSeverity | "all") => void;
  status: IncidentStatus | "all";
  onStatusChange: (value: IncidentStatus | "all") => void;
  facilityId: string | "all";
  onFacilityIdChange: (value: string | "all") => void;
  assignedToUserId: string | "all";
  onAssignedToUserIdChange: (value: string | "all") => void;
  requiresWorkOrder: boolean | "all";
  onRequiresWorkOrderChange: (value: boolean | "all") => void;
  total: number;
  loading?: boolean;
}

type DraftFilters = {
  severity: IncidentSeverity | "all";
  status: IncidentStatus | "all";
  facilityId: string | "all";
  assignedToUserId: string | "all";
  requiresWorkOrder: boolean | "all";
};

function countActive(filters: DraftFilters): number {
  let count = 0;
  if (filters.severity !== "all") count += 1;
  if (filters.status !== "all") count += 1;
  if (filters.facilityId !== "all") count += 1;
  if (filters.assignedToUserId !== "all") count += 1;
  if (filters.requiresWorkOrder !== "all") count += 1;
  return count;
}

export function IncidentsToolbar({
  search,
  onSearchChange,
  severity,
  onSeverityChange,
  status,
  onStatusChange,
  facilityId,
  onFacilityIdChange,
  assignedToUserId,
  onAssignedToUserIdChange,
  requiresWorkOrder,
  onRequiresWorkOrderChange,
  total,
  loading,
}: IncidentsToolbarProps) {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draft, setDraft] = useState<DraftFilters>({
    severity,
    status,
    facilityId,
    assignedToUserId,
    requiresWorkOrder,
  });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      FacilityService.listFacilities({ page: 1, pageSize: 200 }),
      UserService.listUsersCatalog({ page: 1, pageSize: 200 }),
    ])
      .then(([facilityPage, userPage]) => {
        if (cancelled) return;
        setFacilities(facilityPage.data);
        setUsers(userPage.data);
      })
      .catch(() => {
        if (cancelled) return;
        setFacilities([]);
        setUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (filterOpen) {
      setDraft({
        severity,
        status,
        facilityId,
        assignedToUserId,
        requiresWorkOrder,
      });
    }
  }, [
    filterOpen,
    severity,
    status,
    facilityId,
    assignedToUserId,
    requiresWorkOrder,
  ]);

  const applied: DraftFilters = {
    severity,
    status,
    facilityId,
    assignedToUserId,
    requiresWorkOrder,
  };
  const activeFilterCount = countActive(applied);
  const filtered = activeFilterCount > 0 || Boolean(search.trim());

  const chips: ActiveFilterChip[] = useMemo(() => {
    const next: ActiveFilterChip[] = [];
    if (severity !== "all") {
      next.push({
        id: "severity",
        label: labelize(severity),
        onRemove: () => onSeverityChange("all"),
      });
    }
    if (status !== "all") {
      next.push({
        id: "status",
        label: labelize(status),
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
    if (assignedToUserId !== "all") {
      const user = users.find((item) => item.id === assignedToUserId);
      next.push({
        id: "assignee",
        label: user?.name ?? assignedToUserId,
        onRemove: () => onAssignedToUserIdChange("all"),
      });
    }
    if (requiresWorkOrder !== "all") {
      next.push({
        id: "requiresWO",
        label: requiresWorkOrder
          ? "Requires work order"
          : "No work order required",
        onRemove: () => onRequiresWorkOrderChange("all"),
      });
    }
    return next;
  }, [
    severity,
    status,
    facilityId,
    assignedToUserId,
    requiresWorkOrder,
    facilities,
    users,
    onSeverityChange,
    onStatusChange,
    onFacilityIdChange,
    onAssignedToUserIdChange,
    onRequiresWorkOrderChange,
  ]);

  function clearAll() {
    onSeverityChange("all");
    onStatusChange("all");
    onFacilityIdChange("all");
    onAssignedToUserIdChange("all");
    onRequiresWorkOrderChange("all");
    setDraft({
      severity: "all",
      status: "all",
      facilityId: "all",
      assignedToUserId: "all",
      requiresWorkOrder: "all",
    });
  }

  function applyDraft() {
    onSeverityChange(draft.severity);
    onStatusChange(draft.status);
    onFacilityIdChange(draft.facilityId);
    onAssignedToUserIdChange(draft.assignedToUserId);
    onRequiresWorkOrderChange(draft.requiresWorkOrder);
  }

  return (
    <div className="flex flex-col gap-3">
      <OperationalListToolbar
        search={search}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search incidents..."
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
              id="inc-filter-severity"
              label="Severity"
              value={draft.severity}
              onChange={(value) =>
                setDraft((prev) => ({
                  ...prev,
                  severity: value as IncidentSeverity | "all",
                }))
              }
            >
              <option value="all">All severities</option>
              {INCIDENT_SEVERITIES.map((value) => (
                <option key={value} value={value}>
                  {labelize(value)}
                </option>
              ))}
            </FilterField>

            <FilterField
              id="inc-filter-status"
              label="Status"
              value={draft.status}
              onChange={(value) =>
                setDraft((prev) => ({
                  ...prev,
                  status: value as IncidentStatus | "all",
                }))
              }
            >
              <option value="all">All statuses</option>
              {INCIDENT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {labelize(value)}
                </option>
              ))}
            </FilterField>

            <FilterField
              id="inc-filter-facility"
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

            <FilterField
              id="inc-filter-assignee"
              label="Assigned to"
              value={draft.assignedToUserId}
              onChange={(value) =>
                setDraft((prev) => ({
                  ...prev,
                  assignedToUserId: value as string | "all",
                }))
              }
            >
              <option value="all">All assignees</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </FilterField>

            <FilterField
              id="inc-filter-requires-wo"
              label="Work order"
              value={
                draft.requiresWorkOrder === "all"
                  ? "all"
                  : draft.requiresWorkOrder
                    ? "true"
                    : "false"
              }
              onChange={(value) =>
                setDraft((prev) => ({
                  ...prev,
                  requiresWorkOrder:
                    value === "all" ? "all" : value === "true",
                }))
              }
            >
              <option value="all">Any</option>
              <option value="true">Requires work order</option>
              <option value="false">No work order required</option>
            </FilterField>
          </>
        }
      />

      <ActiveFilters chips={chips} onClearAll={clearAll} />

      {!loading && filtered ? (
        <ResultContext
          text={buildResultContext({
            noun: "incident",
            nounPlural: "incidents",
            total,
            filtered,
            pageSize: INCIDENTS_PAGE_SIZE,
          })}
        />
      ) : null}
    </div>
  );
}
