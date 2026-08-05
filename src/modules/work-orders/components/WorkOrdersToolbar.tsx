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
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_STATUSES,
} from "../constants";
import { labelize } from "../utils";
import type { WorkOrderPriority, WorkOrderStatus } from "../types";

interface WorkOrdersToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  status: WorkOrderStatus | "all";
  onStatusChange: (value: WorkOrderStatus | "all") => void;
  priority: WorkOrderPriority | "all";
  onPriorityChange: (value: WorkOrderPriority | "all") => void;
  facilityId: string | "all";
  onFacilityIdChange: (value: string | "all") => void;
  assignedToUserId: string | "all";
  onAssignedToUserIdChange: (value: string | "all") => void;
}


export function WorkOrdersToolbar({
  search,
  onSearchChange,
  status,
  onStatusChange,
  priority,
  onPriorityChange,
  facilityId,
  onFacilityIdChange,
  assignedToUserId,
  onAssignedToUserIdChange,
}: WorkOrdersToolbarProps) {
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
        placeholder="Search by title, id, instructions..."
        className="w-full xl:max-w-md"
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-border bg-card px-3 text-sm text-muted">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
        </div>

        <select
          value={status}
          onChange={(event) =>
            onStatusChange(event.target.value as WorkOrderStatus | "all")
          }
          className={toolbarSelectClassName}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          {WORK_ORDER_STATUSES.map((value) => (
            <option key={value} value={value}>
              {labelize(value)}
            </option>
          ))}
        </select>

        <select
          value={priority}
          onChange={(event) =>
            onPriorityChange(event.target.value as WorkOrderPriority | "all")
          }
          className={toolbarSelectClassName}
          aria-label="Filter by priority"
        >
          <option value="all">All priorities</option>
          {WORK_ORDER_PRIORITIES.map((value) => (
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
          aria-label="Filter by assigned technician"
        >
          <option value="all">All technicians</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
