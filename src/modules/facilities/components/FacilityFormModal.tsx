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
import {
  FACILITY_LOCATIONS,
  FACILITY_STATUSES,
  FACILITY_TYPES,
} from "../constants";
import { FacilityService } from "../services/FacilityService";
import { labelize, toCreateFormValues } from "../utils";
import type {
  CreateFacilityInput,
  Facility,
  FacilityStatus,
  FacilityType,
} from "../types";

interface FacilityFormModalProps {
  open: boolean;
  mode: "create" | "edit";
  facility?: Facility | null;
  onClose: () => void;
  onSaved?: () => void;
}

export function FacilityFormModal({
  open,
  mode,
  facility,
  onClose,
  onSaved,
}: FacilityFormModalProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<CreateFacilityInput>(toCreateFormValues());
  const [errors, setErrors] = useState<
    Partial<Record<keyof CreateFacilityInput, string>>
  >({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(toCreateFormValues(mode === "edit" ? facility : null));
    setErrors({});
  }, [open, mode, facility]);

  function updateField<K extends keyof CreateFacilityInput>(
    key: K,
    value: CreateFacilityInput[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validate() {
    const next: Partial<Record<keyof CreateFacilityInput, string>> = {};
    if (!form.name.trim()) next.name = "Facility name is required";
    if (!form.code.trim()) next.code = "Code is required";
    if (!form.location.trim()) next.location = "Location is required";
    if (!form.manager.trim()) next.manager = "Manager is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const payload: CreateFacilityInput = {
        ...form,
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        location: form.location.trim(),
        manager: form.manager.trim(),
        description: form.description?.trim() || undefined,
      };

      if (mode === "edit" && facility) {
        await FacilityService.updateFacility(facility.id, payload);
        toast({
          type: "success",
          title: "Facility updated",
          description: `${payload.name} has been saved.`,
        });
      } else {
        await FacilityService.createFacility(payload);
        toast({
          type: "success",
          title: "Facility created",
          description: `${payload.name} has been added to the portfolio.`,
        });
      }

      onSaved?.();
      onClose();
    } catch (err) {
      toast({
        type: "error",
        title:
          mode === "edit"
            ? "Unable to update facility"
            : "Unable to create facility",
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
      title={isEdit ? "Edit facility" : "New facility"}
      description={
        isEdit
          ? "Update site details, assignment, and operational status."
          : "Register a new site within the SentraCore portfolio."
      }
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="facility-form" loading={saving}>
            {isEdit ? "Save changes" : "Create facility"}
          </Button>
        </>
      }
    >
      <form
        id="facility-form"
        onSubmit={handleSubmit}
        className="grid gap-4 sm:grid-cols-2"
      >
        <FormField
          label="Facility name"
          htmlFor="facility-name"
          required
          error={errors.name}
          className="sm:col-span-2"
        >
          <input
            id="facility-name"
            className={inputClassName}
            placeholder="e.g. Lagos HQ"
            value={form.name}
            onChange={(event) => updateField("name", event.target.value)}
          />
        </FormField>

        <FormField
          label="Code"
          htmlFor="facility-code"
          required
          error={errors.code}
        >
          <input
            id="facility-code"
            className={inputClassName}
            placeholder="e.g. LAG-HQ"
            value={form.code}
            onChange={(event) => updateField("code", event.target.value)}
          />
        </FormField>

        <FormField
          label="Location"
          htmlFor="facility-location"
          required
          error={errors.location}
        >
          <select
            id="facility-location"
            className={selectClassName}
            value={form.location}
            onChange={(event) => updateField("location", event.target.value)}
          >
            {FACILITY_LOCATIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Facility type" htmlFor="facility-type" required>
          <select
            id="facility-type"
            className={selectClassName}
            value={form.type}
            onChange={(event) =>
              updateField("type", event.target.value as FacilityType)
            }
          >
            {FACILITY_TYPES.map((value) => (
              <option key={value} value={value}>
                {labelize(value)}
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          label="Manager"
          htmlFor="facility-manager"
          required
          error={errors.manager}
        >
          <input
            id="facility-manager"
            className={inputClassName}
            placeholder="e.g. James Whitfield"
            value={form.manager}
            onChange={(event) => updateField("manager", event.target.value)}
          />
        </FormField>

        <FormField label="Status" htmlFor="facility-status" required>
          <select
            id="facility-status"
            className={selectClassName}
            value={form.status}
            onChange={(event) =>
              updateField("status", event.target.value as FacilityStatus)
            }
          >
            {FACILITY_STATUSES.map((value) => (
              <option key={value} value={value}>
                {labelize(value)}
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          label="Description"
          htmlFor="facility-description"
          className="sm:col-span-2"
        >
          <textarea
            id="facility-description"
            className={cnTextarea()}
            rows={3}
            placeholder="Optional site notes"
            value={form.description ?? ""}
            onChange={(event) => updateField("description", event.target.value)}
          />
        </FormField>
      </form>
    </Modal>
  );
}

function cnTextarea() {
  return `${inputClassName} h-auto min-h-[88px] py-2.5`;
}
