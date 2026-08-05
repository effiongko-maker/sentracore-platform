"use client";

import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { SearchBox } from "@/components/ui/SearchBox";
import { toolbarSelectClassName } from "@/components/forms/FormField";
import { FacilityService } from "@/services/facilities/FacilityService";
import { UserService } from "@/services/users/UserService";
import type { Facility } from "@/modules/facilities/types";
import type { User } from "@/modules/users/types";
import {
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_STATUSES,
  MAINTENANCE_TYPES,
} from "../constants";
import { labelize } from "../utils";
import type {
  MaintenancePriority,
  MaintenanceStatus,
  MaintenanceType,
} from "../types";

interface MaintenanceToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  priority: MaintenancePriority | "all";
  onPriorityChange: (value: MaintenancePriority | "all") => void;
  status: MaintenanceStatus | "all";
  onStatusChange: (value: MaintenanceStatus | "all") => void;
  type: MaintenanceType | "all";
  onTypeChange: (value: MaintenanceType | "all") => void;
  facilityId: string | "all";
  onFacilityIdChange: (value: string | "all") => void;
  assignedToUserId: string | "all";
  onAssignedToUserIdChange: (value: string | "all") => void;
  requiresWorkOrder: boolean | "all";
  onRequiresWorkOrderChange: (value: boolean | "all") => void;
}


export function MaintenanceToolbar({
  search,
  onSearchChange,
  priority,
  onPriorityChange,
  status,
  onStatusChange,
  type,
  onTypeChange,
  facilityId,
  onFacilityIdChange,
  assignedToUserId,
  onAssignedToUserIdChange,
  requiresWorkOrder,
  onRequiresWorkOrderChange,
}: MaintenanceToolbarProps) {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      FacilityService.listFacilities({ page: 1, pageSize: 200 }),
      UserService.listUsers({ page: 1, pageSize: 200 }),
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

  return (
    <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <SearchBox
        value={search}
        onChange={onSearchChange}
        placeholder="Search by title, id, description..."
        className="w-full xl:max-w-md"
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-border bg-card px-3 text-sm text-muted">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
        </div>

        <select
          value={priority}
          onChange={(event) =>
            onPriorityChange(event.target.value as MaintenancePriority | "all")
          }
          className={toolbarSelectClassName}
          aria-label="Filter by priority"
        >
          <option value="all">All priorities</option>
          {MAINTENANCE_PRIORITIES.map((value) => (
            <option key={value} value={value}>
              {labelize(value)}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(event) =>
            onStatusChange(event.target.value as MaintenanceStatus | "all")
          }
          className={toolbarSelectClassName}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          {MAINTENANCE_STATUSES.map((value) => (
            <option key={value} value={value}>
              {labelize(value)}
            </option>
          ))}
        </select>

        <select
          value={type}
          onChange={(event) =>
            onTypeChange(event.target.value as MaintenanceType | "all")
          }
          className={toolbarSelectClassName}
          aria-label="Filter by type"
        >
          <option value="all">All types</option>
          {MAINTENANCE_TYPES.map((value) => (
            <option key={value} value={value}>
              {labelize(value)}
            </option>
          ))}
        </select>

        <select
          value={facilityId}
          onChange={(event) =>
            onFacilityIdChange(event.target.value as string | "all")
          }
          className={toolbarSelectClassName}
          aria-label="Filter by facility"
        >
          <option value="all">All facilities</option>
          {facilities.map((facility) => (
            <option key={facility.id} value={facility.id}>
              {facility.name}
            </option>
          ))}
        </select>

        <select
          value={assignedToUserId}
          onChange={(event) =>
            onAssignedToUserIdChange(event.target.value as string | "all")
          }
          className={toolbarSelectClassName}
          aria-label="Filter by assigned user"
        >
          <option value="all">All assignees</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>

        <select
          value={
            requiresWorkOrder === "all"
              ? "all"
              : requiresWorkOrder
                ? "true"
                : "false"
          }
          onChange={(event) => {
            const value = event.target.value;
            onRequiresWorkOrderChange(
              value === "all" ? "all" : value === "true"
            );
          }}
          className={toolbarSelectClassName}
          aria-label="Filter by requires work order"
        >
          <option value="all">WO requirement: all</option>
          <option value="true">Requires work order</option>
          <option value="false">No work order required</option>
        </select>
      </div>
    </div>
  );
}
