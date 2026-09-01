"use client";

import { Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import {
  ModeFrame,
  OperateHeader,
  StreamSurface,
} from "@/components/platform";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/modals/ConfirmDialog";
import { useQueryRecordId } from "@/hooks/useQueryRecordId";
import { ViewWorkOrderModal } from "@/modules/work-orders/components/ViewWorkOrderModal";
import { WorkOrderService } from "@/services/workOrders/WorkOrderService";
import type { WorkOrder } from "@/modules/work-orders/types";
import { useMaintenance } from "../hooks/useMaintenance";
import { displayMaintenanceTitle } from "../utils";
import type { Maintenance, MaintenanceModalState } from "../types";
import { MaintenanceService } from "../services/MaintenanceService";
import { MaintenanceFormModal } from "./MaintenanceFormModal";
import { MaintenanceTable } from "./MaintenanceTable";
import { MaintenanceToolbar } from "./MaintenanceToolbar";
import { ViewMaintenanceModal } from "./ViewMaintenanceModal";

export function MaintenancePage() {
  const { toast } = useToast();
  const openId = useQueryRecordId();
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
    sort,
    setSort,
    clearAll,
    page,
    setPage,
    totalPages,
    total,
    reload,
    reloadFirstPage,
    deactivateMaintenance,
  } = useMaintenance();

  const [modal, setModal] = useState<MaintenanceModalState>({ type: "closed" });
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
        if (!cancelled) setViewWorkOrder(row);
      })
      .catch(() => {
        if (!cancelled) setViewWorkOrder(null);
      });
    return () => {
      cancelled = true;
    };
  }, [viewWorkOrderId]);

  useEffect(() => {
    if (!openId) return;
    let cancelled = false;
    void MaintenanceService.getMaintenance(openId)
      .then((maintenance) => {
        if (!cancelled && maintenance) setModal({ type: "view", maintenance });
      })
      .catch(() => {
        /* leave list as-is if record cannot be loaded */
      });
    return () => {
      cancelled = true;
    };
  }, [openId]);

  async function handleDeactivate() {
    if (modal.type !== "deactivate") return;

    setDeactivating(true);
    try {
      await deactivateMaintenance(modal.maintenance.id);
      toast({
        type: "success",
        title: "Maintenance cancelled",
        description: `${displayMaintenanceTitle(modal.maintenance)} is now cancelled.`,
      });
      setModal({ type: "closed" });
      await reload();
    } catch (err) {
      toast({
        type: "error",
        title: "Unable to cancel maintenance",
        description:
          err instanceof Error ? err.message : "Please try again in a moment.",
      });
    } finally {
      setDeactivating(false);
    }
  }

  function handleMaintenanceUpdated(next: Maintenance) {
    setModal({ type: "view", maintenance: next });
    void reload();
  }

  return (
    <ModeFrame mode="execute">
      <OperateHeader
        title="Maintenance"
        description="Work and treatment activity for Issues — from treatment through completion."
        signalValue={loading ? "—" : total}
        signalLabel="Active work"
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
        sort={sort}
        onSortChange={setSort}
        total={total}
        loading={loading}
        onClearAll={clearAll}
        onCreate={() => setModal({ type: "create" })}
      />

      {error ? (
        <EmptyState
          icon={Wrench}
          title="Couldn’t load maintenance"
          description={error}
          actionLabel="Retry"
          onAction={() => void reload()}
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
        onSaved={async () => {
          await reloadFirstPage();
        }}
      />

      <ViewMaintenanceModal
        open={modal.type === "view"}
        maintenance={modal.type === "view" ? modal.maintenance : null}
        onClose={() => setModal({ type: "closed" })}
        onEdit={(row) => setModal({ type: "edit", maintenance: row })}
        onUpdated={handleMaintenanceUpdated}
        onOpenWorkOrder={(workOrderId) => {
          setViewWorkOrderId(workOrderId);
        }}
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
        open={modal.type === "deactivate"}
        onClose={() => setModal({ type: "closed" })}
        onConfirm={handleDeactivate}
        title="Cancel maintenance?"
        description={
          modal.type === "deactivate"
            ? `${displayMaintenanceTitle(modal.maintenance)} will be marked cancelled. Maintenance rows are never deleted.`
            : undefined
        }
        confirmLabel="Cancel maintenance"
        danger
        loading={deactivating}
      />
    </ModeFrame>
  );
}
