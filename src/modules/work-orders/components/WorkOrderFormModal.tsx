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
import { FacilityService } from "@/services/facilities/FacilityService";
import { AssetService } from "@/services/assets/AssetService";
import { UserService } from "@/services/users/UserService";
import type { Facility } from "@/modules/facilities/types";
import type { Asset } from "@/modules/assets/types";
import type { User } from "@/modules/users/types";
import {
  WORK_ORDER_MAINTENANCE_TYPES,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_SOURCES,
  WORK_ORDER_STATUSES,
  WORK_ORDER_TYPES,
} from "../constants";
import { createWorkOrder } from "../actions/createWorkOrder";
import { updateWorkOrderOperational } from "@/lib/operational/lifecycle/updateActions";
import { labelize, optionalString, toCreateFormValues } from "../utils";
import type {
  CreateWorkOrderInput,
  WorkOrder,
  WorkOrderMaintenanceType,
  WorkOrderPriority,
  WorkOrderSource,
  WorkOrderStatus,
  WorkOrderType,
} from "../types";

interface WorkOrderFormModalProps {
  open: boolean;
  mode: "create" | "edit";
  workOrder?: WorkOrder | null;
  onClose: () => void;
  onSaved?: () => void;
}

export function WorkOrderFormModal({
  open,
  mode,
  workOrder,
  onClose,
  onSaved,
}: WorkOrderFormModalProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<CreateWorkOrderInput>(toCreateFormValues());
  const [errors, setErrors] = useState<
    Partial<Record<keyof CreateWorkOrderInput, string>>
  >({});
  const [saving, setSaving] = useState(false);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    if (!open) return;
    setForm(toCreateFormValues(mode === "edit" ? workOrder : null));
    setErrors({});
  }, [open, mode, workOrder]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([
      FacilityService.listFacilities({ page: 1, pageSize: 200 }),
      AssetService.listAssets({ page: 1, pageSize: 200 }),
      UserService.listUsers({ page: 1, pageSize: 200 }),
    ])
      .then(([facilityPage, assetPage, userPage]) => {
        if (cancelled) return;
        setFacilities(facilityPage.data);
        setAssets(assetPage.data);
        setUsers(userPage.data);
      })
      .catch(() => {
        if (cancelled) return;
        setFacilities([]);
        setAssets([]);
        setUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const assetsForFacility = form.facilityId
    ? assets.filter((asset) => asset.facility === form.facilityId || !form.facilityId)
    : assets;

  // Assets store facility as name in live sheet — also match by resolved facility name.
  const facilityName = facilities.find((f) => f.id === form.facilityId)?.name;
  const filteredAssets = form.facilityId
    ? assets.filter(
        (asset) =>
          asset.facility === form.facilityId ||
          (facilityName != null && asset.facility === facilityName)
      )
    : assets;

  function updateField<K extends keyof CreateWorkOrderInput>(
    key: K,
    value: CreateWorkOrderInput[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validate() {
    const next: Partial<Record<keyof CreateWorkOrderInput, string>> = {};
    if (!form.title.trim()) next.title = "Title is required";
    if (!form.facilityId.trim()) next.facilityId = "Facility is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const payload: CreateWorkOrderInput = {
        ...form,
        title: form.title.trim(),
        description: optionalString(form.description),
        categoryId: optionalString(form.categoryId),
        workInstructions: optionalString(form.workInstructions),
        facilityId: form.facilityId.trim(),
        assetId: optionalString(form.assetId),
        reportedByUserId: optionalString(form.reportedByUserId),
        incidentId: optionalString(form.incidentId),
        parentWorkOrderId: optionalString(form.parentWorkOrderId),
        assignedToUserId: optionalString(form.assignedToUserId),
        assignedGroupId: optionalString(form.assignedGroupId),
        requestedAt: optionalString(form.requestedAt),
        scheduledStartAt: optionalString(form.scheduledStartAt),
        scheduledEndAt: optionalString(form.scheduledEndAt),
        dueAt: optionalString(form.dueAt),
        holdReason: optionalString(form.holdReason),
        startedAt: optionalString(form.startedAt),
        completedAt: optionalString(form.completedAt),
        completionNotes: optionalString(form.completionNotes),
        workPerformed: optionalString(form.workPerformed),
        slaDueAt: optionalString(form.slaDueAt),
        createdByUserId: optionalString(form.createdByUserId),
        updatedByUserId: optionalString(form.updatedByUserId),
      };

      if (mode === "edit" && workOrder) {
        const result = await updateWorkOrderOperational(workOrder.id, payload);
        if (!result.success) {
          throw new Error(result.error.message);
        }
        toast({
          type: "success",
          title: "Work order updated",
          description: `${payload.title} has been saved.`,
        });
      } else {
        const result = await createWorkOrder(payload);
        if (!result.success) {
          throw new Error(result.error.message);
        }
        toast({
          type: "success",
          title: "Work order created",
          description: `${payload.title} has been added.`,
        });
      }

      onSaved?.();
      onClose();
    } catch (err) {
      toast({
        type: "error",
        title:
          mode === "edit"
            ? "Unable to update work order"
            : "Unable to create work order",
        description:
          err instanceof Error ? err.message : "Please try again in a moment.",
      });
    } finally {
      setSaving(false);
    }
  }

  const isEdit = mode === "edit";

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      title={isEdit ? "Edit work order" : "New work order"}
      description={
        isEdit
          ? "Update assignment, schedule, and status."
          : "Create a new operational work request."
      }
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="work-order-form" loading={saving}>
            {isEdit ? "Save changes" : "Create work order"}
          </Button>
        </>
      }
    >
      <form
        id="work-order-form"
        onSubmit={handleSubmit}
        className="grid gap-4 sm:grid-cols-2"
      >
        <FormField
          label="Title"
          htmlFor="wo-title"
          required
          error={errors.title}
          className="sm:col-span-2"
        >
          <input
            id="wo-title"
            className={inputClassName}
            placeholder="e.g. Replace failed UPS battery pack"
            value={form.title}
            onChange={(event) => updateField("title", event.target.value)}
          />
        </FormField>

        <FormField label="Type" htmlFor="wo-type" required>
          <select
            id="wo-type"
            className={selectClassName}
            value={form.type}
            onChange={(event) =>
              updateField("type", event.target.value as WorkOrderType)
            }
          >
            {WORK_ORDER_TYPES.map((value) => (
              <option key={value} value={value}>
                {labelize(value)}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Maintenance type" htmlFor="wo-maintenance">
          <select
            id="wo-maintenance"
            className={selectClassName}
            value={form.maintenanceType ?? ""}
            onChange={(event) =>
              updateField(
                "maintenanceType",
                (event.target.value || undefined) as
                  | WorkOrderMaintenanceType
                  | undefined
              )
            }
          >
            <option value="">Not set</option>
            {WORK_ORDER_MAINTENANCE_TYPES.map((value) => (
              <option key={value} value={value}>
                {labelize(value)}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Source" htmlFor="wo-source" required>
          <select
            id="wo-source"
            className={selectClassName}
            value={form.source}
            onChange={(event) =>
              updateField("source", event.target.value as WorkOrderSource)
            }
          >
            {WORK_ORDER_SOURCES.map((value) => (
              <option key={value} value={value}>
                {labelize(value)}
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          label="Facility"
          htmlFor="wo-facility"
          required
          error={errors.facilityId}
        >
          <select
            id="wo-facility"
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

        <FormField label="Asset" htmlFor="wo-asset">
          <select
            id="wo-asset"
            className={selectClassName}
            value={form.assetId ?? ""}
            onChange={(event) => updateField("assetId", event.target.value)}
          >
            <option value="">Unassigned</option>
            {(filteredAssets.length ? filteredAssets : assetsForFacility).map(
              (asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name}
                </option>
              )
            )}
          </select>
        </FormField>

        <FormField label="Assigned technician" htmlFor="wo-assignee">
          <select
            id="wo-assignee"
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

        <FormField label="Reported by" htmlFor="wo-reporter">
          <select
            id="wo-reporter"
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

        <FormField label="Priority" htmlFor="wo-priority" required>
          <select
            id="wo-priority"
            className={selectClassName}
            value={form.priority}
            onChange={(event) =>
              updateField("priority", event.target.value as WorkOrderPriority)
            }
          >
            {WORK_ORDER_PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {labelize(value)}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Status" htmlFor="wo-status" required>
          <select
            id="wo-status"
            className={selectClassName}
            value={form.status}
            onChange={(event) =>
              updateField("status", event.target.value as WorkOrderStatus)
            }
          >
            {WORK_ORDER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {labelize(value)}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Due date" htmlFor="wo-due">
          <input
            id="wo-due"
            type="date"
            className={inputClassName}
            value={form.dueAt ?? ""}
            onChange={(event) => updateField("dueAt", event.target.value)}
          />
        </FormField>

        <FormField label="Estimated hours" htmlFor="wo-est-hours">
          <input
            id="wo-est-hours"
            type="number"
            min={0}
            step="0.5"
            className={inputClassName}
            value={form.estimatedHours ?? ""}
            onChange={(event) =>
              updateField(
                "estimatedHours",
                event.target.value === ""
                  ? undefined
                  : Number(event.target.value)
              )
            }
          />
        </FormField>

        <FormField label="Estimated cost" htmlFor="wo-est-cost">
          <input
            id="wo-est-cost"
            type="number"
            min={0}
            step="0.01"
            className={inputClassName}
            value={form.estimatedCost ?? ""}
            onChange={(event) =>
              updateField(
                "estimatedCost",
                event.target.value === ""
                  ? undefined
                  : Number(event.target.value)
              )
            }
          />
        </FormField>

        <FormField
          label="Description"
          htmlFor="wo-description"
          className="sm:col-span-2"
        >
          <textarea
            id="wo-description"
            className={`${inputClassName} h-auto min-h-[72px] py-2.5`}
            rows={2}
            placeholder="Problem / request context"
            value={form.description ?? ""}
            onChange={(event) => updateField("description", event.target.value)}
          />
        </FormField>

        <FormField
          label="Work instructions"
          htmlFor="wo-instructions"
          className="sm:col-span-2"
        >
          <textarea
            id="wo-instructions"
            className={`${inputClassName} h-auto min-h-[72px] py-2.5`}
            rows={2}
            placeholder="Technician instructions"
            value={form.workInstructions ?? ""}
            onChange={(event) =>
              updateField("workInstructions", event.target.value)
            }
          />
        </FormField>
      </form>
    </Modal>
  );
}
