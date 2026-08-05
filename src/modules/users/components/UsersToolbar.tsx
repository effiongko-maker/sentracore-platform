"use client";

import { SlidersHorizontal } from "lucide-react";
import { SearchBox } from "@/components/ui/SearchBox";
import { toolbarSelectClassName } from "@/components/forms/FormField";
import { useFacilityOptions } from "@/hooks/useFacilityOptions";
import { USER_ROLES, USER_STATUSES } from "../constants";
import { labelize } from "../utils";
import type { UserRole, UserStatus } from "../types";

interface UsersToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  role: UserRole | "all";
  onRoleChange: (value: UserRole | "all") => void;
  facility: string | "all";
  onFacilityChange: (value: string | "all") => void;
  status: UserStatus | "all";
  onStatusChange: (value: UserStatus | "all") => void;
}

export function UsersToolbar({
  search,
  onSearchChange,
  role,
  onRoleChange,
  facility,
  onFacilityChange,
  status,
  onStatusChange,
}: UsersToolbarProps) {
  const { facilities } = useFacilityOptions();

  return (
    <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <SearchBox
        value={search}
        onChange={onSearchChange}
        placeholder="Search by name, email, phone, specialization..."
        className="w-full xl:max-w-md"
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-border bg-card px-3 text-sm text-muted">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
        </div>

        <select
          value={role}
          onChange={(event) =>
            onRoleChange(event.target.value as UserRole | "all")
          }
          className={toolbarSelectClassName}
          aria-label="Filter by role"
        >
          <option value="all">All roles</option>
          {USER_ROLES.map((value) => (
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
            onStatusChange(event.target.value as UserStatus | "all")
          }
          className={toolbarSelectClassName}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          {USER_STATUSES.map((value) => (
            <option key={value} value={value}>
              {labelize(value)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
