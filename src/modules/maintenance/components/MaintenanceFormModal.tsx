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
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_SOURCES,
  MAINTENANCE_STATUSES,
  MAINTENANCE_TYPES,
} from "../constants";
import { requestMaintenance } from "../actions/requestMaintenance";
import { updateMaintenanceOperational } from "@/lib/operational/lifecycle/updateActions";
import {
  applyWorkOrderRule,
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

  useEffect(() => {
    if (!open) return;
    setForm(toCreateFormValues(mode === "edit" ? maintenance : null));
    setErrors({});
  }, [open, mode, maintenance]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([
      FacilityService.listFacilities({ page: 1, pageSize: 200 }),
      AssetService.listAssets({ page: 1, pageSize: 200 }),
      UserService.listUsers({ page: 1, pageSize: 200 }),
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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;

    setSaving(true);
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
        completedAt: toIsoOrUndefined(form.completedAt),
        holdReason: optionalString(form.holdReason),
        completionNotes: optionalString(form.completionNotes),
        workPerformed: optionalString(form.workPerformed),
        createdByUserId: optionalString(form.createdByUserId),
        updatedByUserId: optionalString(form.updatedByUserId),
      });

      if (mode === "edit" && maintenance) {
        const result = await updateMaintenanceOperational(
          maintenance.id,
          payload
        );
        if (!result.success) {
          throw new Error(result.error.message);
        }
        toast({
          type: "success",
          title: "Maintenance updated",
          description: `${payload.title} has been saved.`,
        });
      } else {
        const result = await requestMaintenance(payload);
        if (!result.success) {
          throw new Error(result.error.message);
        }
        toast({
          type: "success",
          title: "Maintenance created",
          description: `${result.data.title} has been logged.`,
        });
      }

      onSaved?.();
      onClose();
    } catch (err) {
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

  const isEdit = mode === "edit";
  const requiresWo = Boolean(form.requiresWorkOrder);

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      title={isEdit ? "Edit maintenance" : "New maintenance"}
      description={
        isEdit
          ? "Update request details, assignment, and completion."
          : "Log a new maintenance request."
      }
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="maintenance-form" loading={saving}>
            {isEdit ? "Save changes" : "Create maintenance"}
          </Button>
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
          <select
            id="mnt-status"
            className={selectClassName}
            value={form.status}
            onChange={(event) =>
              updateField("status", event.target.value as MaintenanceStatus)
            }
          >
            {MAINTENANCE_STATUSES.map((value) => (
              <option key={value} value={value}>
                {labelize(value)}
              </option>
            ))}
          </select>
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

        <FormField label="Completed at" htmlFor="mnt-completed-at">
          <input
            id="mnt-completed-at"
            type="datetime-local"
            className={inputClassName}
            value={form.completedAt ?? ""}
            onChange={(event) => updateField("completedAt", event.target.value)}
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
            onChange={(event) =>
              updateField("requiresWorkOrder", event.target.value === "true")
            }
          >
            <option value="false">No</option>
            <option value="true">Yes</option>
          </select>
        </FormField>

        <FormField
          label="Work order"
          htmlFor="mnt-wo"
          error={errors.workOrderId}
        >
          <select
            id="mnt-wo"
            className={selectClassName}
            value={form.workOrderId ?? ""}
            disabled={!requiresWo}
            onChange={(event) => updateField("workOrderId", event.target.value)}
          >
            <option value="">
              {requiresWo ? "Not linked yet" : "Not applicable"}
            </option>
            {workOrders.map((workOrder) => (
              <option key={workOrder.id} value={workOrder.id}>
                {workOrder.id} — {workOrder.title}
              </option>
            ))}
          </select>
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
      </form>
    </Modal>
  );
}
