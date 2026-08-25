"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/modals/Modal";
import { Button } from "@/components/ui/Button";
import {
  FormField,
  inputClassName,
  selectClassName,
} from "@/components/forms/FormField";
import { MasterDataSelect } from "@/components/forms/MasterDataSelect";
import { useToast } from "@/components/ui/Toast";
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

function nameLabel(entity: MasterDataEntity) {
  switch (entity) {
    case "departments":
      return "Department name";
    case "buildings":
      return "Building name";
    case "floors":
      return "Floor name";
    case "rooms":
      return "Room name";
    case "vendors":
      return "Vendor name";
  }
}

function createDescription(entity: MasterDataEntity) {
  switch (entity) {
    case "departments":
      return "Add a department to the Master Data register.";
    case "buildings":
      return "Add a building and link it to a facility.";
    case "floors":
      return "Add a floor within a facility and building.";
    case "rooms":
      return "Add a room within a facility, building, and floor.";
    case "vendors":
      return "Add a vendor with contact details and category.";
  }
}

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
  onSaved?: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const { facilities, loading: facilitiesLoading } = useFacilityOptions(open);
  const [form, setForm] = useState<CreateMasterDataInput>(
    toCreateFormValues(entity)
  );
  const [errors, setErrors] = useState<
    Partial<Record<keyof CreateMasterDataInput, string>>
  >({});
  const [saving, setSaving] = useState(false);
  const submitLock = useRef(false);

  useEffect(() => {
    if (!open) return;
    setForm(toCreateFormValues(entity, mode === "edit" ? item : null));
    setErrors({});
    submitLock.current = false;
  }, [open, mode, entity, item]);

  function updateField<K extends keyof CreateMasterDataInput>(
    key: K,
    value: CreateMasterDataInput[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validate() {
    const next: Partial<Record<keyof CreateMasterDataInput, string>> = {};
    if (!form.name.trim()) next.name = `${nameLabel(entity)} is required`;

    if (entity === "buildings" || entity === "floors" || entity === "rooms") {
      if (!form.facilityId?.trim()) next.facilityId = "Facility is required";
    }
    if (entity === "floors" || entity === "rooms") {
      if (!form.buildingId?.trim()) next.buildingId = "Building is required";
    }
    if (entity === "rooms") {
      if (!form.floorId?.trim()) next.floorId = "Floor is required";
    }
    if (entity === "vendors" && form.email?.trim()) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
        next.email = "Enter a valid email address";
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitLock.current || saving) return;
    if (!validate()) return;

    submitLock.current = true;
    setSaving(true);
    try {
      const payload: CreateMasterDataInput = {
        ...form,
        entity,
        name: form.name.trim(),
        code: form.code?.trim() || undefined,
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

      if (mode === "edit" && item) {
        await MasterDataService.update({ ...payload, id: item.id });
        await onSaved?.();
        toast({
          type: "success",
          title: `${entitySingular(entity)} updated`,
          description: `${payload.name} has been saved.`,
        });
      } else {
        await MasterDataService.create(payload);
        await onSaved?.();
        toast({
          type: "success",
          title: `${entitySingular(entity)} created`,
          description: `${payload.name} has been added to the register.`,
        });
      }

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
      submitLock.current = false;
    }
  }

  const singular = entitySingular(entity);
  const isEdit = mode === "edit";
  const showFacility =
    entity === "buildings" || entity === "floors" || entity === "rooms";
  const showBuilding = entity === "floors" || entity === "rooms";
  const showFloor = entity === "rooms";
  const showLevel = entity === "floors";
  const showVendor = entity === "vendors";
  const formId = `master-data-${entity}-form`;

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      title={isEdit ? `Edit ${singular.toLowerCase()}` : `New ${singular.toLowerCase()}`}
      description={
        isEdit
          ? `Update ${singular.toLowerCase()} details. The code cannot be changed.`
          : createDescription(entity)
      }
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            loading={saving}
            disabled={saving}
          >
            {isEdit ? "Save changes" : `Create ${singular.toLowerCase()}`}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={handleSubmit}
        className="grid gap-4 sm:grid-cols-2"
      >
        <FormField
          label={nameLabel(entity)}
          htmlFor="md-name"
          required
          error={errors.name}
          className="sm:col-span-2"
        >
          <input
            id="md-name"
            className={inputClassName}
            placeholder={`e.g. ${singular}`}
            value={form.name}
            onChange={(event) => updateField("name", event.target.value)}
          />
        </FormField>

        {showFacility ? (
          <FormField
            label="Facility"
            htmlFor="md-facility"
            required
            error={errors.facilityId}
          >
            <select
              id="md-facility"
              className={selectClassName}
              value={form.facilityId ?? ""}
              disabled={facilitiesLoading}
              onChange={(event) => {
                updateField("facilityId", event.target.value);
                updateField("buildingId", "");
                updateField("floorId", "");
              }}
            >
              <option value="">
                {facilitiesLoading ? "Loading facilities…" : "Select facility"}
              </option>
              {facilities.map((facility) => (
                <option key={facility.id} value={facility.id}>
                  {facility.name}
                </option>
              ))}
            </select>
          </FormField>
        ) : null}

        {showBuilding ? (
          <FormField
            label="Building"
            htmlFor="md-building"
            required
            error={errors.buildingId}
          >
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
          <FormField
            label="Floor"
            htmlFor="md-floor"
            required
            error={errors.floorId}
          >
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
                placeholder="e.g. Ada Okonkwo"
                value={form.contactName ?? ""}
                onChange={(event) =>
                  updateField("contactName", event.target.value)
                }
              />
            </FormField>
            <FormField
              label="Email"
              htmlFor="md-email"
              error={errors.email}
            >
              <input
                id="md-email"
                type="email"
                className={inputClassName}
                placeholder="name@company.com"
                value={form.email ?? ""}
                onChange={(event) => updateField("email", event.target.value)}
              />
            </FormField>
            <FormField label="Phone" htmlFor="md-phone">
              <input
                id="md-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                className={inputClassName}
                placeholder="e.g. 08077960315"
                value={form.phone ?? ""}
                onChange={(event) => updateField("phone", event.target.value)}
              />
            </FormField>
          </>
        ) : null}

        <FormField
          label="Code"
          htmlFor="md-code"
          hint={
            isEdit
              ? "Assigned automatically. Cannot be changed."
              : "Leave blank to auto-assign."
          }
        >
          <input
            id="md-code"
            className={inputClassName}
            placeholder="Auto-assigned if blank"
            value={isEdit ? item?.code || item?.id || "" : form.code ?? ""}
            disabled={isEdit}
            readOnly={isEdit}
            onChange={(event) => updateField("code", event.target.value)}
          />
        </FormField>

        <FormField label="Status" htmlFor="md-status" required>
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

        <FormField
          label="Description"
          htmlFor="md-description"
          className="sm:col-span-2"
        >
          <textarea
            id="md-description"
            className={inputClassName}
            rows={3}
            placeholder="Optional notes"
            value={form.description ?? ""}
            onChange={(event) =>
              updateField("description", event.target.value)
            }
          />
        </FormField>
      </form>
    </Modal>
  );
}
