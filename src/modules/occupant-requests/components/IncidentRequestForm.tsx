"use client";

import { useState } from "react";
import {
  FormField,
  inputClassName,
  selectClassName,
} from "@/components/forms/FormField";
import { MasterLocationFields } from "@/components/forms/MasterLocationFields";
import { Button } from "@/components/ui/Button";
import type { Facility } from "@/modules/facilities/types";
import type { IncidentSeverity } from "@/modules/incidents/types";
import { OCCUPANT_SEVERITIES } from "../constants";
import type { IncidentRequestFormValues } from "../types";
import { emptyIncidentForm } from "../utils";

function labelize(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function IncidentRequestForm({
  facilities: _facilities,
  submitting,
  onSubmit,
}: {
  facilities: Facility[];
  submitting: boolean;
  onSubmit: (values: IncidentRequestFormValues) => Promise<void> | void;
}) {
  const [form, setForm] = useState<IncidentRequestFormValues>(emptyIncidentForm);
  const [errors, setErrors] = useState<
    Partial<Record<keyof IncidentRequestFormValues, string>>
  >({});

  function patch<K extends keyof IncidentRequestFormValues>(
    key: K,
    value: IncidentRequestFormValues[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors: Partial<Record<keyof IncidentRequestFormValues, string>> =
      {};
    if (!form.title.trim()) nextErrors.title = "Title is required.";
    if (!form.description.trim())
      nextErrors.description = "Description is required.";
    if (!form.facilityId) nextErrors.facilityId = "Select a facility.";
    if (!form.location.trim()) nextErrors.location = "Location is required.";
    if (!form.severity) nextErrors.severity = "Select a severity.";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    await onSubmit(form);
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
      <FormField label="Title" htmlFor="inc-title" required error={errors.title}>
        <input
          id="inc-title"
          className={inputClassName}
          value={form.title}
          onChange={(e) => patch("title", e.target.value)}
          placeholder="e.g. Water leak near main lobby entrance"
          disabled={submitting}
        />
      </FormField>

      <FormField
        label="Description"
        htmlFor="inc-description"
        required
        error={errors.description}
      >
        <textarea
          id="inc-description"
          className={`${inputClassName} h-28 resize-y py-2.5`}
          value={form.description}
          onChange={(e) => patch("description", e.target.value)}
          placeholder="Describe what happened, when it was noticed, and any immediate risk."
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

      <FormField
        label="Severity"
        htmlFor="inc-severity"
        required
        error={errors.severity}
      >
        <select
          id="inc-severity"
          className={selectClassName}
          value={form.severity}
          onChange={(e) =>
            patch("severity", e.target.value as IncidentSeverity)
          }
          disabled={submitting}
        >
          {OCCUPANT_SEVERITIES.map((severity) => (
            <option key={severity} value={severity}>
              {labelize(severity)}
            </option>
          ))}
        </select>
      </FormField>

      <FormField
        label="Attachment"
        htmlFor="inc-attachment"
        hint="Optional. File upload storage will be connected later; the filename is recorded with the report."
      >
        <input
          id="inc-attachment"
          type="file"
          className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent-soft file:px-3 file:py-2 file:text-sm file:font-medium file:text-accent"
          onChange={(e) => patch("attachment", e.target.files?.[0] ?? null)}
          disabled={submitting}
        />
      </FormField>

      <div className="flex justify-end border-t border-border/70 pt-5">
        <Button type="submit" size="lg" loading={submitting}>
          Submit incident report
        </Button>
      </div>
    </form>
  );
}
