"use client";

import { Modal } from "@/components/modals/Modal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDate, formatRelativeTime } from "@/lib/utils";
import { USER_STATUS_VARIANT } from "../constants";
import { formatFacilityDisplay, formatWorkload, getUserInitials, labelize } from "../utils";
import type { User } from "../types";

interface ViewUserModalProps {
  open: boolean;
  user: User | null;
  onClose: () => void;
  onEdit?: (user: User) => void;
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">
        {label}
      </p>
      <div className="text-sm text-foreground">{value || "—"}</div>
    </div>
  );
}

export function ViewUserModal({
  open,
  user,
  onClose,
  onEdit,
}: ViewUserModalProps) {
  if (!user) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={user.name}
      description={user.email}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {onEdit ? (
            <Button
              onClick={() => {
                onClose();
                onEdit(user);
              }}
            >
              Edit user
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex items-start gap-4 border-b border-border/70 pb-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-white">
          {getUserInitials(user.name)}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold text-primary">{user.name}</p>
            <Badge variant={user.status ? USER_STATUS_VARIANT[user.status] : "neutral"}>
              {user.status ? labelize(user.status) : "Unset"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted">
            {user.role || "—"} · {user.specialization || "—"}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Detail label="Email" value={user.email} />
        <Detail label="Phone" value={user.phone} />
        <Detail label="Role" value={user.role} />
        <Detail label="Specialization" value={user.specialization} />
        <Detail label="Facility" value={formatFacilityDisplay(user.facility)} />
        <Detail
          label="Current Workload"
          value={formatWorkload(user.activeWorkOrders)}
        />
        <Detail
          label="Status"
          value={
            <Badge variant={user.status ? USER_STATUS_VARIANT[user.status] : "neutral"}>
              {user.status ? labelize(user.status) : "Unset"}
            </Badge>
          }
        />
        <Detail
          label="Last active"
          value={formatRelativeTime(user.lastActive)}
        />
        <Detail label="Joined" value={formatDate(user.createdAt)} />
      </div>
    </Modal>
  );
}
