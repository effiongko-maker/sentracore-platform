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
import type { Facility } from "@/modules/facilities/types";
import { RequestService } from "../services/RequestService";
import { optionalString, toDatetimeLocalValue } from "../utils";
import type {
  CreateRequestInput,
  RequestRecord,
} from "../types";

interface RequestFormModalProps {
  open: boolean;
  mode: "create" | "edit";
  request?: RequestRecord | null;
  onClose: () => void;
  onSaved?: () => void;
}

function emptyForm(): CreateRequestInput {
  return {
    title: "",
    description: "",
    facilityId: "",
    occurredAt: new Date().toISOString(),
    locationDetail: "",
    reporterName: "",
    reporterContact: "",
    status: "submitted",
  };
}

function toFormValues(request?: RequestRecord | null): CreateRequestInput {
  if (!request) return emptyForm();
  return {
    title: request.title,
    description: request.description ?? "",
    facilityId: request.facilityId,
    occurredAt: request.occurredAt,
    locationDetail: request.locationDetail ?? "",
    reporterName: request.reporterName ?? "",
    reporterContact: request.reporterContact ?? "",
    reportedByUserId: request.reportedByUserId,
    status: request.status,
  };
}

export function RequestFormModal({
  open,
  mode,
  request,
  onClose,
  onSaved,
}: RequestFormModalProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<CreateRequestInput>(emptyForm());
  const [errors, setErrors] = useState<
    Partial<Record<keyof CreateRequestInput, string>>
  >({});
  const [saving, setSaving] = useState(false);
  const [facilities, setFacilities] = useState<Facility[]>([]);

  useEffect(() => {
    if (!open) return;
    setForm(toFormValues(mode === "edit" ? request : null));
    setErrors({});
  }, [open, mode, request]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    FacilityService.listFacilities({ page: 1, pageSize: 200 })
      .then((page) => {
        if (cancelled) return;
        setFacilities(page.data);
      })
      .catch(() => {
        if (cancelled) return;
        setFacilities([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  function updateField<K extends keyof CreateRequestInput>(
    key: K,
    value: CreateRequestInput[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validate() {
    const next: Partial<Record<keyof CreateRequestInput, string>> = {};
    if (!form.title.trim()) next.title = "Title is required";
    if (!form.facilityId.trim()) next.facilityId = "Facility is required";
    if (!form.occurredAt) next.occurredAt = "Occurred at is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    if (mode === "edit" && !request) return;

    setSaving(true);
    try {
      const payload: CreateRequestInput = {
        title: form.title.trim(),
        description: optionalString(form.description),
        facilityId: form.facilityId.trim(),
        occurredAt: new Date(form.occurredAt!).toISOString(),
        locationDetail: optionalString(form.locationDetail),
        reporterName: optionalString(form.reporterName),
        reporterContact: optionalString(form.reporterContact),
        reportedByUserId: optionalString(form.reportedByUserId),
      };

      if (mode === "create") {
        await RequestService.createRequest(payload);
        toast({
          type: "success",
          title: "Request created",
          description: `${payload.title} has been submitted.`,
        });
      } else {
        await RequestService.updateRequest({
          id: request!.id,
          ...payload,
        });
        toast({
          type: "success",
          title: "Request updated",
          description: `${payload.title} has been saved.`,
        });
      }

      onSaved?.();
      onClose();
    } catch (err) {
      toast({
        type: "error",
        title:
          mode === "create"
            ? "Unable to create request"
            : "Unable to update request",
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
      title="Update request"
      description="Update report details. Status and treatment links are managed from Request view."
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Title" htmlFor="req-title" error={errors.title} required>
          <input
            id="req-title"
            className={inputClassName}
            value={form.title}
            onChange={(e) => updateField("title", e.target.value)}
          />
        </FormField>

        <FormField
          label="Description"
          htmlFor="req-description"
          error={errors.description}
        >
          <textarea
            id="req-description"
            className={inputClassName}
            rows={3}
            value={form.description ?? ""}
            onChange={(e) => updateField("description", e.target.value)}
          />
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Facility"
            htmlFor="req-facility"
            error={errors.facilityId}
            required
          >
            <select
              id="req-facility"
              className={selectClassName}
              value={form.facilityId}
              onChange={(e) => updateField("facilityId", e.target.value)}
            >
              <option value="">Select facility</option>
              {facilities.map((facility) => (
                <option key={facility.id} value={facility.id}>
                  {facility.name}
                </option>
              ))}
            </select>
          </FormField>

          <FormField
            label="Occurred at"
            htmlFor="req-occurred-at"
            error={errors.occurredAt}
            required
          >
            <input
              id="req-occurred-at"
              type="datetime-local"
              className={inputClassName}
              value={toDatetimeLocalValue(form.occurredAt)}
              onChange={(e) =>
                updateField(
                  "occurredAt",
                  e.target.value
                    ? new Date(e.target.value).toISOString()
                    : ""
                )
              }
            />
          </FormField>
        </div>

        <FormField
          label="Location detail"
          htmlFor="req-location"
          error={errors.locationDetail}
        >
          <input
            id="req-location"
            className={inputClassName}
            value={form.locationDetail ?? ""}
            onChange={(e) => updateField("locationDetail", e.target.value)}
            placeholder="Floor, room, area…"
          />
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Reporter name"
            htmlFor="req-reporter-name"
            error={errors.reporterName}
          >
            <input
              id="req-reporter-name"
              className={inputClassName}
              value={form.reporterName ?? ""}
              onChange={(e) => updateField("reporterName", e.target.value)}
            />
          </FormField>

          <FormField
            label="Reporter contact"
            htmlFor="req-reporter-contact"
            error={errors.reporterContact}
          >
            <input
              id="req-reporter-contact"
              className={inputClassName}
              value={form.reporterContact ?? ""}
              onChange={(e) => updateField("reporterContact", e.target.value)}
              placeholder="Phone or email"
            />
          </FormField>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Save changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}
