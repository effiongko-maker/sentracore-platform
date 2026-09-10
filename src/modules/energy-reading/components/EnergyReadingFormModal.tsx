"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/modals/Modal";
import { Button } from "@/components/ui/Button";
import { FormField, inputClassName } from "@/components/forms/FormField";
import { useToast } from "@/components/ui/Toast";
import { ENERGY_READING_FIELD_LABELS } from "../constants";
import { EnergyReadingService } from "../services/EnergyReadingService";
import { toCreateEnergyReadingInput, toCreateFormValues } from "../utils";
import type { EnergyReading } from "../types";

type FormValues = ReturnType<typeof toCreateFormValues>;

interface EnergyReadingFormModalProps {
  open: boolean;
  mode: "create" | "edit";
  entry?: EnergyReading | null;
  onClose: () => void;
  onSaved?: () => void | Promise<void>;
}

export function EnergyReadingFormModal({
  open,
  mode,
  entry,
  onClose,
  onSaved,
}: EnergyReadingFormModalProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<FormValues>(toCreateFormValues());
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>(
    {}
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(toCreateFormValues(mode === "edit" ? entry : null));
    setErrors({});
  }, [open, mode, entry]);

  function updateField<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validate() {
    const next: Partial<Record<keyof FormValues, string>> = {};
    if (!form.date.trim()) next.date = "Date is required";

    const readingRaw = String(form.reading).trim();
    if (!readingRaw) {
      next.reading = "Reading is required";
    } else {
      const reading = Number(readingRaw);
      if (!Number.isFinite(reading)) {
        next.reading = "Reading must be a number";
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = toCreateEnergyReadingInput(form);
      const meterLabel = payload.meter?.trim() || "Reading";

      if (mode === "edit" && entry) {
        if (!entry.id?.trim()) {
          throw new Error("Cannot update energy reading: missing id.");
        }
        await EnergyReadingService.updateEnergyReading(entry.id, payload);
        await onSaved?.();
        toast({
          type: "success",
          title: "Energy reading updated",
          description: `${meterLabel} on ${payload.date} has been saved.`,
        });
      } else {
        await EnergyReadingService.createEnergyReading(payload);
        await onSaved?.();
        toast({
          type: "success",
          title: "Energy reading created",
          description: `${meterLabel} on ${payload.date} has been recorded.`,
        });
      }

      onClose();
    } catch (err) {
      toast({
        type: "error",
        title:
          mode === "edit"
            ? "Unable to update energy reading"
            : "Unable to create energy reading",
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
      title={isEdit ? "Edit energy reading" : "New energy reading"}
      description={
        isEdit
          ? "Update the observed AEDC meter reading."
          : "Record the reading shown on an AEDC electricity meter."
      }
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="energy-reading-form" loading={saving}>
            {isEdit ? "Save changes" : "Create reading"}
          </Button>
        </>
      }
    >
      <form
        id="energy-reading-form"
        onSubmit={handleSubmit}
        className="grid gap-4 sm:grid-cols-2"
      >
        <FormField
          label={ENERGY_READING_FIELD_LABELS.date}
          htmlFor="energy-reading-date"
          required
          error={errors.date}
        >
          <input
            id="energy-reading-date"
            type="date"
            className={inputClassName}
            value={form.date}
            onChange={(event) => updateField("date", event.target.value)}
          />
        </FormField>

        <FormField
          label={ENERGY_READING_FIELD_LABELS.meter}
          htmlFor="energy-reading-meter"
          hint="Optional"
          error={errors.meter}
        >
          <input
            id="energy-reading-meter"
            className={inputClassName}
            placeholder="e.g. AEDC-01"
            value={form.meter}
            onChange={(event) => updateField("meter", event.target.value)}
          />
        </FormField>

        {isEdit && entry ? (
          <FormField
            label="Reading ID"
            htmlFor="energy-reading-id"
            hint="Assigned automatically. Cannot be changed."
            className="sm:col-span-2"
          >
            <input
              id="energy-reading-id"
              className={inputClassName}
              value={entry.id}
              disabled
              readOnly
            />
          </FormField>
        ) : null}

        <FormField
          label={ENERGY_READING_FIELD_LABELS.reading}
          htmlFor="energy-reading-value"
          required
          error={errors.reading}
        >
          <input
            id="energy-reading-value"
            type="number"
            step="any"
            className={inputClassName}
            placeholder="e.g. 145230.5"
            value={form.reading}
            onChange={(event) => updateField("reading", event.target.value)}
          />
        </FormField>

        <FormField
          label={ENERGY_READING_FIELD_LABELS.remarks}
          htmlFor="energy-reading-remarks"
          className="sm:col-span-2"
        >
          <textarea
            id="energy-reading-remarks"
            className={inputClassName}
            rows={3}
            placeholder="Optional notes about this reading"
            value={form.remarks}
            onChange={(event) => updateField("remarks", event.target.value)}
          />
        </FormField>
      </form>
    </Modal>
  );
}
