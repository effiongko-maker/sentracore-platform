"use client";

import { useEffect, useMemo, useState } from "react";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { USER_STATUS_VARIANT } from "../constants";
import { formatFacilityDisplay, getUserInitials, labelize } from "../utils";
import type { User } from "../types";
import type { WorkOrder } from "@/modules/work-orders/types";
import { UserRowActions } from "./UserRowActions";
import { UserWorkloadDisclosure } from "./UserWorkloadDisclosure";

function statusBadgeVariant(user: User) {
  if (!user.status) return "neutral" as const;
  return USER_STATUS_VARIANT[user.status];
}

function statusLabel(user: User) {
  return user.status ? labelize(user.status) : "Unset";
}

type OpenOverlay =
  | { type: "workload"; userId: string }
  | { type: "actions"; userId: string }
  | null;

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
  onViewWorkOrder: (workOrder: WorkOrder) => void;
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
  onViewWorkOrder,
}: UsersTableProps) {
  const [overlay, setOverlay] = useState<OpenOverlay>(null);

  const rosterKey = `${page}:${users.map((user) => user.id).join(",")}`;

  useEffect(() => {
    setOverlay(null);
  }, [rosterKey]);

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
          <span className="text-foreground">{user.role || "—"}</span>
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
          <span className="text-muted">{formatFacilityDisplay(user.facility)}</span>
        ),
      },
      {
        key: "workload",
        header: "Current Workload",
        render: (user) => (
          <UserWorkloadDisclosure
            user={user}
            open={overlay?.type === "workload" && overlay.userId === user.id}
            onOpenChange={(next) =>
              setOverlay(
                next ? { type: "workload", userId: user.id } : null
              )
            }
            onViewWorkOrder={onViewWorkOrder}
          />
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (user) => (
          <Badge variant={statusBadgeVariant(user)}>
            {statusLabel(user)}
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
            open={overlay?.type === "actions" && overlay.userId === user.id}
            onOpenChange={(next) =>
              setOverlay(next ? { type: "actions", userId: user.id } : null)
            }
            onView={onView}
            onEdit={onEdit}
            onDeactivate={onDeactivate}
          />
        ),
      },
    ],
    [onView, onEdit, onDeactivate, onViewWorkOrder, overlay]
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
      emptyIcon={Users}
      emptyTitle="No users match your filters"
      emptyDescription="Clear search or adjust role, facility, and status filters to find people."
      className="min-w-0"
    />
  );
}
