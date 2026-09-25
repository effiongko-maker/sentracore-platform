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
import { InheritedFacilityField } from "@/components/operational/InheritedFacilityField";
import { DIESEL_USAGE_FIELD_LABELS } from "../constants";
import { DieselUsageService } from "../services/DieselUsageService";
import {
  calculateDieselConsumption,
  getDieselUsageFlagLabels,
  toCreateDieselUsageInput,
  toCreateFormValues,
} from "../utils";
import type { DieselUsage } from "../types";

type FormValues = ReturnType<typeof toCreateFormValues>;

interface DieselUsageFormModalProps {
  open: boolean;
  mode: "create" | "edit";
  entry?: DieselUsage | null;
  onClose: () => void;
  onSaved?: () => void | Promise<void>;
}

export function DieselUsageFormModal({
  open,
  mode,
  entry,
  onClose,
  onSaved,
}: DieselUsageFormModalProps) {
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

  const num = (v: string) => {
    const raw = String(v).trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  // Arithmetic suggestion only — consumption is stored exactly as entered (readings may legitimately differ).
  const calculatedConsumption = useMemo(
    () => calculateDieselConsumption(num(form.openingLevel), num(form.closingLevel), num(form.added)),
    [form.openingLevel, form.closingLevel, form.added]
  );

  const flagLabels = useMemo(
    () => getDieselUsageFlagLabels(num(form.consumption), entry?.recordOrigin),
    [form.consumption, entry?.recordOrigin]
  );
  const isHistorical = mode === "edit" && entry?.recordOrigin === "migrated_historical";

  function updateField<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validate() {
    const next: Partial<Record<keyof FormValues, string>> = {};
    if (!form.date.trim()) next.date = "Date is required";
    if (!form.facilityId.trim()) next.facilityId = "Facility ID is required";
    if (!isHistorical && !form.generatorId.trim()) next.generatorId = "Generator ID is required";

    // Each value is optional and stored as recorded; blank = not recorded. No arithmetic equality is required.
    const numeric: Array<[keyof FormValues, string]> = [
      ["openingLevel", "Opening level"],
      ["undergroundTankQty", "Underground tank"],
      ["surfaceTankQty", "Surface tank"],
      ["added", "Added"],
      ["closingLevel", "Closing level"],
      ["consumption", "Consumption"],
    ];
    for (const [key, label] of numeric) {
      const raw = String(form[key]).trim();
      if (raw && (!Number.isFinite(Number(raw)) || Number(raw) < 0)) next[key] = `${label} must be a non-negative number`;
    }
    const observed = (["openingLevel", "closingLevel", "consumption", "undergroundTankQty", "surfaceTankQty"] as const)
      .some((key) => String(form[key]).trim() !== "");
    if (!observed) next.openingLevel = "Record at least one observation: a tank level, a tank quantity or consumption";

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = toCreateDieselUsageInput(form);

      if (mode === "edit" && entry) {
        if (!entry.id?.trim()) {
          throw new Error("Cannot update diesel usage: missing id.");
        }
        await DieselUsageService.updateDieselUsage(entry.id, payload);
        await onSaved?.();
        toast({
          type: "success",
          title: "Diesel usage updated",
          description: `${payload.generatorId || "Whole-site tank"} on ${payload.date} has been saved.`,
        });
      } else {
        await DieselUsageService.createDieselUsage(payload);
        await onSaved?.();
        toast({
          type: "success",
          title: "Diesel usage created",
          description: `${payload.generatorId} on ${payload.date} has been recorded.`,
        });
      }

      onClose();
    } catch (err) {
      toast({
        type: "error",
        title:
          mode === "edit"
            ? "Unable to update diesel usage"
            : "Unable to create diesel usage",
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
      title={isEdit ? "Edit diesel usage" : "New diesel usage"}
      description={
        isEdit
          ? "Update the recorded readings. Leave a value blank if it was not recorded."
          : "Record the tank readings and consumption as measured. Leave a value blank if it was not recorded."
      }
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="diesel-usage-form" loading={saving}>
            {isEdit ? "Save changes" : "Create entry"}
          </Button>
        </>
      }
    >
      <form
        id="diesel-usage-form"
        onSubmit={handleSubmit}
        className="grid gap-4 sm:grid-cols-2"
      >
        <FormField
          label={DIESEL_USAGE_FIELD_LABELS.date}
          htmlFor="diesel-usage-date"
          required
          error={errors.date}
        >
          <input
            id="diesel-usage-date"
            type="date"
            className={inputClassName}
            value={form.date}
            onChange={(event) => updateField("date", event.target.value)}
          />
        </FormField>

        <InheritedFacilityField
          open={open}
          id="diesel-usage-facility"
          label={DIESEL_USAGE_FIELD_LABELS.facilityId}
          value={form.facilityId}
          error={errors.facilityId}
          onResolve={(facilityId) => updateField("facilityId", facilityId)}
        />

        {isEdit && entry ? (
          <FormField
            label="Entry ID"
            htmlFor="diesel-usage-id"
            hint="Assigned automatically. Cannot be changed."
            className="sm:col-span-2"
          >
            <input
              id="diesel-usage-id"
              className={inputClassName}
              value={entry.id}
              disabled
              readOnly
            />
          </FormField>
        ) : null}

        <FormField
          label={DIESEL_USAGE_FIELD_LABELS.generatorId}
          htmlFor="diesel-usage-generator"
          required={!isHistorical}
          hint={isHistorical ? "Whole-site tank observation — no generator recorded" : undefined}
          error={errors.generatorId}
          className="sm:col-span-2"
        >
          <input
            id="diesel-usage-generator"
            className={inputClassName}
            placeholder="e.g. Gen-01"
            value={form.generatorId}
            onChange={(event) => updateField("generatorId", event.target.value)}
          />
        </FormField>

        <FormField
          label={DIESEL_USAGE_FIELD_LABELS.openingLevel}
          htmlFor="diesel-usage-opening"
          error={errors.openingLevel}
        >
          <input
            id="diesel-usage-opening"
            type="number"
            step="any"
            className={inputClassName}
            placeholder="e.g. 400"
            value={form.openingLevel}
            onChange={(event) => updateField("openingLevel", event.target.value)}
          />
        </FormField>

        <FormField
          label={DIESEL_USAGE_FIELD_LABELS.undergroundTankQty}
          htmlFor="diesel-usage-underground"
          error={errors.undergroundTankQty}
          hint="Optional — as measured"
        >
          <input
            id="diesel-usage-underground"
            type="number"
            min={0}
            step="any"
            className={inputClassName}
            value={form.undergroundTankQty}
            onChange={(event) => updateField("undergroundTankQty", event.target.value)}
          />
        </FormField>

        <FormField
          label={DIESEL_USAGE_FIELD_LABELS.surfaceTankQty}
          htmlFor="diesel-usage-surface"
          error={errors.surfaceTankQty}
          hint="Optional"
        >
          <input
            id="diesel-usage-surface"
            type="number"
            min={0}
            step="any"
            className={inputClassName}
            value={form.surfaceTankQty}
            onChange={(event) => updateField("surfaceTankQty", event.target.value)}
          />
        </FormField>

        <FormField
          label={DIESEL_USAGE_FIELD_LABELS.added}
          htmlFor="diesel-usage-added"
          error={errors.added}
          hint="Optional"
        >
          <input
            id="diesel-usage-added"
            type="number"
            step="any"
            className={inputClassName}
            placeholder="e.g. 50"
            value={form.added}
            onChange={(event) => updateField("added", event.target.value)}
          />
        </FormField>

        <FormField
          label={DIESEL_USAGE_FIELD_LABELS.closingLevel}
          htmlFor="diesel-usage-closing"
          error={errors.closingLevel}
        >
          <input
            id="diesel-usage-closing"
            type="number"
            step="any"
            className={inputClassName}
            placeholder="e.g. 320"
            value={form.closingLevel}
            onChange={(event) => updateField("closingLevel", event.target.value)}
          />
        </FormField>

        <FormField
          label={DIESEL_USAGE_FIELD_LABELS.consumption}
          htmlFor="diesel-usage-consumption"
          error={errors.consumption}
          hint="As recorded. Blank = not recorded."
        >
          <input
            id="diesel-usage-consumption"
            type="number"
            min={0}
            step="any"
            className={inputClassName}
            value={form.consumption}
            onChange={(event) => updateField("consumption", event.target.value)}
          />
          {calculatedConsumption != null && String(calculatedConsumption) !== String(form.consumption).trim() ? (
            <button
              type="button"
              className="mt-1 text-xs text-primary underline-offset-2 hover:underline"
              onClick={() => updateField("consumption", String(calculatedConsumption))}
            >
              Use calculated {calculatedConsumption} L (opening + added − closing)
            </button>
          ) : null}
          {flagLabels.length > 0 ? (
            <p className="mt-1 text-xs text-danger">{flagLabels.join(" · ")}</p>
          ) : null}
        </FormField>
      </form>
    </Modal>
  );
}
