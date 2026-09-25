"use client";

import { ClipboardList } from "lucide-react";
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
import { useOperatingAccess } from "@/hooks/useOperatingAccess";
import { cn } from "@/lib/utils";
import { WorkOrderService } from "@/services/workOrders/WorkOrderService";
import {
  WORK_ORDER_ORDER_TYPE_SCOPE_OPTIONS,
  type WorkOrderOrderTypeScope,
} from "../constants";
import { useWorkOrders } from "../hooks/useWorkOrders";
import type { WorkOrderModalState } from "../types";
import { WorkOrderFormModal } from "./WorkOrderFormModal";
import { WorkOrderSubmissionFormModal } from "./WorkOrderSubmissionFormModal";
import { CommercialFollowUpModal } from "@/components/commercial/CommercialFollowUpModal";
import { FM_2025_HISTORY_NOTE } from "@/lib/fm/sourceRegisterScope";
import type { WorkOrder, WorkOrderOrderType } from "../types";
import { WorkOrdersTable } from "./WorkOrdersTable";
import { WorkOrdersToolbar } from "./WorkOrdersToolbar";
import { ViewWorkOrderModal } from "./ViewWorkOrderModal";

export function WorkOrdersPage() {
  const { toast } = useToast();
  const { can } = useOperatingAccess();
  const canCreateOps = can("ops.create");
  const canMutateOps = can("ops.edit");
  const openId = useQueryRecordId();
  const {
    workOrders,
    loading,
    error,
    search,
    setSearch,
    orderTypeScope,
    setOrderTypeScope,
    status,
    setStatus,
    priority,
    setPriority,
    facilityId,
    setFacilityId,
    assetId,
    setAssetId,
    assignedToUserId,
    setAssignedToUserId,
    dueDate,
    setDueDate,
    maintenanceId,
    setMaintenanceId,
    sort,
    setSort,
    includeHistory,
    setIncludeHistory,
    clearAll,
    page,
    setPage,
    totalPages,
    total,
    reload,
    reloadFirstPage,
    deactivateWorkOrder,
  } = useWorkOrders();

  const [modal, setModal] = useState<WorkOrderModalState>({ type: "closed" });
  const [deactivating, setDeactivating] = useState(false);
  // WO/JO are commercial submission packages: created directly from their own tab (no Issue or Work required).
  const [submissionForm, setSubmissionForm] = useState<
    | { mode: "create"; orderType: WorkOrderOrderType }
    | { mode: "edit"; workOrder: WorkOrder }
    | null
  >(null);
  const [followUpFor, setFollowUpFor] = useState<WorkOrder | null>(null);
  const [followUpsVersion, setFollowUpsVersion] = useState(0);

  // The All tab keeps its existing behaviour (no create); the Work Orders / Job Orders tabs create their own type.
  const createAction =
    orderTypeScope === "work_order"
      ? { label: "New Work Order", orderType: "work_order" as const }
      : orderTypeScope === "job_order"
        ? { label: "New Job Order", orderType: "job_order" as const }
        : null;
  const isHistorical = (workOrder: WorkOrder) => workOrder.recordOrigin === "migrated_historical";
  // Legacy Work-linked WO/JO keep the operational form; commercial submissions edit as submissions.
  const openEdit = (workOrder: WorkOrder) =>
    workOrder.maintenanceId ? setModal({ type: "edit", workOrder }) : setSubmissionForm({ mode: "edit", workOrder });

  useEffect(() => {
    if (!openId) return;
    let cancelled = false;
    void WorkOrderService.getWorkOrder(openId)
      .then((workOrder) => {
        if (!cancelled && workOrder) setModal({ type: "view", workOrder });
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
      await deactivateWorkOrder(modal.workOrder.id);
      toast({
        type: "success",
        title: "Work order cancelled",
        description: `${modal.workOrder.title} is now cancelled.`,
      });
      setModal({ type: "closed" });
      await reload();
    } catch (err) {
      toast({
        type: "error",
        title: "Unable to cancel work order",
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
        title="Work Orders"
        description="Plan, assign, and track Work Orders and Job Orders."
        signalValue={loading ? "—" : total}
        signalLabel="In view"
      />

      <div
        className="mb-3 flex gap-1 border-b border-border/70"
        role="tablist"
        aria-label="Order Type"
      >
        {WORK_ORDER_ORDER_TYPE_SCOPE_OPTIONS.map((option) => {
          const selected = orderTypeScope === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={selected}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                selected
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-foreground"
              )}
              onClick={() =>
                setOrderTypeScope(option.value as WorkOrderOrderTypeScope)
              }
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <label className="mb-3 inline-flex items-center gap-2 text-sm text-muted" title={FM_2025_HISTORY_NOTE}>
        <input type="checkbox" checked={includeHistory} onChange={(event) => setIncludeHistory(event.target.checked)} />
        Include 2025 history
      </label>

      <WorkOrdersToolbar
        search={search}
        onSearchChange={setSearch}
        orderTypeScope={orderTypeScope}
        status={status}
        onStatusChange={setStatus}
        priority={priority}
        onPriorityChange={setPriority}
        facilityId={facilityId}
        onFacilityIdChange={setFacilityId}
        assetId={assetId}
        onAssetIdChange={setAssetId}
        assignedToUserId={assignedToUserId}
        onAssignedToUserIdChange={setAssignedToUserId}
        dueDate={dueDate}
        onDueDateChange={setDueDate}
        maintenanceId={maintenanceId}
        onMaintenanceIdChange={setMaintenanceId}
        sort={sort}
        onSortChange={setSort}
        total={total}
        loading={loading}
        onClearAll={clearAll}
        onCreate={
          createAction
            ? () => setSubmissionForm({ mode: "create", orderType: createAction.orderType })
            : undefined
        }
        createLabel={createAction?.label}
        canCreate={Boolean(canCreateOps && createAction)}
      />

      {error ? (
        <EmptyState
          icon={ClipboardList}
          title="Couldn’t load work orders"
          description={error}
          actionLabel="Retry"
          onAction={() => void reload()}
        />
      ) : (
        <StreamSurface>
          <WorkOrdersTable
            workOrders={workOrders}
            loading={loading}
            orderTypeScope={orderTypeScope}
            page={page}
            totalPages={totalPages}
            total={total}
            onPageChange={setPage}
            onView={(workOrder) => setModal({ type: "view", workOrder })}
            onEdit={openEdit}
            onDeactivate={(workOrder) =>
              setModal({ type: "deactivate", workOrder })
            }
            canMutate={canMutateOps}
          />
        </StreamSurface>
      )}

      <WorkOrderFormModal
        open={modal.type === "create" || modal.type === "edit"}
        mode={modal.type === "edit" ? "edit" : "create"}
        workOrder={modal.type === "edit" ? modal.workOrder : null}
        initialOrderType={
          modal.type === "create" ? modal.initialOrderType : null
        }
        onClose={() => setModal({ type: "closed" })}
        onSaved={async () => {
          await reloadFirstPage();
        }}
      />

      <ViewWorkOrderModal
        open={modal.type === "view"}
        workOrder={modal.type === "view" ? modal.workOrder : null}
        onClose={() => setModal({ type: "closed" })}
        onEdit={
          canMutateOps && !(modal.type === "view" && isHistorical(modal.workOrder))
            ? (workOrder) => setModal({ type: "edit", workOrder })
            : undefined
        }
        onEditSubmission={
          canMutateOps && !(modal.type === "view" && isHistorical(modal.workOrder))
            ? (workOrder) => setSubmissionForm({ mode: "edit", workOrder })
            : undefined
        }
        onRecordFollowUp={
          canMutateOps && !(modal.type === "view" && isHistorical(modal.workOrder))
            ? (workOrder) => setFollowUpFor(workOrder)
            : undefined
        }
        followUpsVersion={followUpsVersion}
      />

      <WorkOrderSubmissionFormModal
        open={submissionForm !== null}
        mode={submissionForm?.mode ?? "create"}
        workOrder={submissionForm?.mode === "edit" ? submissionForm.workOrder : null}
        initialOrderType={submissionForm?.mode === "create" ? submissionForm.orderType : null}
        onClose={() => setSubmissionForm(null)}
        onSaved={async () => {
          await reloadFirstPage();
        }}
      />

      <CommercialFollowUpModal
        open={followUpFor !== null}
        reference={followUpFor?.id ?? ""}
        onClose={() => setFollowUpFor(null)}
        onSave={async (draft) => {
          if (!followUpFor) return;
          const updated = await WorkOrderService.recordFollowUp(followUpFor.id, draft);
          setFollowUpsVersion((v) => v + 1);
          if (modal.type === "view" && modal.workOrder.id === updated.id) setModal({ type: "view", workOrder: updated });
          await reload();
        }}
      />

      <ConfirmDialog
        open={modal.type === "deactivate"}
        onClose={() => setModal({ type: "closed" })}
        onConfirm={handleDeactivate}
        title="Cancel work order?"
        description={
          modal.type === "deactivate"
            ? `${modal.workOrder.title} will be marked cancelled. Work orders are never deleted.`
            : undefined
        }
        confirmLabel="Cancel work order"
        danger
        loading={deactivating}
      />
    </ModeFrame>
  );
}
