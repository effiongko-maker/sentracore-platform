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
import {
  ASSET_CATEGORIES,
  ASSET_CONDITIONS,
  ASSET_CRITICALITIES,
  ASSET_STATUSES,
} from "../constants";
import { AssetService } from "../services/AssetService";
import { labelize, toCreateFormValues } from "../utils";
import type {
  Asset,
  AssetCategory,
  AssetCondition,
  AssetCriticality,
  AssetStatus,
  CreateAssetInput,
} from "../types";

interface AssetFormModalProps {
  open: boolean;
  mode: "create" | "edit";
  asset?: Asset | null;
  onClose: () => void;
  onSaved?: () => void;
}

export function AssetFormModal({
  open,
  mode,
  asset,
  onClose,
  onSaved,
}: AssetFormModalProps) {
  const { toast } = useToast();
  const { facilities, loading: facilitiesLoading } = useFacilityOptions(open);
  const [form, setForm] = useState<CreateAssetInput>(toCreateFormValues());
  const [errors, setErrors] = useState<
    Partial<Record<keyof CreateAssetInput, string>>
  >({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(toCreateFormValues(mode === "edit" ? asset : null));
    setErrors({});
  }, [open, mode, asset]);

  function updateField<K extends keyof CreateAssetInput>(
    key: K,
    value: CreateAssetInput[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validate() {
    const next: Partial<Record<keyof CreateAssetInput, string>> = {};
    if (!form.name.trim()) next.name = "Asset name is required";
    if (!form.facility.trim()) next.facility = "Facility is required";
    if (!form.manufacturer.trim())
      next.manufacturer = "Manufacturer is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const payload: CreateAssetInput = {
        ...form,
        name: form.name.trim(),
        // Asset number is assigned by the platform on create.
        facility: form.facility.trim(),
        manufacturer: form.manufacturer.trim(),
        model: form.model.trim(),
        serialNumber: form.serialNumber.trim(),
        purchaseDate: form.purchaseDate.trim(),
        warrantyExpiry: form.warrantyExpiry.trim(),
        assignedTo: form.assignedTo.trim(),
        description: form.description?.trim() || undefined,
        // Criticality is assessed after registration, not during create.
        criticality:
          mode === "edit" ? form.criticality : ("unassessed" as const),
      };
      delete payload.assetTag;

      if (mode === "edit" && asset) {
        await AssetService.updateAsset(asset.id, payload);
        toast({
          type: "success",
          title: "Asset updated",
          description: `${payload.name} has been saved.`,
        });
      } else {
        await AssetService.createAsset(payload);
        toast({
          type: "success",
          title: "Asset created",
          description: `${payload.name} has been added to the register.`,
        });
      }

      onSaved?.();
      onClose();
    } catch (err) {
      toast({
        type: "error",
        title:
          mode === "edit" ? "Unable to update asset" : "Unable to create asset",
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
      title={isEdit ? "Edit asset" : "New asset"}
      description={
        isEdit
          ? "Update asset details, assignment, and operational status."
          : "Register a new asset. The asset number is assigned automatically."
      }
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="asset-form" loading={saving}>
            {isEdit ? "Save changes" : "Create asset"}
          </Button>
        </>
      }
    >
      <form
        id="asset-form"
        onSubmit={handleSubmit}
        className="grid gap-4 sm:grid-cols-2"
      >
        <FormField
          label="Asset name"
          htmlFor="asset-name"
          required
          error={errors.name}
          className="sm:col-span-2"
        >
          <input
            id="asset-name"
            className={inputClassName}
            placeholder="e.g. Chiller Unit #02"
            value={form.name}
            onChange={(event) => updateField("name", event.target.value)}
          />
        </FormField>

        {isEdit && asset ? (
          <FormField
            label="Asset number"
            htmlFor="asset-tag"
            hint="Assigned automatically. Cannot be changed."
          >
            <input
              id="asset-tag"
              className={inputClassName}
              value={asset.assetTag || asset.id}
              disabled
              readOnly
            />
          </FormField>
        ) : null}

        <FormField label="Category" htmlFor="asset-category" required>
          <select
            id="asset-category"
            className={selectClassName}
            value={form.category}
            onChange={(event) =>
              updateField("category", event.target.value as AssetCategory)
            }
          >
            {ASSET_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {labelize(value)}
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          label="Facility"
          htmlFor="asset-facility"
          required
          error={errors.facility}
        >
          <select
            id="asset-facility"
            className={selectClassName}
            value={form.facility}
            onChange={(event) => updateField("facility", event.target.value)}
            disabled={facilitiesLoading}
          >
            <option value="">
              {facilitiesLoading ? "Loading facilities…" : "Select facility"}
            </option>
            {form.facility &&
            !facilities.some((item) => item.name === form.facility) ? (
              <option value={form.facility}>{form.facility}</option>
            ) : null}
            {facilities.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          label="Manufacturer"
          htmlFor="asset-manufacturer"
          required
          error={errors.manufacturer}
        >
          <input
            id="asset-manufacturer"
            className={inputClassName}
            placeholder="e.g. Carrier"
            value={form.manufacturer}
            onChange={(event) =>
              updateField("manufacturer", event.target.value)
            }
          />
        </FormField>

        <FormField label="Model" htmlFor="asset-model">
          <input
            id="asset-model"
            className={inputClassName}
            placeholder="e.g. 30XA"
            value={form.model}
            onChange={(event) => updateField("model", event.target.value)}
          />
        </FormField>

        <FormField label="Serial number" htmlFor="asset-serial">
          <input
            id="asset-serial"
            className={inputClassName}
            placeholder="e.g. SN-48291"
            value={form.serialNumber}
            onChange={(event) =>
              updateField("serialNumber", event.target.value)
            }
          />
        </FormField>

        <FormField label="Assigned to" htmlFor="asset-assigned">
          <input
            id="asset-assigned"
            className={inputClassName}
            placeholder="e.g. Daniel Mensah"
            value={form.assignedTo}
            onChange={(event) => updateField("assignedTo", event.target.value)}
          />
        </FormField>

        <FormField label="Purchase date" htmlFor="asset-purchase">
          <input
            id="asset-purchase"
            type="date"
            className={inputClassName}
            value={form.purchaseDate}
            onChange={(event) =>
              updateField("purchaseDate", event.target.value)
            }
          />
        </FormField>

        <FormField label="Warranty expiry" htmlFor="asset-warranty">
          <input
            id="asset-warranty"
            type="date"
            className={inputClassName}
            value={form.warrantyExpiry}
            onChange={(event) =>
              updateField("warrantyExpiry", event.target.value)
            }
          />
        </FormField>

        <FormField label="Condition" htmlFor="asset-condition" required>
          <select
            id="asset-condition"
            className={selectClassName}
            value={form.condition}
            onChange={(event) =>
              updateField("condition", event.target.value as AssetCondition)
            }
          >
            {ASSET_CONDITIONS.map((value) => (
              <option key={value} value={value}>
                {labelize(value)}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Status" htmlFor="asset-status" required>
          <select
            id="asset-status"
            className={selectClassName}
            value={form.status}
            onChange={(event) =>
              updateField("status", event.target.value as AssetStatus)
            }
          >
            {ASSET_STATUSES.map((value) => (
              <option key={value} value={value}>
                {labelize(value)}
              </option>
            ))}
          </select>
        </FormField>

        {isEdit ? (
          <FormField label="Criticality" htmlFor="asset-criticality">
            <select
              id="asset-criticality"
              className={selectClassName}
              value={form.criticality}
              onChange={(event) =>
                updateField(
                  "criticality",
                  event.target.value as AssetCriticality
                )
              }
            >
              {ASSET_CRITICALITIES.map((value) => (
                <option key={value} value={value}>
                  {labelize(value)}
                </option>
              ))}
            </select>
          </FormField>
        ) : null}

        <FormField
          label="Description"
          htmlFor="asset-description"
          className="sm:col-span-2"
        >
          <textarea
            id="asset-description"
            className={cnTextarea()}
            rows={3}
            placeholder="Optional asset notes"
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
