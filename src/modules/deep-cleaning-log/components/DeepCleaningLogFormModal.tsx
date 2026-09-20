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
import { InheritedFacilityField } from "@/components/operational/InheritedFacilityField";
import { DEEP_CLEANING_LOG_FIELD_LABELS } from "../constants";
import { DeepCleaningLogService } from "../services/DeepCleaningLogService";
import {
  toCreateDeepCleaningLogInput,
  toCreateFormValues,
  validateDeepCleaningLogFormValues,
} from "../utils";
import type { DeepCleaningLog } from "../types";

type FormValues = ReturnType<typeof toCreateFormValues>;

interface DeepCleaningLogFormModalProps {
  open: boolean;
  mode: "create" | "edit";
  entry?: DeepCleaningLog | null;
  onClose: () => void;
  onSaved?: () => void | Promise<void>;
}

export function DeepCleaningLogFormModal({
  open,
  mode,
  entry,
  onClose,
  onSaved,
}: DeepCleaningLogFormModalProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<FormValues>(toCreateFormValues());
  const [errors, setErrors] = useState<
    Partial<Record<keyof FormValues, string>>
  >({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(toCreateFormValues(mode === "edit" ? entry : null));
    setErrors({});
  }, [open, mode, entry]);

  function updateField<K extends keyof FormValues>(
    key: K,
    value: FormValues[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validate() {
    const next = validateDeepCleaningLogFormValues(form);
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = toCreateDeepCleaningLogInput(form);

      if (mode === "edit" && entry) {
        if (!entry.id?.trim()) {
          throw new Error("Cannot update deep cleaning log: missing id.");
        }
        await DeepCleaningLogService.updateDeepCleaningLog(entry.id, payload);
        await onSaved?.();
        toast({
          type: "success",
          title: "Deep cleaning log updated",
          description: `${payload.area} on ${payload.date} has been saved.`,
        });
      } else {
        await DeepCleaningLogService.createDeepCleaningLog(payload);
        await onSaved?.();
        toast({
          type: "success",
          title: "Deep cleaning log created",
          description: `${payload.area} on ${payload.date} has been recorded.`,
        });
      }

      onClose();
    } catch (err) {
      toast({
        type: "error",
        title:
          mode === "edit"
            ? "Unable to update deep cleaning log"
            : "Unable to create deep cleaning log",
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
      title={isEdit ? "Edit deep cleaning log" : "New deep cleaning log"}
      description={
        isEdit
          ? "Update area, vendor/team, status, and remarks."
          : "Record a deep cleaning activity for a facility area."
      }
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="deep-cleaning-log-form" loading={saving}>
            {isEdit ? "Save changes" : "Create entry"}
          </Button>
        </>
      }
    >
      <form
        id="deep-cleaning-log-form"
        onSubmit={handleSubmit}
        className="grid gap-4 sm:grid-cols-2"
      >
        <FormField
          label={DEEP_CLEANING_LOG_FIELD_LABELS.date}
          htmlFor="deep-cleaning-log-date"
          required
          error={errors.date}
        >
          <input
            id="deep-cleaning-log-date"
            type="date"
            className={inputClassName}
            value={form.date}
            onChange={(event) => updateField("date", event.target.value)}
          />
        </FormField>

        <InheritedFacilityField
          open={open}
          id="deep-cleaning-log-facility"
          label={DEEP_CLEANING_LOG_FIELD_LABELS.facilityId}
          value={form.facilityId}
          error={errors.facilityId}
          onResolve={(facilityId) => updateField("facilityId", facilityId)}
        />

        {isEdit && entry ? (
          <FormField
            label={DEEP_CLEANING_LOG_FIELD_LABELS.id}
            htmlFor="deep-cleaning-log-id"
            hint="Assigned automatically. Cannot be changed."
            className="sm:col-span-2"
          >
            <input
              id="deep-cleaning-log-id"
              className={inputClassName}
              value={entry.id}
              disabled
              readOnly
            />
          </FormField>
        ) : null}

        <FormField
          label={DEEP_CLEANING_LOG_FIELD_LABELS.area}
          htmlFor="deep-cleaning-log-area"
          required
          error={errors.area}
          className="sm:col-span-2"
        >
          <input
            id="deep-cleaning-log-area"
            className={inputClassName}
            placeholder="e.g. Ground floor toilets"
            value={form.area}
            onChange={(event) => updateField("area", event.target.value)}
          />
        </FormField>

        <FormField
          label={DEEP_CLEANING_LOG_FIELD_LABELS.vendorTeam}
          htmlFor="deep-cleaning-log-vendor"
          required
          error={errors.vendorTeam}
        >
          <input
            id="deep-cleaning-log-vendor"
            className={inputClassName}
            placeholder="e.g. Housekeeping Team A"
            value={form.vendorTeam}
            onChange={(event) => updateField("vendorTeam", event.target.value)}
          />
        </FormField>

        <FormField
          label={DEEP_CLEANING_LOG_FIELD_LABELS.status}
          htmlFor="deep-cleaning-log-status"
          required
          error={errors.status}
        >
          <input
            id="deep-cleaning-log-status"
            className={inputClassName}
            placeholder="e.g. Completed"
            value={form.status}
            onChange={(event) => updateField("status", event.target.value)}
          />
        </FormField>

        <FormField
          label={DEEP_CLEANING_LOG_FIELD_LABELS.remarks}
          htmlFor="deep-cleaning-log-remarks"
          hint="Optional"
          className="sm:col-span-2"
        >
          <textarea
            id="deep-cleaning-log-remarks"
            className={inputClassName}
            rows={3}
            placeholder="Optional notes"
            value={form.remarks}
            onChange={(event) => updateField("remarks", event.target.value)}
          />
        </FormField>
      </form>
    </Modal>
  );
}
