"use client";

import { Plus, Wrench } from "lucide-react";
import { useState } from "react";
import {
  ModeFrame,
  OperateHeader,
  StreamSurface,
} from "@/components/platform";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/modals/ConfirmDialog";
import { useMaintenance } from "../hooks/useMaintenance";
import type { MaintenanceModalState } from "../types";
import { MaintenanceFormModal } from "./MaintenanceFormModal";
import { MaintenanceTable } from "./MaintenanceTable";
import { MaintenanceToolbar } from "./MaintenanceToolbar";
import { ViewMaintenanceModal } from "./ViewMaintenanceModal";

export function MaintenancePage() {
  const { toast } = useToast();
  const {
    items,
    loading,
    error,
    search,
    setSearch,
    priority,
    setPriority,
    status,
    setStatus,
    type,
    setType,
    facilityId,
    setFacilityId,
    assignedToUserId,
    setAssignedToUserId,
    requiresWorkOrder,
    setRequiresWorkOrder,
    page,
    setPage,
    totalPages,
    total,
    reload,
    deactivateMaintenance,
  } = useMaintenance();

  const [modal, setModal] = useState<MaintenanceModalState>({ type: "closed" });
  const [deactivating, setDeactivating] = useState(false);

  async function handleDeactivate() {
    if (modal.type !== "deactivate") return;

    setDeactivating(true);
    try {
      await deactivateMaintenance(modal.maintenance.id);
      toast({
        type: "success",
        title: "Maintenance deactivated",
        description: `${modal.maintenance.title} is now cancelled.`,
      });
      setModal({ type: "closed" });
      reload();
    } catch (err) {
      toast({
        type: "error",
        title: "Unable to deactivate maintenance",
        description:
          err instanceof Error ? err.message : "Please try again in a moment.",
      });
    } finally {
      setDeactivating(false);
    }
  }

  return (
    <ModeFrame mode="execute">
      <OperateHeader
        title="Maintenance"
        description="Operational flow — requests, assignments, and work moving through your facilities."
        signalValue={loading ? "—" : total}
        signalLabel="In flow"
        actions={
          <Button onClick={() => setModal({ type: "create" })}>
            <Plus className="h-4 w-4" />
            New maintenance
          </Button>
        }
      />

      <MaintenanceToolbar
        search={search}
        onSearchChange={setSearch}
        priority={priority}
        onPriorityChange={setPriority}
        status={status}
        onStatusChange={setStatus}
        type={type}
        onTypeChange={setType}
        facilityId={facilityId}
        onFacilityIdChange={setFacilityId}
        assignedToUserId={assignedToUserId}
        onAssignedToUserIdChange={setAssignedToUserId}
        requiresWorkOrder={requiresWorkOrder}
        onRequiresWorkOrderChange={setRequiresWorkOrder}
      />

      {error ? (
        <EmptyState
          icon={Wrench}
          title="Couldn’t load maintenance"
          description={error}
          actionLabel="Retry"
          onAction={reload}
        />
      ) : (
        <StreamSurface>
          <MaintenanceTable
            items={items}
            loading={loading}
            page={page}
            totalPages={totalPages}
            total={total}
            onPageChange={setPage}
            onView={(row) => setModal({ type: "view", maintenance: row })}
            onEdit={(row) => setModal({ type: "edit", maintenance: row })}
            onDeactivate={(row) =>
              setModal({ type: "deactivate", maintenance: row })
            }
          />
        </StreamSurface>
      )}

      <MaintenanceFormModal
        open={modal.type === "create" || modal.type === "edit"}
        mode={modal.type === "edit" ? "edit" : "create"}
        maintenance={modal.type === "edit" ? modal.maintenance : null}
        onClose={() => setModal({ type: "closed" })}
        onSaved={reload}
      />

      <ViewMaintenanceModal
        open={modal.type === "view"}
        maintenance={modal.type === "view" ? modal.maintenance : null}
        onClose={() => setModal({ type: "closed" })}
        onEdit={(row) => setModal({ type: "edit", maintenance: row })}
      />

      <ConfirmDialog
        open={modal.type === "deactivate"}
        onClose={() => setModal({ type: "closed" })}
        onConfirm={handleDeactivate}
        title="Deactivate maintenance?"
        description={
          modal.type === "deactivate"
            ? `${modal.maintenance.title} will be marked cancelled. Maintenance rows are never deleted.`
            : undefined
        }
        confirmLabel="Deactivate"
        danger
        loading={deactivating}
      />
    </ModeFrame>
  );
}
