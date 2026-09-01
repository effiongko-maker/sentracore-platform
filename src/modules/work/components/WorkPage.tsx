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
import { MaintenanceFormModal } from "@/modules/maintenance/components/MaintenanceFormModal";
import { MaintenanceService } from "@/modules/maintenance/services/MaintenanceService";
import { displayMaintenanceTitle } from "@/modules/maintenance/utils";
import type { Maintenance } from "@/modules/maintenance/types";
import { useWork } from "../hooks/useWork";
import { WorkDetailModal } from "./WorkDetailModal";
import { WorkTable } from "./WorkTable";
import { WorkToolbar } from "./WorkToolbar";

type WorkModalState =
  | { type: "closed" }
  | { type: "view"; work: Maintenance }
  | { type: "treat"; work: Maintenance }
  | { type: "cancel"; work: Maintenance };

/**
 * Work / WIP operational surface (Phase 16).
 * Backed by Maintenance persistence — no Work sheet.
 */
export function WorkPage() {
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
    facilityId,
    setFacilityId,
    assignedToUserId,
    setAssignedToUserId,
    sort,
    setSort,
    clearAll,
    page,
    setPage,
    totalPages,
    total,
    reload,
    reloadFirstPage,
    cancelWork,
    patchItem,
  } = useWork();

  const [modal, setModal] = useState<WorkModalState>({ type: "closed" });
  const [cancelling, setCancelling] = useState(false);
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
      .then((work) => {
        if (!cancelled && work) setModal({ type: "view", work });
      })
      .catch(() => {
        /* leave list as-is if record cannot be loaded */
      });
    return () => {
      cancelled = true;
    };
  }, [openId]);

  async function handleCancel() {
    if (modal.type !== "cancel") return;

    setCancelling(true);
    try {
      const updated = await cancelWork(modal.work.id);
      toast({
        type: "success",
        title: "Work cancelled",
        description: `${displayMaintenanceTitle(modal.work)} is now cancelled.`,
      });
      if (updated) patchItem(updated);
      setModal({ type: "closed" });
      await reload();
    } catch (err) {
      toast({
        type: "error",
        title: "Unable to cancel work",
        description:
          err instanceof Error ? err.message : "Please try again in a moment.",
      });
    } finally {
      setCancelling(false);
    }
  }

  function handleWorkUpdated(next: Maintenance) {
    patchItem(next);
    setModal({ type: "view", work: next });
  }

  return (
    <ModeFrame mode="execute">
      <OperateHeader
        title="Work"
        description="Work currently being handled across the facility."
      />

      <div className="mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          WIP
        </h2>
        <p className="mt-0.5 text-sm text-muted">
          What we are doing about open Issues — treat, complete, or authorise
          formal execution.
        </p>
      </div>

      <WorkToolbar
        search={search}
        onSearchChange={setSearch}
        priority={priority}
        onPriorityChange={setPriority}
        status={status}
        onStatusChange={setStatus}
        facilityId={facilityId}
        onFacilityIdChange={setFacilityId}
        assignedToUserId={assignedToUserId}
        onAssignedToUserIdChange={setAssignedToUserId}
        sort={sort}
        onSortChange={setSort}
        total={total}
        loading={loading}
        onClearAll={clearAll}
      />

      {error ? (
        <EmptyState
          icon={Wrench}
          title="Couldn’t load work"
          description={error}
          actionLabel="Retry"
          onAction={() => void reload()}
        />
      ) : (
        <StreamSurface>
          <WorkTable
            items={items}
            loading={loading}
            page={page}
            totalPages={totalPages}
            total={total}
            onPageChange={setPage}
            onView={(row) => setModal({ type: "view", work: row })}
            onTreat={(row) => setModal({ type: "treat", work: row })}
            onCancel={(row) => setModal({ type: "cancel", work: row })}
          />
        </StreamSurface>
      )}

      <WorkDetailModal
        open={modal.type === "view"}
        work={modal.type === "view" ? modal.work : null}
        onClose={() => setModal({ type: "closed" })}
        onTreat={(row) => setModal({ type: "treat", work: row })}
        onUpdated={handleWorkUpdated}
        onOpenWorkOrder={(workOrderId) => {
          setViewWorkOrderId(workOrderId);
        }}
      />

      <MaintenanceFormModal
        open={modal.type === "treat"}
        mode="edit"
        maintenance={modal.type === "treat" ? modal.work : null}
        onClose={() => setModal({ type: "closed" })}
        onSaved={async () => {
          await reloadFirstPage();
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
        open={modal.type === "cancel"}
        onClose={() => setModal({ type: "closed" })}
        onConfirm={handleCancel}
        title="Cancel work?"
        description={
          modal.type === "cancel"
            ? `${displayMaintenanceTitle(modal.work)} will be marked cancelled. Records are never deleted.`
            : undefined
        }
        confirmLabel="Cancel work"
        danger
        loading={cancelling}
      />
    </ModeFrame>
  );
}
