"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/modals/Modal";
import { Button } from "@/components/ui/Button";
import { FormField, inputClassName } from "@/components/forms/FormField";
import { useToast } from "@/components/ui/Toast";
import { GENERATOR_LOG_FIELD_LABELS } from "../constants";
import { GeneratorLogService } from "../services/GeneratorLogService";
import {
  calculateRunHoursFromReadings,
  toCreateFormValues,
  toCreateGeneratorLogInput,
} from "../utils";
import type { GeneratorLog } from "../types";

type FormValues = ReturnType<typeof toCreateFormValues>;

interface GeneratorLogFormModalProps {
  open: boolean;
  mode: "create" | "edit";
  entry?: GeneratorLog | null;
  onClose: () => void;
  onSaved?: () => void | Promise<void>;
}

export function GeneratorLogFormModal({
  open,
  mode,
  entry,
  onClose,
  onSaved,
}: GeneratorLogFormModalProps) {
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

  const displayHours = useMemo(() => {
    const start = form.startMeterReading.trim() ? Number(form.startMeterReading) : null;
    const end = form.endMeterReading.trim() ? Number(form.endMeterReading) : null;
    return calculateRunHoursFromReadings(start, end);
  }, [form.startMeterReading, form.endMeterReading]);

  function updateField<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validate() {
    const next: Partial<Record<keyof FormValues, string>> = {};
    if (!form.date.trim()) next.date = "Date is required";
    if (!form.generator.trim()) next.generator = "Generator is required";
    const readings = (["startMeterReading", "endMeterReading"] as const).map((key) => {
      const raw = form[key].trim();
      const label = key === "startMeterReading" ? "Start reading" : "End reading";
      if (!raw) {
        next[key] = `${label} is required`;
        return null;
      }
      const value = Number(raw);
      if (!Number.isFinite(value)) next[key] = `${label} must be a number`;
      else if (value < 0) next[key] = `${label} cannot be negative`;
      return Number.isFinite(value) ? value : null;
    });
    if (readings[0] != null && readings[1] != null && readings[1] < readings[0]) {
      next.endMeterReading = "End reading cannot be lower than the start reading";
    }

    // Diesel Used is optional: blank means not recorded (never 0).
    const fuelRaw = String(form.fuelUsed).trim();
    if (fuelRaw) {
      const fuelUsed = Number(fuelRaw);
      if (!Number.isFinite(fuelUsed)) {
        next.fuelUsed = "Diesel Used must be a number";
      } else if (fuelUsed < 0) {
        next.fuelUsed = "Diesel Used cannot be negative";
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
      const payload = toCreateGeneratorLogInput(form);

      if (mode === "edit" && entry) {
        if (!entry.id?.trim()) {
          throw new Error("Cannot update generator log: missing id.");
        }
        await GeneratorLogService.updateGeneratorLog(entry.id, payload);
        await onSaved?.();
        toast({
          type: "success",
          title: "Generator log updated",
          description: `${payload.generator} run on ${payload.date} has been saved.`,
        });
      } else {
        await GeneratorLogService.createGeneratorLog(payload);
        await onSaved?.();
        toast({
          type: "success",
          title: "Generator log created",
          description: `${payload.generator} run on ${payload.date} has been recorded.`,
        });
      }

      onClose();
    } catch (err) {
      toast({
        type: "error",
        title:
          mode === "edit"
            ? "Unable to update generator log"
            : "Unable to create generator log",
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
      title={isEdit ? "Edit generator log" : "New generator log"}
      description={
        isEdit
          ? "Update run details. Start and End are generator hour-meter readings; run hours are calculated from them."
          : "Record a generator run. Start and End are generator hour-meter readings; run hours are calculated from them."
      }
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="generator-log-form" loading={saving}>
            {isEdit ? "Save changes" : "Create log"}
          </Button>
        </>
      }
    >
      <form
        id="generator-log-form"
        onSubmit={handleSubmit}
        className="grid gap-4 sm:grid-cols-2"
      >
        <FormField
          label={GENERATOR_LOG_FIELD_LABELS.date}
          htmlFor="generator-log-date"
          required
          error={errors.date}
        >
          <input
            id="generator-log-date"
            type="date"
            className={inputClassName}
            value={form.date}
            onChange={(event) => updateField("date", event.target.value)}
          />
        </FormField>

        <FormField
          label={GENERATOR_LOG_FIELD_LABELS.generator}
          htmlFor="generator-log-generator"
          required
          error={errors.generator}
        >
          <input
            id="generator-log-generator"
            className={inputClassName}
            placeholder="e.g. Gen-01"
            value={form.generator}
            onChange={(event) => updateField("generator", event.target.value)}
          />
        </FormField>

        {isEdit && entry ? (
          <FormField
            label="Log ID"
            htmlFor="generator-log-id"
            hint="Assigned automatically. Cannot be changed."
            className="sm:col-span-2"
          >
            <input
              id="generator-log-id"
              className={inputClassName}
              value={entry.id}
              disabled
              readOnly
            />
          </FormField>
        ) : null}

        <FormField
          label={GENERATOR_LOG_FIELD_LABELS.startMeterReading}
          htmlFor="generator-log-start"
          required
          hint="Hour-meter reading at the start of the run."
          error={errors.startMeterReading}
        >
          <input
            id="generator-log-start"
            type="number"
            min={0}
            step="0.1"
            inputMode="decimal"
            className={inputClassName}
            placeholder="e.g. 3265.1"
            value={form.startMeterReading}
            onChange={(event) => updateField("startMeterReading", event.target.value)}
          />
        </FormField>

        <FormField
          label={GENERATOR_LOG_FIELD_LABELS.endMeterReading}
          htmlFor="generator-log-end"
          required
          hint="Hour-meter reading at the end of the run."
          error={errors.endMeterReading}
        >
          <input
            id="generator-log-end"
            type="number"
            min={0}
            step="0.1"
            inputMode="decimal"
            className={inputClassName}
            placeholder="e.g. 3271.5"
            value={form.endMeterReading}
            onChange={(event) => updateField("endMeterReading", event.target.value)}
          />
        </FormField>

        <FormField
          label={GENERATOR_LOG_FIELD_LABELS.hours}
          htmlFor="generator-log-hours"
          hint="End reading − start reading. Not editable."
        >
          <input
            id="generator-log-hours"
            className={inputClassName}
            value={displayHours == null ? "—" : displayHours.toFixed(2)}
            disabled
            readOnly
          />
        </FormField>

        <FormField
          label={GENERATOR_LOG_FIELD_LABELS.fuelUsed}
          htmlFor="generator-log-fuel"
          hint="Total diesel for ALL generators on this date — record it once, on one log of the date. Leave blank on the other generators' logs or if not recorded."
          error={errors.fuelUsed}
        >
          <input
            id="generator-log-fuel"
            type="number"
            min={0}
            step="any"
            className={inputClassName}
            placeholder="e.g. 12.5"
            value={form.fuelUsed}
            onChange={(event) => updateField("fuelUsed", event.target.value)}
          />
        </FormField>

        <FormField
          label={GENERATOR_LOG_FIELD_LABELS.remarks}
          htmlFor="generator-log-remarks"
          className="sm:col-span-2"
        >
          <textarea
            id="generator-log-remarks"
            className={inputClassName}
            rows={3}
            placeholder="Optional notes about this run"
            value={form.remarks}
            onChange={(event) => updateField("remarks", event.target.value)}
          />
        </FormField>
      </form>
    </Modal>
  );
}
