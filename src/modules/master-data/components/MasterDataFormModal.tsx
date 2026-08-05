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
import { MasterDataSelect } from "@/components/forms/MasterDataSelect";
import { useFacilityOptions } from "@/hooks/useFacilityOptions";
import { MasterDataService } from "@/services/masterData/MasterDataService";
import {
  MASTER_DATA_STATUSES,
  VENDOR_CATEGORIES,
} from "../constants";
import { entitySingular, labelize, toCreateFormValues } from "../utils";
import type {
  CreateMasterDataInput,
  MasterDataEntity,
  MasterDataItem,
  MasterDataStatus,
} from "../types";

export function MasterDataFormModal({
  open,
  mode,
  entity,
  item,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: "create" | "edit";
  entity: MasterDataEntity;
  item?: MasterDataItem | null;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { toast } = useToast();
  const { facilities } = useFacilityOptions(open);
  const [form, setForm] = useState<CreateMasterDataInput>(
    toCreateFormValues(entity)
  );
  const [errors, setErrors] = useState<{ name?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(toCreateFormValues(entity, mode === "edit" ? item : null));
    setErrors({});
  }, [open, mode, entity, item]);

  function updateField<K extends keyof CreateMasterDataInput>(
    key: K,
    value: CreateMasterDataInput[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    if (key === "name") setErrors({});
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) {
      setErrors({ name: "Name is required" });
      return;
    }

    setSaving(true);
    try {
      const payload: CreateMasterDataInput = {
        ...form,
        entity,
        name: form.name.trim(),
        // Code is system-generated when omitted; never edited from the UI.
        description: form.description?.trim() || undefined,
        facilityId: form.facilityId?.trim() || undefined,
        buildingId: form.buildingId?.trim() || undefined,
        floorId: form.floorId?.trim() || undefined,
        level: form.level?.trim() || undefined,
        category: form.category?.trim() || undefined,
        contactName: form.contactName?.trim() || undefined,
        email: form.email?.trim() || undefined,
        phone: form.phone?.trim() || undefined,
      };
      delete payload.code;

      if (mode === "edit" && item) {
        await MasterDataService.update({ ...payload, id: item.id });
        toast({
          type: "success",
          title: `${entitySingular(entity)} updated`,
        });
      } else {
        await MasterDataService.create(payload);
        toast({
          type: "success",
          title: `${entitySingular(entity)} created`,
        });
      }

      onSaved?.();
      onClose();
    } catch (err) {
      toast({
        type: "error",
        title:
          mode === "edit"
            ? `Unable to update ${entitySingular(entity).toLowerCase()}`
            : `Unable to create ${entitySingular(entity).toLowerCase()}`,
        description:
          err instanceof Error ? err.message : "Please try again in a moment.",
      });
    } finally {
      setSaving(false);
    }
  }

  const singular = entitySingular(entity);
  const showFacility = entity !== "vendors";
  const showBuilding = entity === "floors" || entity === "rooms";
  const showFloor = entity === "rooms";
  const showLevel = entity === "floors";
  const showVendor = entity === "vendors";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "edit" ? `Edit ${singular}` : `New ${singular}`}
      description={
        mode === "edit"
          ? "Update this lookup value. The code cannot be changed."
          : "Create a lookup value. The code is assigned automatically."
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Name" htmlFor="md-name" required error={errors.name}>
          <input
            id="md-name"
            className={inputClassName}
            value={form.name}
            onChange={(event) => updateField("name", event.target.value)}
          />
        </FormField>

        {mode === "edit" && item ? (
          <FormField
            label="Code"
            htmlFor="md-code"
            hint="Assigned automatically. Cannot be changed."
          >
            <input
              id="md-code"
              className={inputClassName}
              value={item.code || item.id}
              disabled
              readOnly
            />
          </FormField>
        ) : null}

        {showFacility ? (
          <FormField label="Facility" htmlFor="md-facility">
            <select
              id="md-facility"
              className={selectClassName}
              value={form.facilityId ?? ""}
              onChange={(event) => {
                updateField("facilityId", event.target.value);
                updateField("buildingId", "");
                updateField("floorId", "");
              }}
            >
              <option value="">Select facility</option>
              {facilities.map((facility) => (
                <option key={facility.id} value={facility.id}>
                  {facility.name}
                </option>
              ))}
            </select>
          </FormField>
        ) : null}

        {showBuilding ? (
          <FormField label="Building" htmlFor="md-building">
            <MasterDataSelect
              id="md-building"
              entity="buildings"
              value={form.buildingId ?? ""}
              facilityId={form.facilityId || undefined}
              enabled={open}
              emptyOptionLabel="Select building"
              onChange={(value) => {
                updateField("buildingId", value);
                updateField("floorId", "");
              }}
            />
          </FormField>
        ) : null}

        {showFloor ? (
          <FormField label="Floor" htmlFor="md-floor">
            <MasterDataSelect
              id="md-floor"
              entity="floors"
              value={form.floorId ?? ""}
              facilityId={form.facilityId || undefined}
              buildingId={form.buildingId || undefined}
              enabled={open}
              emptyOptionLabel="Select floor"
              onChange={(value) => updateField("floorId", value)}
            />
          </FormField>
        ) : null}

        {showLevel ? (
          <FormField label="Level" htmlFor="md-level">
            <input
              id="md-level"
              className={inputClassName}
              placeholder="e.g. G, 1, 2, B1"
              value={form.level ?? ""}
              onChange={(event) => updateField("level", event.target.value)}
            />
          </FormField>
        ) : null}

        {showVendor ? (
          <>
            <FormField label="Category" htmlFor="md-category">
              <select
                id="md-category"
                className={selectClassName}
                value={form.category ?? ""}
                onChange={(event) =>
                  updateField("category", event.target.value)
                }
              >
                <option value="">Select category</option>
                {VENDOR_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Contact name" htmlFor="md-contact">
              <input
                id="md-contact"
                className={inputClassName}
                value={form.contactName ?? ""}
                onChange={(event) =>
                  updateField("contactName", event.target.value)
                }
              />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Email" htmlFor="md-email">
                <input
                  id="md-email"
                  type="email"
                  className={inputClassName}
                  value={form.email ?? ""}
                  onChange={(event) => updateField("email", event.target.value)}
                />
              </FormField>
              <FormField label="Phone" htmlFor="md-phone">
                <input
                  id="md-phone"
                  className={inputClassName}
                  value={form.phone ?? ""}
                  onChange={(event) => updateField("phone", event.target.value)}
                />
              </FormField>
            </div>
          </>
        ) : null}

        <FormField label="Status" htmlFor="md-status">
          <select
            id="md-status"
            className={selectClassName}
            value={form.status ?? "active"}
            onChange={(event) =>
              updateField("status", event.target.value as MasterDataStatus)
            }
          >
            {MASTER_DATA_STATUSES.map((value) => (
              <option key={value} value={value}>
                {labelize(value)}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Description" htmlFor="md-description">
          <textarea
            id="md-description"
            className={inputClassName}
            rows={3}
            value={form.description ?? ""}
            onChange={(event) =>
              updateField("description", event.target.value)
            }
          />
        </FormField>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {mode === "edit" ? "Save changes" : `Create ${singular}`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
