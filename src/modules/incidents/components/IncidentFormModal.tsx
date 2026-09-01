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
import { MasterLocationFields } from "@/components/forms/MasterLocationFields";
import { FacilityService } from "@/services/facilities/FacilityService";
import { AssetService } from "@/services/assets/AssetService";
import { UserService } from "@/services/users/UserService";
import { WorkOrderService } from "@/services/workOrders/WorkOrderService";
import type { Facility } from "@/modules/facilities/types";
import type { Asset } from "@/modules/assets/types";
import type { User } from "@/modules/users/types";
import type { WorkOrder } from "@/modules/work-orders/types";
import {
  INCIDENT_CHANNELS,
  INCIDENT_SEVERITIES,
  INCIDENT_SOURCES,
  INCIDENT_STATUSES,
  INCIDENT_TYPES,
} from "../constants";
import { updateIncidentOperational } from "@/lib/operational/lifecycle/updateActions";
import {
  applyWorkOrderRule,
  labelize,
  optionalString,
  toCreateFormValues,
} from "../utils";
import type {
  CreateIncidentInput,
  Incident,
  IncidentChannel,
  IncidentSeverity,
  IncidentSource,
  IncidentStatus,
  IncidentType,
} from "../types";

interface IncidentFormModalProps {
  open: boolean;
  incident?: Incident | null;
  onClose: () => void;
  onSaved?: () => void;
}

/** Edit / manage incident — classification, assignment, and enrichment. */
export function IncidentFormModal({
  open,
  incident,
  onClose,
  onSaved,
}: IncidentFormModalProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<CreateIncidentInput>(toCreateFormValues());
  const [errors, setErrors] = useState<
    Partial<Record<keyof CreateIncidentInput, string>>
  >({});
  const [saving, setSaving] = useState(false);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);

  useEffect(() => {
    if (!open) return;
    setForm(toCreateFormValues(incident));
    setErrors({});
  }, [open, incident]);

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

  function updateField<K extends keyof CreateIncidentInput>(
    key: K,
    value: CreateIncidentInput[K]
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
    const next: Partial<Record<keyof CreateIncidentInput, string>> = {};
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
    if (!validate() || !incident) return;

    setSaving(true);
    try {
      const payload = applyWorkOrderRule({
        ...form,
        title: form.title.trim(),
        description: optionalString(form.description),
        categoryId: optionalString(form.categoryId),
        facilityId: form.facilityId.trim(),
        assetId: optionalString(form.assetId),
        locationDetail: optionalString(form.locationDetail),
        reportedByUserId: optionalString(form.reportedByUserId),
        assignedToUserId: optionalString(form.assignedToUserId),
        assignedGroupId: optionalString(form.assignedGroupId),
        workOrderId: optionalString(form.workOrderId),
        parentIncidentId: optionalString(form.parentIncidentId),
        reportedAt: new Date(form.reportedAt).toISOString(),
        discoveredAt: optionalString(form.discoveredAt),
        holdReason: optionalString(form.holdReason),
        acknowledgedAt: optionalString(form.acknowledgedAt),
        responseDueAt: optionalString(form.responseDueAt),
        containedAt: optionalString(form.containedAt),
        resolvedAt: optionalString(form.resolvedAt),
        closedAt: optionalString(form.closedAt),
        immediateActions: optionalString(form.immediateActions),
        rootCause: optionalString(form.rootCause),
        correctiveActions: optionalString(form.correctiveActions),
        preventiveActions: optionalString(form.preventiveActions),
        resolutionNotes: optionalString(form.resolutionNotes),
        createdByUserId: optionalString(form.createdByUserId),
        updatedByUserId: optionalString(form.updatedByUserId),
      });

      const result = await updateIncidentOperational(incident.id, payload);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      toast({
        type: "success",
        title: "Incident updated",
        description: `${payload.title} has been saved.`,
      });

      onSaved?.();
      onClose();
    } catch (err) {
      toast({
        type: "error",
        title: "Unable to update incident",
        description:
          err instanceof Error ? err.message : "Please try again in a moment.",
      });
    } finally {
      setSaving(false);
    }
  }

  const requiresWo = Boolean(form.requiresWorkOrder);

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      title="Investigate incident"
      description="Update classification, assignment, containment, and investigation details."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="incident-edit-form" loading={saving}>
            Save changes
          </Button>
        </>
      }
    >
      <form
        id="incident-edit-form"
        onSubmit={handleSubmit}
        className="grid gap-4 sm:grid-cols-2"
      >
        <FormField
          label="Title"
          htmlFor="inc-title"
          required
          error={errors.title}
          className="sm:col-span-2"
        >
          <input
            id="inc-title"
            className={inputClassName}
            value={form.title}
            onChange={(event) => updateField("title", event.target.value)}
          />
        </FormField>

        <FormField label="Type" htmlFor="inc-type" required>
          <select
            id="inc-type"
            className={selectClassName}
            value={form.type}
            onChange={(event) =>
              updateField("type", event.target.value as IncidentType)
            }
          >
            {INCIDENT_TYPES.map((value) => (
              <option key={value} value={value}>
                {labelize(value)}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Source" htmlFor="inc-source" required>
          <select
            id="inc-source"
            className={selectClassName}
            value={form.source}
            onChange={(event) =>
              updateField("source", event.target.value as IncidentSource)
            }
          >
            {INCIDENT_SOURCES.map((value) => (
              <option key={value} value={value}>
                {labelize(value)}
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          label="Facility"
          htmlFor="inc-facility"
          required
          error={errors.facilityId}
        >
          <select
            id="inc-facility"
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

        <FormField label="Asset" htmlFor="inc-asset">
          <select
            id="inc-asset"
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

        <FormField label="Severity" htmlFor="inc-severity" required>
          <select
            id="inc-severity"
            className={selectClassName}
            value={form.severity}
            onChange={(event) =>
              updateField("severity", event.target.value as IncidentSeverity)
            }
          >
            {INCIDENT_SEVERITIES.map((value) => (
              <option key={value} value={value}>
                {labelize(value)}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Status" htmlFor="inc-status" required>
          <select
            id="inc-status"
            className={selectClassName}
            value={form.status}
            onChange={(event) =>
              updateField("status", event.target.value as IncidentStatus)
            }
          >
            {INCIDENT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {labelize(value)}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Assigned to" htmlFor="inc-assignee">
          <select
            id="inc-assignee"
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

        <FormField label="Reported by" htmlFor="inc-reporter">
          <select
            id="inc-reporter"
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

        <FormField
          label="Reported at"
          htmlFor="inc-reported-at"
          required
          error={errors.reportedAt}
        >
          <input
            id="inc-reported-at"
            type="datetime-local"
            className={inputClassName}
            value={form.reportedAt}
            onChange={(event) => updateField("reportedAt", event.target.value)}
          />
        </FormField>

        <FormField label="Reported via" htmlFor="inc-channel">
          <select
            id="inc-channel"
            className={selectClassName}
            value={form.reportedVia ?? ""}
            onChange={(event) =>
              updateField(
                "reportedVia",
                (event.target.value || undefined) as IncidentChannel | undefined
              )
            }
          >
            <option value="">Not set</option>
            {INCIDENT_CHANNELS.map((value) => (
              <option key={value} value={value}>
                {labelize(value)}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Requires work order" htmlFor="inc-requires-wo">
          <select
            id="inc-requires-wo"
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
          htmlFor="inc-wo"
          error={errors.workOrderId}
        >
          <select
            id="inc-wo"
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

        <MasterLocationFields
          facilityId={form.facilityId}
          value={form.locationDetail ?? ""}
          onChange={(value) => updateField("locationDetail", value)}
          includeFacility={false}
          label="Location"
          hint="Building → floor → room from Master Data."
        />

        <FormField
          label="Description"
          htmlFor="inc-description"
          className="sm:col-span-2"
        >
          <textarea
            id="inc-description"
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
