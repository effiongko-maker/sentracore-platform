"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/modals/Modal";
import { Button } from "@/components/ui/Button";
import {
  FormField,
  inputClassName,
  selectClassName,
} from "@/components/forms/FormField";
import { useToast } from "@/components/ui/Toast";
import { MasterDataSelect } from "@/components/forms/MasterDataSelect";
import { FacilityService } from "@/services/facilities/FacilityService";
import { AssetService } from "@/services/assets/AssetService";
import { UserService } from "@/services/users/UserService";
import { WorkOrderService } from "@/services/workOrders/WorkOrderService";
import type { Facility } from "@/modules/facilities/types";
import type { Asset } from "@/modules/assets/types";
import type { User } from "@/modules/users/types";
import type { WorkOrder } from "@/modules/work-orders/types";
import {
  MAINTENANCE_ACTIVE_WORKFLOW_STATUSES,
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_SOURCES,
  MAINTENANCE_TYPES,
} from "../constants";
import { requestMaintenance } from "../actions/requestMaintenance";
import { updateMaintenanceOperational } from "@/lib/operational/lifecycle/updateActions";
import {
  normalizeMaintenanceRelationships,
  unlinkWorkOrderFromMaintenance,
} from "@/lib/operational/relationships";
import { MaintenanceService } from "@/services/maintenance/MaintenanceService";
import { createWorkOrderFromMaintenance } from "@/modules/work-orders/actions/createWorkOrderFromMaintenance";
import {
  applyWorkOrderRule,
  displayMaintenanceTitle,
  labelize,
  optionalString,
  toCreateFormValues,
} from "../utils";
import type {
  CreateMaintenanceInput,
  Maintenance,
  MaintenancePriority,
  MaintenanceSource,
  MaintenanceStatus,
  MaintenanceType,
} from "../types";

interface MaintenanceFormModalProps {
  open: boolean;
  mode: "create" | "edit";
  maintenance?: Maintenance | null;
  onClose: () => void;
  onSaved?: () => void;
}

function toIsoOrUndefined(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return new Date(trimmed).toISOString();
}

export function MaintenanceFormModal({
  open,
  mode,
  maintenance,
  onClose,
  onSaved,
}: MaintenanceFormModalProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<CreateMaintenanceInput>(toCreateFormValues());
  const [errors, setErrors] = useState<
    Partial<Record<keyof CreateMaintenanceInput, string>>
  >({});
  const [saving, setSaving] = useState(false);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [creatingWorkOrder, setCreatingWorkOrder] = useState(false);
  const [linkMode, setLinkMode] = useState<"choose" | "link">("choose");
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(toCreateFormValues(mode === "edit" ? maintenance : null));
    setErrors({});
    setCompleting(false);
    setLinkMode(
      mode === "edit" && maintenance?.workOrderId ? "link" : "choose"
    );
  }, [open, mode, maintenance]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([
      FacilityService.listFacilities({ page: 1, pageSize: 200 }),
      AssetService.listAssetsCatalog({ page: 1, pageSize: 200 }),
      UserService.listUsersCatalog({ page: 1, pageSize: 200 }),
      WorkOrderService.listWorkOrders({ page: 1, pageSize: 200 }),
    ])
      .then(([facilityPage, assetPage, userPage, workOrderPage]) => {
        if (cancelled) return;
        setFacilities(facilityPage.data);
        setAssets(assetPage.data);
        setUsers(userPage.data);
        setWorkOrders(workOrderPage.data);
      })
      .catch(() => {
        if (cancelled) return;
        setFacilities([]);
        setAssets([]);
        setUsers([]);
        setWorkOrders([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const facilityName = facilities.find((f) => f.id === form.facilityId)?.name;
  const filteredAssets = form.facilityId
    ? assets.filter(
        (asset) =>
          asset.facility === form.facilityId ||
          (facilityName != null && asset.facility === facilityName)
      )
    : assets;

  function updateField<K extends keyof CreateMaintenanceInput>(
    key: K,
    value: CreateMaintenanceInput[K]
  ) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "requiresWorkOrder" && value === false) {
        next.workOrderId = "";
      }
      return next;
    });
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validate() {
    const next: Partial<Record<keyof CreateMaintenanceInput, string>> = {};
    if (!form.title.trim()) next.title = "Title is required";
    if (!form.facilityId.trim()) next.facilityId = "Facility is required";
    if (!form.reportedAt) next.reportedAt = "Reported at is required";
    if (form.requiresWorkOrder === false && form.workOrderId) {
      next.workOrderId =
        "Work order must be empty when requires work order is false";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  const isEdit = mode === "edit";
  const recordStatus =
    isEdit && maintenance ? maintenance.status : form.status;
  const isCompleted = recordStatus === "completed";
  const isCancelled = recordStatus === "cancelled";
  const isTerminalLifecycle = isCompleted || isCancelled;
  const busy = saving || completing;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    if (isCancelled) return;

    setSaving(true);
    const submitStarted = performance.now();
    const mark = (label: string, since = submitStarted) => {
      console.info(`[mnt.write.timing] ${label}`, {
        ms: Math.round(performance.now() - since),
      });
      return performance.now();
    };
    try {
      const description =
        optionalString(form.description) || form.title.trim();
      const payload = applyWorkOrderRule({
        ...form,
        title: form.title.trim(),
        description,
        categoryId: optionalString(form.categoryId),
        department: optionalString(form.department),
        facilityId: form.facilityId.trim(),
        assetId: optionalString(form.assetId),
        reportedByUserId: optionalString(form.reportedByUserId),
        assignedToUserId: optionalString(form.assignedToUserId),
        assignedGroupId: optionalString(form.assignedGroupId),
        eventId: optionalString(form.eventId),
        incidentId: optionalString(form.incidentId),
        workOrderId: optionalString(form.workOrderId),
        parentMaintenanceId: optionalString(form.parentMaintenanceId),
        reportedAt: new Date(form.reportedAt).toISOString(),
        scheduledStartAt: toIsoOrUndefined(form.scheduledStartAt),
        scheduledEndAt: toIsoOrUndefined(form.scheduledEndAt),
        dueAt: toIsoOrUndefined(form.dueAt),
        startedAt: toIsoOrUndefined(form.startedAt),
        holdReason: optionalString(form.holdReason),
        workPerformed: optionalString(form.workPerformed),
        createdByUserId: optionalString(form.createdByUserId),
        updatedByUserId: optionalString(form.updatedByUserId),
        ...(isCompleted
          ? {
              status: "completed" as const,
              completedAt:
                toIsoOrUndefined(form.completedAt) ||
                maintenance?.completedAt ||
                undefined,
              completionNotes:
                optionalString(form.completionNotes) ||
                maintenance?.completionNotes ||
                "",
            }
          : {
              status: form.status,
              completedAt: "",
              completionNotes: "",
            }),
      });

      if (mode === "edit" && maintenance) {
        const result = await updateMaintenanceOperational(
          maintenance.id,
          payload
        );
        const afterUpdate = mark("updateMaintenanceOperational");
        if (!result.success) {
          throw new Error(result.error.message);
        }

        const previousWorkOrderId = optionalString(maintenance.workOrderId);
        const nextWorkOrderId = optionalString(payload.workOrderId);

        // Keep WO ↔ maintenance bidirectional when linking / unlinking / switching.
        if (previousWorkOrderId && previousWorkOrderId !== nextWorkOrderId) {
          try {
            const previous = await WorkOrderService.getWorkOrder(
              previousWorkOrderId
            );
            if (previous?.maintenanceId === maintenance.id) {
              await WorkOrderService.updateWorkOrder(previousWorkOrderId, {
                maintenanceId: "",
              });
            }
          } catch {
            // Non-blocking
          }
        }

        if (nextWorkOrderId) {
          try {
            const linked = await WorkOrderService.getWorkOrder(nextWorkOrderId);
            if (linked && linked.maintenanceId !== maintenance.id) {
              const priorMaintenanceId = optionalString(linked.maintenanceId);
              if (priorMaintenanceId && priorMaintenanceId !== maintenance.id) {
                try {
                  const prior =
                    await MaintenanceService.getMaintenance(priorMaintenanceId);
                  if (prior) {
                    const rel = unlinkWorkOrderFromMaintenance(
                      normalizeMaintenanceRelationships(prior),
                      nextWorkOrderId
                    );
                    await MaintenanceService.updateMaintenance(
                      priorMaintenanceId,
                      {
                        workOrderIds: rel.workOrderIds,
                        workOrderId: rel.workOrderId,
                        requiresWorkOrder: (rel.workOrderIds?.length ?? 0) > 0,
                      }
                    );
                  }
                } catch {
                  // Non-blocking
                }
              }
              await WorkOrderService.updateWorkOrder(nextWorkOrderId, {
                maintenanceId: maintenance.id,
              });
            }
          } catch {
            // Non-blocking — maintenance side already holds the relationship.
          }
        }
        mark("relationshipSideEffects", afterUpdate);

        toast({
          type: "success",
          title: "Maintenance updated",
          description: `${payload.title} has been saved.`,
        });
      } else {
        const result = await requestMaintenance({
          ...payload,
          status: form.status,
          completedAt: undefined,
          completionNotes: undefined,
        });
        mark("requestMaintenance");
        if (!result.success) {
          throw new Error(result.error.message);
        }

        if (payload.workOrderId && result.data.id) {
          try {
            await WorkOrderService.updateWorkOrder(payload.workOrderId, {
              maintenanceId: result.data.id,
            });
          } catch {
            // Non-blocking
          }
        }

        toast({
          type: "success",
          title: "Maintenance created",
          description: `${result.data.title} has been logged.`,
        });
      }

      const beforeSaved = performance.now();
      onSaved?.();
      mark("onSaved(listRefetch)", beforeSaved);
      onClose();
      mark("total.submit→uiComplete");
    } catch (err) {
      mark("failed");
      toast({
        type: "error",
        title:
          mode === "edit"
            ? "Unable to update maintenance"
            : "Unable to create maintenance",
        description:
          err instanceof Error ? err.message : "Please try again in a moment.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkCompleted() {
    if (!isEdit || !maintenance || isTerminalLifecycle) return;

    const nextErrors: Partial<Record<keyof CreateMaintenanceInput, string>> =
      {};
    if (!form.title.trim()) nextErrors.title = "Title is required";
    if (!form.facilityId.trim()) nextErrors.facilityId = "Facility is required";
    if (!form.reportedAt) nextErrors.reportedAt = "Reported at is required";
    if (!form.completedAt?.trim()) {
      nextErrors.completedAt = "Completed at is required";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const completedAtIso = toIsoOrUndefined(form.completedAt);
    if (!completedAtIso) {
      setErrors((current) => ({
        ...current,
        completedAt: "Enter a valid completion date and time",
      }));
      return;
    }

    setCompleting(true);
    try {
      const description =
        optionalString(form.description) || form.title.trim();
      const payload = applyWorkOrderRule({
        ...form,
        title: form.title.trim(),
        description,
        categoryId: optionalString(form.categoryId),
        department: optionalString(form.department),
        facilityId: form.facilityId.trim(),
        assetId: optionalString(form.assetId),
        reportedByUserId: optionalString(form.reportedByUserId),
        assignedToUserId: optionalString(form.assignedToUserId),
        assignedGroupId: optionalString(form.assignedGroupId),
        eventId: optionalString(form.eventId),
        incidentId: optionalString(form.incidentId),
        workOrderId: optionalString(form.workOrderId),
        parentMaintenanceId: optionalString(form.parentMaintenanceId),
        reportedAt: new Date(form.reportedAt).toISOString(),
        scheduledStartAt: toIsoOrUndefined(form.scheduledStartAt),
        scheduledEndAt: toIsoOrUndefined(form.scheduledEndAt),
        dueAt: toIsoOrUndefined(form.dueAt),
        startedAt: toIsoOrUndefined(form.startedAt),
        holdReason: optionalString(form.holdReason),
        workPerformed: optionalString(form.workPerformed),
        createdByUserId: optionalString(form.createdByUserId),
        updatedByUserId: optionalString(form.updatedByUserId),
        status: "completed" as MaintenanceStatus,
        completedAt: completedAtIso,
        completionNotes: optionalString(form.completionNotes) ?? "",
      }) as CreateMaintenanceInput;

      const result = await updateMaintenanceOperational(maintenance.id, payload);
      if (!result.success) {
        throw new Error(result.error.message);
      }

      toast({
        type: "success",
        title: "Maintenance completed",
        description: `${displayMaintenanceTitle(result.data)} marked as completed.`,
      });
      onSaved?.();
      onClose();
    } catch (err) {
      toast({
        type: "error",
        title: "Unable to complete maintenance",
        description:
          err instanceof Error ? err.message : "Please try again in a moment.",
      });
    } finally {
      setCompleting(false);
    }
  }

  async function handleCreateWorkOrder() {
    if (mode !== "edit" || !maintenance?.id) {
      toast({
        type: "info",
        title: "Save maintenance first",
        description:
          "Create the maintenance record, then you can generate a work order from it.",
      });
      return;
    }
    if (isTerminalLifecycle) {
      toast({
        type: "info",
        title: "Maintenance is closed",
        description:
          "Work orders cannot be created from completed or cancelled maintenance.",
      });
      return;
    }

    setCreatingWorkOrder(true);
    try {
      // Persist current form so requiresWorkOrder / context are current.
      if (!validate()) return;
      const description =
        optionalString(form.description) || form.title.trim();
      const payload = applyWorkOrderRule({
        ...form,
        title: form.title.trim(),
        description,
        categoryId: optionalString(form.categoryId),
        department: optionalString(form.department),
        facilityId: form.facilityId.trim(),
        assetId: optionalString(form.assetId),
        reportedByUserId: optionalString(form.reportedByUserId),
        assignedToUserId: optionalString(form.assignedToUserId),
        assignedGroupId: optionalString(form.assignedGroupId),
        eventId: optionalString(form.eventId),
        incidentId: optionalString(form.incidentId),
        workOrderId: optionalString(form.workOrderId),
        parentMaintenanceId: optionalString(form.parentMaintenanceId),
        requiresWorkOrder: true,
        reportedAt: new Date(form.reportedAt).toISOString(),
        scheduledStartAt: toIsoOrUndefined(form.scheduledStartAt),
        scheduledEndAt: toIsoOrUndefined(form.scheduledEndAt),
        dueAt: toIsoOrUndefined(form.dueAt),
        startedAt: toIsoOrUndefined(form.startedAt),
        holdReason: optionalString(form.holdReason),
        workPerformed: optionalString(form.workPerformed),
        createdByUserId: optionalString(form.createdByUserId),
        updatedByUserId: optionalString(form.updatedByUserId),
        status: form.status,
        completedAt: "",
        completionNotes: "",
      });

      const saveResult = await updateMaintenanceOperational(
        maintenance.id,
        payload
      );
      if (!saveResult.success) {
        throw new Error(saveResult.error.message);
      }

      const result = await createWorkOrderFromMaintenance(maintenance.id);
      if (!result.success) {
        throw new Error(result.error.message);
      }

      const created = result.data.workOrder;
      updateField("workOrderId", created.id);
      updateField("requiresWorkOrder", true);
      setWorkOrders((current) => {
        if (current.some((row) => row.id === created.id)) return current;
        return [created, ...current];
      });
      setLinkMode("link");
      toast({
        type: "success",
        title: "Work order created",
        description: `${created.id} linked to ${displayMaintenanceTitle(result.data.maintenance)}.`,
      });
      onSaved?.();
    } catch (err) {
      toast({
        type: "error",
        title: "Unable to create work order",
        description:
          err instanceof Error ? err.message : "Please try again in a moment.",
      });
    } finally {
      setCreatingWorkOrder(false);
    }
  }

  const requiresWo = Boolean(form.requiresWorkOrder);
  const linkedWorkOrderId = optionalString(form.workOrderId);
  const linkedWorkOrder = linkedWorkOrderId
    ? workOrders.find((row) => row.id === linkedWorkOrderId)
    : undefined;
  const needsWorkOrderLink = requiresWo && !linkedWorkOrderId;

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={isEdit ? "Treat maintenance" : "New maintenance"}
      description={
        isEdit
          ? isCompleted
            ? "This maintenance is completed. Completion details are read-only."
            : isCancelled
              ? "This maintenance is cancelled."
              : "Update treatment details and workflow status. Complete the work using the section below."
          : "Direct operational entry — create a maintenance record for authorized users."
      }
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Close
          </Button>
          {!isCancelled ? (
            <Button
              type="submit"
              form="maintenance-form"
              loading={saving}
              disabled={busy}
            >
              {isEdit ? "Save changes" : "Create maintenance"}
            </Button>
          ) : null}
        </>
      }
    >
      <form
        id="maintenance-form"
        onSubmit={handleSubmit}
        className="grid gap-4 sm:grid-cols-2"
      >
        <FormField
          label="Title"
          htmlFor="mnt-title"
          required
          error={errors.title}
          className="sm:col-span-2"
        >
          <input
            id="mnt-title"
            className={inputClassName}
            placeholder="e.g. AHU filter replacement — Plant West"
            value={form.title}
            onChange={(event) => updateField("title", event.target.value)}
          />
        </FormField>

        <FormField label="Type" htmlFor="mnt-type" required>
          <select
            id="mnt-type"
            className={selectClassName}
            value={form.type}
            onChange={(event) =>
              updateField("type", event.target.value as MaintenanceType)
            }
          >
            {MAINTENANCE_TYPES.map((value) => (
              <option key={value} value={value}>
                {labelize(value)}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Source" htmlFor="mnt-source" required>
          <select
            id="mnt-source"
            className={selectClassName}
            value={form.source}
            onChange={(event) =>
              updateField("source", event.target.value as MaintenanceSource)
            }
          >
            {MAINTENANCE_SOURCES.map((value) => (
              <option key={value} value={value}>
                {labelize(value)}
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          label="Facility"
          htmlFor="mnt-facility"
          required
          error={errors.facilityId}
        >
          <select
            id="mnt-facility"
            className={selectClassName}
            value={form.facilityId}
            onChange={(event) => {
              updateField("facilityId", event.target.value);
              updateField("assetId", "");
            }}
          >
            <option value="">Select facility</option>
            {facilities.map((facility) => (
              <option key={facility.id} value={facility.id}>
                {facility.name}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Asset" htmlFor="mnt-asset">
          <select
            id="mnt-asset"
            className={selectClassName}
            value={form.assetId ?? ""}
            onChange={(event) => updateField("assetId", event.target.value)}
          >
            <option value="">None</option>
            {filteredAssets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Priority" htmlFor="mnt-priority" required>
          <select
            id="mnt-priority"
            className={selectClassName}
            value={form.priority}
            onChange={(event) =>
              updateField(
                "priority",
                event.target.value as MaintenancePriority
              )
            }
          >
            {MAINTENANCE_PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {labelize(value)}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Status" htmlFor="mnt-status" required>
          {isTerminalLifecycle ? (
            <input
              id="mnt-status"
              className={inputClassName}
              value={labelize(recordStatus)}
              readOnly
              disabled
            />
          ) : (
            <select
              id="mnt-status"
              className={selectClassName}
              value={
                MAINTENANCE_ACTIVE_WORKFLOW_STATUSES.includes(form.status)
                  ? form.status
                  : "requested"
              }
              onChange={(event) =>
                updateField("status", event.target.value as MaintenanceStatus)
              }
            >
              {MAINTENANCE_ACTIVE_WORKFLOW_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {labelize(value)}
                </option>
              ))}
            </select>
          )}
        </FormField>

        <FormField label="Assigned to" htmlFor="mnt-assignee">
          <select
            id="mnt-assignee"
            className={selectClassName}
            value={form.assignedToUserId ?? ""}
            onChange={(event) =>
              updateField("assignedToUserId", event.target.value)
            }
          >
            <option value="">Unassigned</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Reported by" htmlFor="mnt-reporter">
          <select
            id="mnt-reporter"
            className={selectClassName}
            value={form.reportedByUserId ?? ""}
            onChange={(event) =>
              updateField("reportedByUserId", event.target.value)
            }
          >
            <option value="">Not set</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Department" htmlFor="mnt-department">
          <MasterDataSelect
            id="mnt-department"
            entity="departments"
            valueMode="name"
            value={form.department ?? ""}
            onChange={(value) => updateField("department", value)}
            facilityId={form.facilityId || undefined}
            enabled={open}
            emptyOptionLabel="Select department"
            loadingPlaceholder="Loading departments…"
            aria-label="Department"
          />
        </FormField>

        <FormField
          label="Reported at"
          htmlFor="mnt-reported-at"
          required
          error={errors.reportedAt}
        >
          <input
            id="mnt-reported-at"
            type="datetime-local"
            className={inputClassName}
            value={form.reportedAt}
            onChange={(event) => updateField("reportedAt", event.target.value)}
          />
        </FormField>

        <FormField
          label="External reference"
          htmlFor="mnt-event"
          hint="Optional. Not a SentraCore system identifier."
        >
          <input
            id="mnt-event"
            className={inputClassName}
            placeholder="e.g. ticket or related event"
            value={form.eventId ?? ""}
            onChange={(event) => updateField("eventId", event.target.value)}
          />
        </FormField>

        <FormField label="Requires work order" htmlFor="mnt-requires-wo">
          <select
            id="mnt-requires-wo"
            className={selectClassName}
            value={form.requiresWorkOrder ? "true" : "false"}
            onChange={(event) => {
              const next = event.target.value === "true";
              updateField("requiresWorkOrder", next);
              if (!next) {
                updateField("workOrderId", "");
                setLinkMode("choose");
              }
            }}
          >
            <option value="false">No</option>
            <option value="true">Yes</option>
          </select>
        </FormField>

        <FormField
          label="Work order"
          htmlFor="mnt-wo"
          error={errors.workOrderId}
          className="sm:col-span-2"
          hint={
            !requiresWo
              ? "Not required for this maintenance record."
              : needsWorkOrderLink
                ? "No work order linked yet."
                : undefined
          }
        >
          {!requiresWo ? (
            <p className="text-sm text-muted">Not applicable</p>
          ) : linkedWorkOrderId ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1 rounded-md border border-border bg-card px-3 py-2 text-sm">
                <span className="font-medium text-foreground">
                  {linkedWorkOrderId}
                </span>
                {linkedWorkOrder?.title ? (
                  <span className="text-muted"> — {linkedWorkOrder.title}</span>
                ) : null}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  updateField("workOrderId", "");
                  setLinkMode("link");
                }}
              >
                Change link
              </Button>
            </div>
          ) : (
            <div className="space-y-3 rounded-md border border-border/80 bg-muted/20 p-3">
              <p className="text-sm font-medium text-foreground">
                No work order linked yet
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  size="sm"
                  className="sm:flex-1"
                  loading={creatingWorkOrder}
                  disabled={
                    !isEdit ||
                    creatingWorkOrder ||
                    busy ||
                    isTerminalLifecycle
                  }
                  onClick={() => void handleCreateWorkOrder()}
                >
                  Create new work order
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="sm:flex-1"
                  disabled={creatingWorkOrder || busy || isTerminalLifecycle}
                  onClick={() => setLinkMode("link")}
                >
                  Link existing work order
                </Button>
              </div>
              {!isEdit ? (
                <p className="text-xs text-muted">
                  Save this maintenance record first to create a work order from
                  its context. You can still link an existing work order below
                  after choosing Link existing.
                </p>
              ) : null}
              {linkMode === "link" ? (
                <select
                  id="mnt-wo"
                  className={selectClassName}
                  value={form.workOrderId ?? ""}
                  onChange={(event) =>
                    updateField("workOrderId", event.target.value)
                  }
                >
                  <option value="">Select an existing work order…</option>
                  {workOrders.map((workOrder) => (
                    <option key={workOrder.id} value={workOrder.id}>
                      {workOrder.id} — {workOrder.title}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          )}
        </FormField>

        <FormField
          label="Description"
          htmlFor="mnt-description"
          className="sm:col-span-2"
        >
          <textarea
            id="mnt-description"
            className={`${inputClassName} h-auto min-h-[72px] py-2.5`}
            rows={2}
            value={form.description ?? ""}
            onChange={(event) => updateField("description", event.target.value)}
          />
        </FormField>

        {isEdit && !isCancelled ? (
          <section className="sm:col-span-2 space-y-3 border-t border-border/70 pt-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">
                Complete maintenance
              </h3>
              <p className="text-xs text-muted">
                When the work has been completed, record the completion details.
              </p>
            </div>
            <FormField
              label="Completed at"
              htmlFor="mnt-completed-at"
              required={!isCompleted}
              error={errors.completedAt}
            >
              <input
                id="mnt-completed-at"
                type="datetime-local"
                className={inputClassName}
                value={form.completedAt ?? ""}
                readOnly={isCompleted}
                disabled={isCompleted || busy}
                onChange={(event) =>
                  updateField("completedAt", event.target.value)
                }
              />
            </FormField>
            <FormField
              label="Completion notes"
              htmlFor="mnt-completion-notes"
              className="sm:col-span-2"
            >
              <textarea
                id="mnt-completion-notes"
                className={`${inputClassName} h-auto min-h-[72px] py-2.5`}
                rows={2}
                value={form.completionNotes ?? ""}
                readOnly={isCompleted}
                disabled={isCompleted || busy}
                onChange={(event) =>
                  updateField("completionNotes", event.target.value)
                }
              />
            </FormField>
            {!isCompleted ? (
              <div>
                <Button
                  type="button"
                  onClick={() => void handleMarkCompleted()}
                  loading={completing}
                  disabled={busy}
                >
                  Mark as completed
                </Button>
              </div>
            ) : null}
          </section>
        ) : null}
      </form>
    </Modal>
  );
}
