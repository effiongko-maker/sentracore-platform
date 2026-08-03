"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { USER_STATUS_VARIANT } from "../constants";
import { formatWorkload, getUserInitials, labelize } from "../utils";
import type { User } from "../types";
import { UserRowActions } from "./UserRowActions";

interface UsersTableProps {
  users: User[];
  loading: boolean;
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  onView: (user: User) => void;
  onEdit: (user: User) => void;
  onDeactivate: (user: User) => void;
}

export function UsersTable({
  users,
  loading,
  page,
  totalPages,
  total,
  onPageChange,
  onView,
  onEdit,
  onDeactivate,
}: UsersTableProps) {
  const columns = useMemo<Column<User>[]>(
    () => [
      {
        key: "name",
        header: "Name",
        render: (user) => (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-semibold text-white">
              {getUserInitials(user.name)}
            </div>
            <span className="font-medium text-foreground">{user.name}</span>
          </div>
        ),
      },
      {
        key: "email",
        header: "Email",
        render: (user) => (
          <span className="text-muted">{user.email}</span>
        ),
      },
      {
        key: "phone",
        header: "Phone",
        render: (user) => (
          <span className="text-muted">{user.phone || "—"}</span>
        ),
      },
      {
        key: "role",
        header: "Role",
        render: (user) => (
          <span className="text-foreground">{labelize(user.role)}</span>
        ),
      },
      {
        key: "specialization",
        header: "Specialization",
        render: (user) => (
          <span className="text-muted">{user.specialization}</span>
        ),
      },
      {
        key: "facility",
        header: "Facility",
        render: (user) => (
          <span className="text-muted">{user.facility}</span>
        ),
      },
      {
        key: "workload",
        header: "Current Workload",
        render: (user) => (
          <span className="whitespace-nowrap text-sm text-foreground">
            {formatWorkload(user.activeWorkOrders)}
          </span>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (user) => (
          <Badge variant={USER_STATUS_VARIANT[user.status]}>
            {labelize(user.status)}
          </Badge>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        className: "w-20 text-right",
        render: (user) => (
          <UserRowActions
            user={user}
            onView={onView}
            onEdit={onEdit}
            onDeactivate={onDeactivate}
          />
        ),
      },
    ],
    [onView, onEdit, onDeactivate]
  );

  return (
    <DataTable
      columns={columns}
      data={users}
      rowKey={(user) => user.id}
      loading={loading}
      page={page}
      totalPages={totalPages}
      total={total}
      onPageChange={onPageChange}
      emptyTitle="No users match your filters"
      emptyDescription="Clear search or adjust role, facility, and status filters."
      className="min-w-0"
    />
  );
}
