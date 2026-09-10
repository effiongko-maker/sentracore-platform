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
import { useFacilityOptions } from "@/hooks/useFacilityOptions";
import { FUMIGATION_LOG_FIELD_LABELS } from "../constants";
import { FumigationLogService } from "../services/FumigationLogService";
import {
  getFumigationDueStateLabel,
  toCreateFormValues,
  toCreateFumigationLogInput,
  validateFumigationLogFormValues,
} from "../utils";
import type { FumigationLog } from "../types";

type FormValues = ReturnType<typeof toCreateFormValues>;

interface FumigationLogFormModalProps {
  open: boolean;
  mode: "create" | "edit";
  entry?: FumigationLog | null;
  onClose: () => void;
  onSaved?: () => void | Promise<void>;
}

export function FumigationLogFormModal({
  open,
  mode,
  entry,
  onClose,
  onSaved,
}: FumigationLogFormModalProps) {
  const { toast } = useToast();
  const { facilities, loading: facilitiesLoading } = useFacilityOptions(open);
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
    const next = validateFumigationLogFormValues(form);
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = toCreateFumigationLogInput(form);

      if (mode === "edit" && entry) {
        if (!entry.id?.trim()) {
          throw new Error("Cannot update fumigation log: missing id.");
        }
        await FumigationLogService.updateFumigationLog(entry.id, payload);
        await onSaved?.();
        toast({
          type: "success",
          title: "Fumigation log updated",
          description: `${payload.areaTreated} on ${payload.date} has been saved.`,
        });
      } else {
        await FumigationLogService.createFumigationLog(payload);
        await onSaved?.();
        toast({
          type: "success",
          title: "Fumigation log created",
          description: `${payload.areaTreated} on ${payload.date} has been recorded.`,
        });
      }

      onClose();
    } catch (err) {
      toast({
        type: "error",
        title:
          mode === "edit"
            ? "Unable to update fumigation log"
            : "Unable to create fumigation log",
        description:
          err instanceof Error ? err.message : "Please try again in a moment.",
      });
    } finally {
      setSaving(false);
    }
  }

  const isEdit = mode === "edit";
  const facilityKnown = facilities.some(
    (item) => item.id === form.facilityId || item.name === form.facilityId
  );
  const duePreview = getFumigationDueStateLabel(form.nextDueDate);

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      title={isEdit ? "Edit fumigation log" : "New fumigation log"}
      description={
        isEdit
          ? "Update treatment details and next due date."
          : "Record a fumigation treatment for a facility area."
      }
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="fumigation-log-form" loading={saving}>
            {isEdit ? "Save changes" : "Create entry"}
          </Button>
        </>
      }
    >
      <form
        id="fumigation-log-form"
        onSubmit={handleSubmit}
        className="grid gap-4 sm:grid-cols-2"
      >
        <FormField
          label={FUMIGATION_LOG_FIELD_LABELS.date}
          htmlFor="fumigation-log-date"
          required
          error={errors.date}
        >
          <input
            id="fumigation-log-date"
            type="date"
            className={inputClassName}
            value={form.date}
            onChange={(event) => updateField("date", event.target.value)}
          />
        </FormField>

        <FormField
          label={FUMIGATION_LOG_FIELD_LABELS.facilityId}
          htmlFor="fumigation-log-facility"
          required
          error={errors.facilityId}
        >
          <select
            id="fumigation-log-facility"
            className={selectClassName}
            value={form.facilityId}
            onChange={(event) => updateField("facilityId", event.target.value)}
            disabled={facilitiesLoading}
          >
            <option value="">
              {facilitiesLoading ? "Loading facilities…" : "Select facility"}
            </option>
            {form.facilityId && !facilityKnown ? (
              <option value={form.facilityId}>{form.facilityId}</option>
            ) : null}
            {facilities.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.id})
              </option>
            ))}
          </select>
        </FormField>

        {isEdit && entry ? (
          <FormField
            label={FUMIGATION_LOG_FIELD_LABELS.id}
            htmlFor="fumigation-log-id"
            hint="Assigned automatically. Cannot be changed."
            className="sm:col-span-2"
          >
            <input
              id="fumigation-log-id"
              className={inputClassName}
              value={entry.id}
              disabled
              readOnly
            />
          </FormField>
        ) : null}

        <FormField
          label={FUMIGATION_LOG_FIELD_LABELS.areaTreated}
          htmlFor="fumigation-log-area"
          required
          error={errors.areaTreated}
          className="sm:col-span-2"
        >
          <input
            id="fumigation-log-area"
            className={inputClassName}
            placeholder="e.g. Kitchen store"
            value={form.areaTreated}
            onChange={(event) => updateField("areaTreated", event.target.value)}
          />
        </FormField>

        <FormField
          label={FUMIGATION_LOG_FIELD_LABELS.pestType}
          htmlFor="fumigation-log-pest"
          required
          error={errors.pestType}
        >
          <input
            id="fumigation-log-pest"
            className={inputClassName}
            placeholder="e.g. Rodents"
            value={form.pestType}
            onChange={(event) => updateField("pestType", event.target.value)}
          />
        </FormField>

        <FormField
          label={FUMIGATION_LOG_FIELD_LABELS.vendor}
          htmlFor="fumigation-log-vendor"
          required
          error={errors.vendor}
        >
          <input
            id="fumigation-log-vendor"
            className={inputClassName}
            placeholder="e.g. PestAway Ltd"
            value={form.vendor}
            onChange={(event) => updateField("vendor", event.target.value)}
          />
        </FormField>

        <FormField
          label={FUMIGATION_LOG_FIELD_LABELS.nextDueDate}
          htmlFor="fumigation-log-next-due"
          required
          error={errors.nextDueDate}
          hint={
            duePreview
              ? `Display state: ${duePreview} (not stored)`
              : "Used to derive Overdue / Due soon / Scheduled in the register."
          }
          className="sm:col-span-2"
        >
          <input
            id="fumigation-log-next-due"
            type="date"
            className={inputClassName}
            value={form.nextDueDate}
            onChange={(event) => updateField("nextDueDate", event.target.value)}
          />
        </FormField>

        <FormField
          label={FUMIGATION_LOG_FIELD_LABELS.remarks}
          htmlFor="fumigation-log-remarks"
          hint="Optional"
          className="sm:col-span-2"
        >
          <textarea
            id="fumigation-log-remarks"
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
