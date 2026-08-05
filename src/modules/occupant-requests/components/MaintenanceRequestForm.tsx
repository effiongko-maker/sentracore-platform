"use client";

import { useState } from "react";
import {
  FormField,
  inputClassName,
  selectClassName,
} from "@/components/forms/FormField";
import { MasterDataSelect } from "@/components/forms/MasterDataSelect";
import { MasterLocationFields } from "@/components/forms/MasterLocationFields";
import { Button } from "@/components/ui/Button";
import type { Facility } from "@/modules/facilities/types";
import type { MaintenancePriority } from "@/modules/maintenance/types";
import {
  MAINTENANCE_REQUEST_CATEGORIES,
  OCCUPANT_PRIORITIES,
} from "../constants";
import type { MaintenanceRequestFormValues } from "../types";
import { emptyMaintenanceForm } from "../utils";

function labelize(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function MaintenanceRequestForm({
  facilities: _facilities,
  submitting,
  onSubmit,
}: {
  facilities: Facility[];
  submitting: boolean;
  onSubmit: (values: MaintenanceRequestFormValues) => Promise<void> | void;
}) {
  const [form, setForm] = useState<MaintenanceRequestFormValues>(
    emptyMaintenanceForm
  );
  const [errors, setErrors] = useState<
    Partial<Record<keyof MaintenanceRequestFormValues, string>>
  >({});

  function patch<K extends keyof MaintenanceRequestFormValues>(
    key: K,
    value: MaintenanceRequestFormValues[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors: Partial<
      Record<keyof MaintenanceRequestFormValues, string>
    > = {};
    if (!form.title.trim()) nextErrors.title = "Title is required.";
    if (!form.description.trim())
      nextErrors.description = "Description is required.";
    if (!form.facilityId) nextErrors.facilityId = "Select a facility.";
    if (!form.location.trim()) nextErrors.location = "Location is required.";
    if (!form.category) nextErrors.category = "Select a category.";
    if (!form.priority) nextErrors.priority = "Select a priority.";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    await onSubmit(form);
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
      <FormField label="Title" htmlFor="maint-title" required error={errors.title}>
        <input
          id="maint-title"
          className={inputClassName}
          value={form.title}
          onChange={(e) => patch("title", e.target.value)}
          placeholder="e.g. Air conditioning not cooling in Zone B"
          disabled={submitting}
        />
      </FormField>

      <FormField
        label="Description"
        htmlFor="maint-description"
        required
        error={errors.description}
      >
        <textarea
          id="maint-description"
          className={`${inputClassName} h-28 resize-y py-2.5`}
          value={form.description}
          onChange={(e) => patch("description", e.target.value)}
          placeholder="Describe the issue and any impact on occupants."
          disabled={submitting}
        />
      </FormField>

      <MasterLocationFields
        facilityId={form.facilityId}
        onFacilityChange={(facilityId) => patch("facilityId", facilityId)}
        value={form.location}
        onChange={(value) => patch("location", value)}
        disabled={submitting}
        required
        error={errors.location}
        facilityError={errors.facilityId}
        hint="Facility → building → floor → room from Master Data."
      />

      <FormField label="Department" htmlFor="maint-department">
        <MasterDataSelect
          id="maint-department"
          entity="departments"
          valueMode="name"
          value={form.department}
          onChange={(value) => patch("department", value)}
          facilityId={form.facilityId || undefined}
          disabled={submitting}
          emptyOptionLabel="Select department"
          loadingPlaceholder="Loading departments…"
          aria-label="Department"
        />
      </FormField>

      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          label="Priority"
          htmlFor="maint-priority"
          required
          error={errors.priority}
        >
          <select
            id="maint-priority"
            className={selectClassName}
            value={form.priority}
            onChange={(e) =>
              patch("priority", e.target.value as MaintenancePriority)
            }
            disabled={submitting}
          >
            {OCCUPANT_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {labelize(priority)}
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          label="Category"
          htmlFor="maint-category"
          required
          error={errors.category}
        >
          <select
            id="maint-category"
            className={selectClassName}
            value={form.category}
            onChange={(e) => patch("category", e.target.value)}
            disabled={submitting}
          >
            {MAINTENANCE_REQUEST_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <FormField
        label="Attachment"
        htmlFor="maint-attachment"
        hint="Optional. File upload storage will be connected later; the filename is recorded with the request."
      >
        <input
          id="maint-attachment"
          type="file"
          className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent-soft file:px-3 file:py-2 file:text-sm file:font-medium file:text-accent"
          onChange={(e) => patch("attachment", e.target.files?.[0] ?? null)}
          disabled={submitting}
        />
      </FormField>

      <div className="flex justify-end border-t border-border/70 pt-5">
        <Button type="submit" size="lg" loading={submitting}>
          Submit maintenance request
        </Button>
      </div>
    </form>
  );
}
