"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/modals/Modal";
import { Button } from "@/components/ui/Button";
import {
  FormField,
  inputClassName,
  selectClassName,
} from "@/components/forms/FormField";
import { useToast } from "@/components/ui/Toast";
import {
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_TYPES,
} from "@/modules/maintenance/constants";
import type { CreateMaintenanceInput } from "@/modules/maintenance/types";
import { labelize } from "@/modules/maintenance/utils";
import { createMaintenanceFromRequest } from "../actions/treatRequest";
import { mapRequestToMaintenanceSeed } from "../treatment/mapRequestToTreatment";
import type { RequestTreatmentResult } from "../treatment/resultTypes";
import { toDatetimeLocalValue } from "../utils";
import type { RequestRecord } from "../types";

interface CreateMaintenanceFromRequestModalProps {
  open: boolean;
  request: RequestRecord;
  onClose: () => void;
  onCreated: (result: RequestTreatmentResult) => void;
}

export function CreateMaintenanceFromRequestModal({
  open,
  request,
  onClose,
  onCreated,
}: CreateMaintenanceFromRequestModalProps) {
  const { toast } = useToast();
  const seed = useMemo(() => mapRequestToMaintenanceSeed(request), [request]);
  const [form, setForm] = useState<Partial<CreateMaintenanceInput>>(seed);
  const [saving, setSaving] = useState(false);
  const idempotencyKey = useMemo(
    () =>
      open
        ? `${request.id}:mnt:${Date.now()}:${Math.random().toString(36).slice(2)}`
        : "",
    [open, request.id]
  );

  useEffect(() => {
    if (!open) return;
    setForm(mapRequestToMaintenanceSeed(request));
  }, [open, request]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload: CreateMaintenanceInput = {
        title: String(form.title ?? "").trim(),
        description: String(form.description ?? "").trim() || String(form.title ?? ""),
        type: (form.type as CreateMaintenanceInput["type"]) ?? "corrective",
        source: "request",
        facilityId: String(form.facilityId ?? request.facilityId).trim(),
        priority: (form.priority as CreateMaintenanceInput["priority"]) ?? "medium",
        status: "requested",
        reportedAt: form.reportedAt
          ? new Date(form.reportedAt).toISOString()
          : request.occurredAt,
        reportedByUserId: form.reportedByUserId,
        requiresWorkOrder: false,
        sourceRequestId: request.id,
      };

      const result = await createMaintenanceFromRequest({
        requestId: request.id,
        maintenance: payload,
        idempotencyKey,
      });

      if (!result.success) {
        throw new Error(result.error.message);
      }

      toast({
        type: "success",
        title: "Work created",
        description: `${result.data.maintenance?.id} linked to ${request.id}.`,
      });
      onCreated(result.data);
      onClose();
    } catch (err) {
      toast({
        type: "error",
        title: "Unable to create work",
        description:
          err instanceof Error ? err.message : "Please try again in a moment.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create Work"
      description={`From ${request.id}`}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="create-mnt-from-req" disabled={saving}>
            {saving ? "Creating…" : "Create Work"}
          </Button>
        </div>
      }
    >
      <form id="create-mnt-from-req" className="space-y-4" onSubmit={handleSubmit}>
        <FormField label="Title" htmlFor="mnt-from-req-title" required>
          <input
            id="mnt-from-req-title"
            className={inputClassName}
            value={form.title ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
          />
        </FormField>
        <FormField label="Description" htmlFor="mnt-from-req-desc">
          <textarea
            id="mnt-from-req-desc"
            className={inputClassName}
            rows={4}
            value={form.description ?? ""}
            onChange={(e) =>
              setForm((f) => ({ ...f, description: e.target.value }))
            }
          />
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Type" htmlFor="mnt-from-req-type">
            <select
              id="mnt-from-req-type"
              className={selectClassName}
              value={form.type ?? "corrective"}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  type: e.target.value as CreateMaintenanceInput["type"],
                }))
              }
            >
              {MAINTENANCE_TYPES.map((value) => (
                <option key={value} value={value}>
                  {labelize(value)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Priority" htmlFor="mnt-from-req-priority">
            <select
              id="mnt-from-req-priority"
              className={selectClassName}
              value={form.priority ?? "medium"}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  priority: e.target.value as CreateMaintenanceInput["priority"],
                }))
              }
            >
              {MAINTENANCE_PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {labelize(value)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Reported at" htmlFor="mnt-from-req-reported">
            <input
              id="mnt-from-req-reported"
              type="datetime-local"
              className={inputClassName}
              value={toDatetimeLocalValue(
                form.reportedAt
                  ? new Date(form.reportedAt).toISOString()
                  : request.occurredAt
              )}
              onChange={(e) =>
                setForm((f) => ({ ...f, reportedAt: e.target.value }))
              }
            />
          </FormField>
          <FormField label="Facility" htmlFor="mnt-from-req-facility">
            <input
              id="mnt-from-req-facility"
              className={inputClassName}
              value={form.facilityId ?? request.facilityId}
              readOnly
            />
          </FormField>
        </div>
      </form>
    </Modal>
  );
}
