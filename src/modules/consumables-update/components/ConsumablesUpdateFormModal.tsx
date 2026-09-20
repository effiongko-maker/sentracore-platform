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
import { CONSUMABLES_UPDATE_FIELD_LABELS } from "../constants";
import { ConsumablesUpdateService } from "../services/ConsumablesUpdateService";
import {
  calculateConsumablesClosing,
  getConsumablesUpdateFlagLabels,
  toCreateConsumablesUpdateInput,
  toCreateFormValues,
} from "../utils";
import type { ConsumablesUpdate } from "../types";

type FormValues = ReturnType<typeof toCreateFormValues>;

interface ConsumablesUpdateFormModalProps {
  open: boolean;
  mode: "create" | "edit";
  entry?: ConsumablesUpdate | null;
  onClose: () => void;
  onSaved?: () => void | Promise<void>;
}

export function ConsumablesUpdateFormModal({
  open,
  mode,
  entry,
  onClose,
  onSaved,
}: ConsumablesUpdateFormModalProps) {
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

  const displayClosing = useMemo(() => {
    const opening = Number(String(form.opening).trim());
    const issued = Number(String(form.issued).trim());
    const receivedRaw = String(form.received).trim();
    const received = receivedRaw ? Number(receivedRaw) : undefined;
    if (!Number.isFinite(opening) || !Number.isFinite(issued)) return 0;
    if (receivedRaw && !Number.isFinite(received as number)) return 0;
    return calculateConsumablesClosing(opening, issued, received);
  }, [form.opening, form.issued, form.received]);

  const displayReorder = useMemo(() => {
    const raw = String(form.reorderLevel).trim();
    if (raw) {
      const n = Number(raw);
      return Number.isFinite(n) ? n : undefined;
    }
    return mode === "edit" ? entry?.reorderLevel : undefined;
  }, [form.reorderLevel, mode, entry]);

  const flagLabels = useMemo(
    () => getConsumablesUpdateFlagLabels(displayClosing, displayReorder),
    [displayClosing, displayReorder]
  );

  function updateField<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validate() {
    const next: Partial<Record<keyof FormValues, string>> = {};
    if (!form.date.trim()) next.date = "Date is required";
    if (!form.facilityId.trim()) next.facilityId = "Facility ID is required";
    if (!form.itemName.trim()) next.itemName = "Item Name is required";

    const openingRaw = String(form.opening).trim();
    if (!openingRaw) next.opening = "Opening is required";
    else if (!Number.isFinite(Number(openingRaw))) {
      next.opening = "Opening must be a number";
    }

    const issuedRaw = String(form.issued).trim();
    if (!issuedRaw) next.issued = "Issued is required";
    else if (!Number.isFinite(Number(issuedRaw))) {
      next.issued = "Issued must be a number";
    }

    const receivedRaw = String(form.received).trim();
    if (receivedRaw && !Number.isFinite(Number(receivedRaw))) {
      next.received = "Received must be a number";
    }

    const reorderRaw = String(form.reorderLevel).trim();
    if (reorderRaw && !Number.isFinite(Number(reorderRaw))) {
      next.reorderLevel = "Reorder Level must be a number";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = toCreateConsumablesUpdateInput(form);

      if (mode === "edit" && entry) {
        if (!entry.id?.trim()) {
          throw new Error("Cannot update consumables update: missing id.");
        }
        await ConsumablesUpdateService.updateConsumablesUpdate(
          entry.id,
          payload
        );
        await onSaved?.();
        toast({
          type: "success",
          title: "Consumables update saved",
          description: `${payload.itemName} on ${payload.date} has been saved.`,
        });
      } else {
        await ConsumablesUpdateService.createConsumablesUpdate(payload);
        await onSaved?.();
        toast({
          type: "success",
          title: "Consumables update created",
          description: `${payload.itemName} on ${payload.date} has been recorded.`,
        });
      }

      onClose();
    } catch (err) {
      toast({
        type: "error",
        title:
          mode === "edit"
            ? "Unable to update consumables"
            : "Unable to create consumables update",
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
      title={isEdit ? "Edit consumables update" : "New consumables update"}
      description={
        isEdit
          ? "Update stock quantities. Closing is calculated from Opening + Received − Issued."
          : "Record stock movement. Closing is calculated from Opening + Received − Issued."
      }
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="consumables-update-form" loading={saving}>
            {isEdit ? "Save changes" : "Create update"}
          </Button>
        </>
      }
    >
      <form
        id="consumables-update-form"
        onSubmit={handleSubmit}
        className="grid gap-4 sm:grid-cols-2"
      >
        <FormField
          label={CONSUMABLES_UPDATE_FIELD_LABELS.date}
          htmlFor="consumables-date"
          required
          error={errors.date}
        >
          <input
            id="consumables-date"
            type="date"
            className={inputClassName}
            value={form.date}
            onChange={(event) => updateField("date", event.target.value)}
          />
        </FormField>

        <InheritedFacilityField
          open={open}
          id="consumables-facility"
          label={CONSUMABLES_UPDATE_FIELD_LABELS.facilityId}
          value={form.facilityId}
          error={errors.facilityId}
          onResolve={(facilityId) => updateField("facilityId", facilityId)}
        />

        {isEdit && entry ? (
          <>
            <FormField
              label="Entry ID"
              htmlFor="consumables-entry-id"
              hint="Assigned automatically. Cannot be changed."
            >
              <input
                id="consumables-entry-id"
                className={inputClassName}
                value={entry.id}
                disabled
                readOnly
              />
            </FormField>
            <FormField
              label={CONSUMABLES_UPDATE_FIELD_LABELS.itemId}
              htmlFor="consumables-item-id"
              hint="Stable item identity for this facility."
            >
              <input
                id="consumables-item-id"
                className={inputClassName}
                value={entry.itemId}
                disabled
                readOnly
              />
            </FormField>
          </>
        ) : null}

        <FormField
          label={CONSUMABLES_UPDATE_FIELD_LABELS.itemName}
          htmlFor="consumables-item-name"
          required
          error={errors.itemName}
          className="sm:col-span-2"
        >
          <input
            id="consumables-item-name"
            className={inputClassName}
            placeholder="e.g. Nitrile gloves"
            value={form.itemName}
            onChange={(event) => updateField("itemName", event.target.value)}
          />
        </FormField>

        <FormField
          label={CONSUMABLES_UPDATE_FIELD_LABELS.opening}
          htmlFor="consumables-opening"
          required
          error={errors.opening}
        >
          <input
            id="consumables-opening"
            type="number"
            step="any"
            className={inputClassName}
            value={form.opening}
            onChange={(event) => updateField("opening", event.target.value)}
          />
        </FormField>

        <FormField
          label={CONSUMABLES_UPDATE_FIELD_LABELS.received}
          htmlFor="consumables-received"
          error={errors.received}
          hint="Optional"
        >
          <input
            id="consumables-received"
            type="number"
            step="any"
            className={inputClassName}
            value={form.received}
            onChange={(event) => updateField("received", event.target.value)}
          />
        </FormField>

        <FormField
          label={CONSUMABLES_UPDATE_FIELD_LABELS.issued}
          htmlFor="consumables-issued"
          required
          error={errors.issued}
        >
          <input
            id="consumables-issued"
            type="number"
            step="any"
            className={inputClassName}
            value={form.issued}
            onChange={(event) => updateField("issued", event.target.value)}
          />
        </FormField>

        <FormField
          label={CONSUMABLES_UPDATE_FIELD_LABELS.closing}
          htmlFor="consumables-closing"
          hint="Calculated from Opening + Received − Issued. Not editable."
        >
          <input
            id="consumables-closing"
            className={inputClassName}
            value={displayClosing.toFixed(2)}
            disabled
            readOnly
          />
          {flagLabels.length > 0 ? (
            <p className="mt-1 text-xs text-danger">{flagLabels.join(" · ")}</p>
          ) : null}
        </FormField>

        <FormField
          label={CONSUMABLES_UPDATE_FIELD_LABELS.reorderLevel}
          htmlFor="consumables-reorder"
          error={errors.reorderLevel}
          hint="Optional — carried forward from the item's last entry when omitted."
          className="sm:col-span-2"
        >
          <input
            id="consumables-reorder"
            type="number"
            step="any"
            className={inputClassName}
            value={form.reorderLevel}
            onChange={(event) =>
              updateField("reorderLevel", event.target.value)
            }
          />
        </FormField>
      </form>
    </Modal>
  );
}
