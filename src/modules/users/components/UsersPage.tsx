"use client";

import { Users } from "lucide-react";
import { useEffect, useState } from "react";
import {
  ExploreHeader,
  ModeFrame,
  StreamSurface,
} from "@/components/platform";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/modals/ConfirmDialog";
import { useOperatingAccess } from "@/hooks/useOperatingAccess";
import { ViewWorkOrderModal } from "@/modules/work-orders/components/ViewWorkOrderModal";
import type { WorkOrder } from "@/modules/work-orders/types";
import { WorkOrderService } from "@/services/workOrders/WorkOrderService";
import { DEFAULT_USER_SORT } from "../constants";
import { useUsers } from "../hooks/useUsers";
import type { UserModalState } from "../types";
import { UserFormModal } from "./UserFormModal";
import { UsersTable } from "./UsersTable";
import { UsersToolbar } from "./UsersToolbar";
import { ViewUserModal } from "./ViewUserModal";

export function UsersPage() {
  const { toast } = useToast();
  const { can, loading: accessLoading } = useOperatingAccess();
  const canView = can("users.view");
  const canManage = can("users.manage");
  const {
    users,
    loading,
    error,
    search,
    setSearch,
    status,
    setStatus,
    role,
    setRole,
    facility,
    setFacility,
    roleOptions,
    clearFilters,
    page,
    setPage,
    totalPages,
    total,
    reload,
    deactivateUser,
  } = useUsers();

  const [modal, setModal] = useState<UserModalState>({ type: "closed" });
  const [deactivating, setDeactivating] = useState(false);
  const [viewWorkOrderId, setViewWorkOrderId] = useState<string | null>(null);
  const [viewWorkOrder, setViewWorkOrder] = useState<WorkOrder | null>(null);

  useEffect(() => {
    if (!viewWorkOrderId) {
      setViewWorkOrder(null);
      return;
    }
    let cancelled = false;
    void WorkOrderService.getWorkOrder(viewWorkOrderId)
      .then((row) => {
        if (!cancelled && row) setViewWorkOrder(row);
      })
      .catch(() => {
        /* Keep the seeded work order from the workload snapshot. */
      });
    return () => {
      cancelled = true;
    };
  }, [viewWorkOrderId]);

  async function handleDeactivate() {
    if (modal.type !== "deactivate") return;

    setDeactivating(true);
    try {
      await deactivateUser(modal.user.id);
      toast({
        type: "success",
        title: "User deactivated",
        description: `${modal.user.name} is now inactive.`,
      });
      setModal({ type: "closed" });
      reload();
    } catch (err) {
      toast({
        type: "error",
        title: "Unable to deactivate user",
        description:
          err instanceof Error ? err.message : "Please try again in a moment.",
      });
    } finally {
      setDeactivating(false);
    }
  }

  if (!accessLoading && !canView) {
    return (
      <ModeFrame mode="organise">
        <ExploreHeader
          title="People"
          description="People across the operation — roles, access, and facility relationships."
        />
        <EmptyState
          icon={Users}
          title="Access restricted"
          description="Your role cannot view the People register."
        />
      </ModeFrame>
    );
  }

  return (
    <ModeFrame mode="organise">
      <ExploreHeader
        title="People"
        description="People across the operation — roles, access, and facility relationships."
        territoryNote={`${loading ? "—" : total} people in view`}
      />

      <UsersToolbar
        search={search}
        onSearchChange={setSearch}
        role={role}
        onRoleChange={setRole}
        roleOptions={roleOptions}
        facility={facility}
        onFacilityChange={setFacility}
        status={status}
        onStatusChange={setStatus}
        sort={DEFAULT_USER_SORT}
        onSortChange={() => {}}
        total={total}
        loading={loading}
        onClearAll={clearFilters}
        onCreate={() => setModal({ type: "create" })}
        canCreate={canManage}
      />

      {error ? (
        <EmptyState
          icon={Users}
          title="Couldn’t load users"
          description={error}
          actionLabel="Retry"
          onAction={reload}
        />
      ) : (
        <StreamSurface>
          <UsersTable
            users={users}
            loading={loading}
            page={page}
            totalPages={totalPages}
            total={total}
            onPageChange={setPage}
            onView={(user) => setModal({ type: "view", user })}
            onEdit={(user) => setModal({ type: "edit", user })}
            onDeactivate={(user) => setModal({ type: "deactivate", user })}
            onViewWorkOrder={(workOrder) => {
              setViewWorkOrder(workOrder);
              setViewWorkOrderId(workOrder.id);
            }}
            canManage={canManage}
          />
        </StreamSurface>
      )}

      {canManage ? (
        <UserFormModal
          open={modal.type === "create" || modal.type === "edit"}
          mode={modal.type === "edit" ? "edit" : "create"}
          user={modal.type === "edit" ? modal.user : null}
          onClose={() => setModal({ type: "closed" })}
          onSaved={reload}
        />
      ) : null}

      <ViewUserModal
        open={modal.type === "view"}
        user={modal.type === "view" ? modal.user : null}
        onClose={() => setModal({ type: "closed" })}
        onEdit={
          canManage
            ? (user) => setModal({ type: "edit", user })
            : undefined
        }
      />

      <ViewWorkOrderModal
        open={Boolean(viewWorkOrderId)}
        workOrder={viewWorkOrder}
        onClose={() => {
          setViewWorkOrderId(null);
          setViewWorkOrder(null);
        }}
      />

      <ConfirmDialog
        open={modal.type === "deactivate" && canManage}
        onClose={() => setModal({ type: "closed" })}
        onConfirm={handleDeactivate}
        title="Deactivate user?"
        description={
          modal.type === "deactivate"
            ? `${modal.user.name} will lose access until reactivated. Users are never deleted.`
            : undefined
        }
        confirmLabel="Deactivate"
        danger
        loading={deactivating}
      />
    </ModeFrame>
  );
}
