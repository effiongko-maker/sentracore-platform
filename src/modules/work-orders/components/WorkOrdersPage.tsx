"use client";

import { ClipboardList } from "lucide-react";
import { useState } from "react";
import { ModeFrame, StreamSurface } from "@/components/platform";
import { OperationalPageHeader } from "@/components/operational";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/modals/ConfirmDialog";
import { useWorkOrders } from "../hooks/useWorkOrders";
import type { WorkOrderModalState } from "../types";
import { WorkOrderFormModal } from "./WorkOrderFormModal";
import { WorkOrdersTable } from "./WorkOrdersTable";
import { WorkOrdersToolbar } from "./WorkOrdersToolbar";
import { ViewWorkOrderModal } from "./ViewWorkOrderModal";

export function WorkOrdersPage() {
  const { toast } = useToast();
  const {
    workOrders,
    loading,
    error,
    search,
    setSearch,
    status,
    setStatus,
    priority,
    setPriority,
    facilityId,
    setFacilityId,
    assignedToUserId,
    setAssignedToUserId,
    page,
    setPage,
    totalPages,
    total,
    reload,
    deactivateWorkOrder,
  } = useWorkOrders();

  const [modal, setModal] = useState<WorkOrderModalState>({ type: "closed" });
  const [deactivating, setDeactivating] = useState(false);

  async function handleDeactivate() {
    if (modal.type !== "deactivate") return;

    setDeactivating(true);
    try {
      await deactivateWorkOrder(modal.workOrder.id);
      toast({
        type: "success",
        title: "Work order deactivated",
        description: `${modal.workOrder.title} is now cancelled.`,
      });
      setModal({ type: "closed" });
      reload();
    } catch (err) {
      toast({
        type: "error",
        title: "Unable to deactivate work order",
        description:
          err instanceof Error ? err.message : "Please try again in a moment.",
      });
    } finally {
      setDeactivating(false);
    }
  }

  return (
    <ModeFrame mode="execute">
      <div className="op-page">
        <OperationalPageHeader
          title="Work Orders"
          description="Plan, assign, and track work moving through the organisation."
          countValue={total}
          countLabel="Active"
          actionLabel="New work order"
          onAction={() => setModal({ type: "create" })}
          loading={loading}
        />

        <WorkOrdersToolbar
          search={search}
          onSearchChange={setSearch}
          status={status}
          onStatusChange={setStatus}
          priority={priority}
          onPriorityChange={setPriority}
          facilityId={facilityId}
          onFacilityIdChange={setFacilityId}
          assignedToUserId={assignedToUserId}
          onAssignedToUserIdChange={setAssignedToUserId}
          total={total}
          loading={loading}
        />

        {error ? (
          <EmptyState
            icon={ClipboardList}
            title="Couldn’t load work orders"
            description={error}
            actionLabel="Retry"
            onAction={reload}
          />
        ) : (
          <StreamSurface>
            <WorkOrdersTable
              workOrders={workOrders}
              loading={loading}
              page={page}
              totalPages={totalPages}
              total={total}
              onPageChange={setPage}
              onView={(workOrder) => setModal({ type: "view", workOrder })}
              onEdit={(workOrder) => setModal({ type: "edit", workOrder })}
              onDeactivate={(workOrder) =>
                setModal({ type: "deactivate", workOrder })
              }
            />
          </StreamSurface>
        )}
      </div>

      <WorkOrderFormModal
        open={modal.type === "create" || modal.type === "edit"}
        mode={modal.type === "edit" ? "edit" : "create"}
        workOrder={modal.type === "edit" ? modal.workOrder : null}
        onClose={() => setModal({ type: "closed" })}
        onSaved={reload}
      />

      <ViewWorkOrderModal
        open={modal.type === "view"}
        workOrder={modal.type === "view" ? modal.workOrder : null}
        onClose={() => setModal({ type: "closed" })}
        onEdit={(workOrder) => setModal({ type: "edit", workOrder })}
      />

      <ConfirmDialog
        open={modal.type === "deactivate"}
        onClose={() => setModal({ type: "closed" })}
        onConfirm={handleDeactivate}
        title="Deactivate work order?"
        description={
          modal.type === "deactivate"
            ? `${modal.workOrder.title} will be marked cancelled. Work orders are never deleted.`
            : undefined
        }
        confirmLabel="Deactivate"
        danger
        loading={deactivating}
      />
    </ModeFrame>
  );
}
