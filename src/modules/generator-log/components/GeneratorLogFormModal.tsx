"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/modals/Modal";
import { Button } from "@/components/ui/Button";
import { FormField, inputClassName } from "@/components/forms/FormField";
import { useToast } from "@/components/ui/Toast";
import { GENERATOR_LOG_FIELD_LABELS } from "../constants";
import { GeneratorLogService } from "../services/GeneratorLogService";
import {
  calculateGeneratorLogHours,
  fromDatetimeLocalValue,
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

  const displayHours = useMemo(
    () =>
      calculateGeneratorLogHours(
        fromDatetimeLocalValue(form.startedAt),
        fromDatetimeLocalValue(form.endedAt)
      ),
    [form.startedAt, form.endedAt]
  );

  function updateField<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validate() {
    const next: Partial<Record<keyof FormValues, string>> = {};
    if (!form.date.trim()) next.date = "Date is required";
    if (!form.generator.trim()) next.generator = "Generator is required";
    if (!form.startedAt.trim()) next.startedAt = "Start is required";
    if (!form.endedAt.trim()) next.endedAt = "End is required";

    const startMs = Date.parse(fromDatetimeLocalValue(form.startedAt));
    const endMs = Date.parse(fromDatetimeLocalValue(form.endedAt));
    if (
      form.startedAt.trim() &&
      form.endedAt.trim() &&
      Number.isFinite(startMs) &&
      Number.isFinite(endMs) &&
      endMs <= startMs
    ) {
      next.endedAt = "End must be after Start";
    }

    const fuelRaw = String(form.fuelUsed).trim();
    if (!fuelRaw) {
      next.fuelUsed = "Diesel Used is required";
    } else {
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
          ? "Update run details. Hours are calculated from Start and End."
          : "Record a generator run. Hours are calculated from Start and End."
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
          label={GENERATOR_LOG_FIELD_LABELS.startedAt}
          htmlFor="generator-log-start"
          required
          error={errors.startedAt}
        >
          <input
            id="generator-log-start"
            type="datetime-local"
            className={inputClassName}
            value={form.startedAt}
            onChange={(event) => updateField("startedAt", event.target.value)}
          />
        </FormField>

        <FormField
          label={GENERATOR_LOG_FIELD_LABELS.endedAt}
          htmlFor="generator-log-end"
          required
          error={errors.endedAt}
        >
          <input
            id="generator-log-end"
            type="datetime-local"
            className={inputClassName}
            value={form.endedAt}
            onChange={(event) => updateField("endedAt", event.target.value)}
          />
        </FormField>

        <FormField
          label={GENERATOR_LOG_FIELD_LABELS.hours}
          htmlFor="generator-log-hours"
          hint="Calculated from Start and End. Not editable."
        >
          <input
            id="generator-log-hours"
            className={inputClassName}
            value={displayHours.toFixed(2)}
            disabled
            readOnly
          />
        </FormField>

        <FormField
          label={GENERATOR_LOG_FIELD_LABELS.fuelUsed}
          htmlFor="generator-log-fuel"
          required
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
