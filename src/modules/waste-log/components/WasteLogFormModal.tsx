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
import { WASTE_LOG_FIELD_LABELS } from "../constants";
import { WasteLogService } from "../services/WasteLogService";
import {
  toCreateFormValues,
  toCreateWasteLogInput,
  validateWasteLogFormValues,
} from "../utils";
import type { WasteLog } from "../types";

type FormValues = ReturnType<typeof toCreateFormValues>;

interface WasteLogFormModalProps {
  open: boolean;
  mode: "create" | "edit";
  entry?: WasteLog | null;
  onClose: () => void;
  onSaved?: () => void | Promise<void>;
}

export function WasteLogFormModal({
  open,
  mode,
  entry,
  onClose,
  onSaved,
}: WasteLogFormModalProps) {
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
    const next = validateWasteLogFormValues(form);
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = toCreateWasteLogInput(form);

      if (mode === "edit" && entry) {
        if (!entry.id?.trim()) {
          throw new Error("Cannot update waste log: missing id.");
        }
        await WasteLogService.updateWasteLog(entry.id, payload);
        await onSaved?.();
        toast({
          type: "success",
          title: "Waste log updated",
          description: `${payload.wasteType} on ${payload.date} has been saved.`,
        });
      } else {
        await WasteLogService.createWasteLog(payload);
        await onSaved?.();
        toast({
          type: "success",
          title: "Waste log created",
          description: `${payload.wasteType} on ${payload.date} has been recorded.`,
        });
      }

      onClose();
    } catch (err) {
      toast({
        type: "error",
        title:
          mode === "edit"
            ? "Unable to update waste log"
            : "Unable to create waste log",
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

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      title={isEdit ? "Edit waste log" : "New waste log"}
      description={
        isEdit
          ? "Update waste type, quantity, unit, and disposal details."
          : "Record waste disposal for a facility."
      }
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="waste-log-form" loading={saving}>
            {isEdit ? "Save changes" : "Create entry"}
          </Button>
        </>
      }
    >
      <form
        id="waste-log-form"
        onSubmit={handleSubmit}
        className="grid gap-4 sm:grid-cols-2"
      >
        <FormField
          label={WASTE_LOG_FIELD_LABELS.date}
          htmlFor="waste-log-date"
          required
          error={errors.date}
        >
          <input
            id="waste-log-date"
            type="date"
            className={inputClassName}
            value={form.date}
            onChange={(event) => updateField("date", event.target.value)}
          />
        </FormField>

        <FormField
          label={WASTE_LOG_FIELD_LABELS.facilityId}
          htmlFor="waste-log-facility"
          required
          error={errors.facilityId}
        >
          <select
            id="waste-log-facility"
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
            label={WASTE_LOG_FIELD_LABELS.id}
            htmlFor="waste-log-id"
            hint="Assigned automatically. Cannot be changed."
            className="sm:col-span-2"
          >
            <input
              id="waste-log-id"
              className={inputClassName}
              value={entry.id}
              disabled
              readOnly
            />
          </FormField>
        ) : null}

        <FormField
          label={WASTE_LOG_FIELD_LABELS.wasteType}
          htmlFor="waste-log-type"
          required
          error={errors.wasteType}
          className="sm:col-span-2"
        >
          <input
            id="waste-log-type"
            className={inputClassName}
            placeholder="e.g. General, Recyclable"
            value={form.wasteType}
            onChange={(event) => updateField("wasteType", event.target.value)}
          />
        </FormField>

        <FormField
          label={WASTE_LOG_FIELD_LABELS.quantity}
          htmlFor="waste-log-quantity"
          required
          error={errors.quantity}
        >
          <input
            id="waste-log-quantity"
            type="number"
            step="any"
            className={inputClassName}
            placeholder="e.g. 12"
            value={form.quantity}
            onChange={(event) => updateField("quantity", event.target.value)}
          />
        </FormField>

        <FormField
          label={WASTE_LOG_FIELD_LABELS.unit}
          htmlFor="waste-log-unit"
          required
          error={errors.unit}
        >
          <input
            id="waste-log-unit"
            className={inputClassName}
            placeholder="e.g. kg, bags"
            value={form.unit}
            onChange={(event) => updateField("unit", event.target.value)}
          />
        </FormField>

        <FormField
          label={WASTE_LOG_FIELD_LABELS.disposalMethod}
          htmlFor="waste-log-disposal"
          required
          error={errors.disposalMethod}
          className="sm:col-span-2"
        >
          <input
            id="waste-log-disposal"
            className={inputClassName}
            placeholder="e.g. Landfill, Recycled"
            value={form.disposalMethod}
            onChange={(event) =>
              updateField("disposalMethod", event.target.value)
            }
          />
        </FormField>

        <FormField
          label={WASTE_LOG_FIELD_LABELS.remarks}
          htmlFor="waste-log-remarks"
          hint="Optional"
          className="sm:col-span-2"
        >
          <textarea
            id="waste-log-remarks"
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
