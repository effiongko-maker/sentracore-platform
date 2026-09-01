/**
 * @deprecated Phase 23 — not reachable from FM Request treatment UI.
 * Preserved for legacy compatibility reference only. New FM treatment uses
 * Create Work via `CreateMaintenanceFromRequestModal`.
 */
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
  INCIDENT_SEVERITIES,
  INCIDENT_TYPES,
} from "@/modules/incidents/constants";
import type { CreateIncidentInput } from "@/modules/incidents/types";
import { labelize } from "@/modules/incidents/utils";
import { createIncidentFromRequest } from "../actions/treatRequest";
import { mapRequestToIncidentSeed } from "../treatment/mapRequestToTreatment";
import type { RequestTreatmentResult } from "../treatment/resultTypes";
import { toDatetimeLocalValue } from "../utils";
import type { RequestRecord } from "../types";

interface CreateIncidentFromRequestModalProps {
  open: boolean;
  request: RequestRecord;
  onClose: () => void;
  onCreated: (result: RequestTreatmentResult) => void;
}

export function CreateIncidentFromRequestModal({
  open,
  request,
  onClose,
  onCreated,
}: CreateIncidentFromRequestModalProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<Partial<CreateIncidentInput>>(
    mapRequestToIncidentSeed(request)
  );
  const [saving, setSaving] = useState(false);
  const idempotencyKey = useMemo(
    () =>
      open
        ? `${request.id}:inc:${Date.now()}:${Math.random().toString(36).slice(2)}`
        : "",
    [open, request.id]
  );

  useEffect(() => {
    if (!open) return;
    setForm(mapRequestToIncidentSeed(request));
  }, [open, request]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload: CreateIncidentInput = {
        title: String(form.title ?? "").trim(),
        description:
          String(form.description ?? "").trim() || String(form.title ?? ""),
        facilityId: String(form.facilityId ?? request.facilityId).trim(),
        locationDetail: form.locationDetail,
        type: (form.type as CreateIncidentInput["type"]) ?? "other",
        source: "request",
        severity: (form.severity as CreateIncidentInput["severity"]) ?? "medium",
        status: "reported",
        reportedVia: "portal",
        reportedAt: form.reportedAt
          ? new Date(form.reportedAt).toISOString()
          : request.occurredAt,
        reportedByUserId: form.reportedByUserId,
        requiresWorkOrder: false,
        sourceRequestId: request.id,
      };

      const result = await createIncidentFromRequest({
        requestId: request.id,
        incident: payload,
        idempotencyKey,
      });

      if (!result.success) {
        throw new Error(result.error.message);
      }

      toast({
        type: "success",
        title: "Incident created",
        description: `${result.data.incident?.id} linked to ${request.id}.`,
      });
      onCreated(result.data);
      onClose();
    } catch (err) {
      toast({
        type: "error",
        title: "Unable to create incident",
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
      title="Create Incident"
      description={`From ${request.id} — for significant events only (investigation, containment, escalation). Ordinary facility problems should use Create Maintenance.`}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="create-inc-from-req" disabled={saving}>
            {saving ? "Creating…" : "Create Incident"}
          </Button>
        </div>
      }
    >
      <form id="create-inc-from-req" className="space-y-4" onSubmit={handleSubmit}>
        <FormField label="Title" htmlFor="inc-from-req-title" required>
          <input
            id="inc-from-req-title"
            className={inputClassName}
            value={form.title ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
          />
        </FormField>
        <FormField label="Description" htmlFor="inc-from-req-desc">
          <textarea
            id="inc-from-req-desc"
            className={inputClassName}
            rows={4}
            value={form.description ?? ""}
            onChange={(e) =>
              setForm((f) => ({ ...f, description: e.target.value }))
            }
          />
        </FormField>
        <FormField label="Location detail" htmlFor="inc-from-req-location">
          <input
            id="inc-from-req-location"
            className={inputClassName}
            value={form.locationDetail ?? ""}
            onChange={(e) =>
              setForm((f) => ({ ...f, locationDetail: e.target.value }))
            }
          />
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Type" htmlFor="inc-from-req-type">
            <select
              id="inc-from-req-type"
              className={selectClassName}
              value={form.type ?? "other"}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  type: e.target.value as CreateIncidentInput["type"],
                }))
              }
            >
              {INCIDENT_TYPES.map((value) => (
                <option key={value} value={value}>
                  {labelize(value)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Severity" htmlFor="inc-from-req-severity">
            <select
              id="inc-from-req-severity"
              className={selectClassName}
              value={form.severity ?? "medium"}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  severity: e.target.value as CreateIncidentInput["severity"],
                }))
              }
            >
              {INCIDENT_SEVERITIES.map((value) => (
                <option key={value} value={value}>
                  {labelize(value)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Reported at" htmlFor="inc-from-req-reported">
            <input
              id="inc-from-req-reported"
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
          <FormField label="Facility" htmlFor="inc-from-req-facility">
            <input
              id="inc-from-req-facility"
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
