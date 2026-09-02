import {
  FormField,
  inputClassName,
} from "@/components/forms/FormField";
import type { CostSubmissionPackage } from "@/lib/operational/finance/types";
import {
  SUBMISSION_KIND_SUGGESTIONS,
  SUBMISSION_PACKAGE_TYPE_SUGGESTIONS,
} from "../constants";

export type SubmissionDetailsValues = {
  submissionKind: string;
  periodLabel: string;
  packageReference: string;
  packageType: string;
  packageDate: string;
  packageNotes: string;
  notes: string;
};

export function emptySubmissionDetails(): SubmissionDetailsValues {
  return {
    submissionKind: "",
    periodLabel: "",
    packageReference: "",
    packageType: "",
    packageDate: "",
    packageNotes: "",
    notes: "",
  };
}

export function detailsFromPackage(
  submissionKind?: string,
  periodLabel?: string,
  submissionPackage?: CostSubmissionPackage,
  notes?: string
): SubmissionDetailsValues {
  return {
    submissionKind: submissionKind ?? "",
    periodLabel: periodLabel ?? "",
    packageReference: submissionPackage?.reference ?? "",
    packageType: submissionPackage?.packageType ?? "",
    packageDate: submissionPackage?.packageDate?.slice(0, 10) ?? "",
    packageNotes: submissionPackage?.notes ?? "",
    notes: notes ?? "",
  };
}

export function detailsToPackage(
  values: SubmissionDetailsValues
): CostSubmissionPackage | undefined {
  const pkg: CostSubmissionPackage = {
    reference: values.packageReference.trim() || undefined,
    packageType: values.packageType.trim() || undefined,
    packageDate: values.packageDate.trim() || undefined,
    notes: values.packageNotes.trim() || undefined,
  };
  const hasContent = Boolean(
    pkg.reference || pkg.packageType || pkg.packageDate || pkg.notes
  );
  return hasContent ? pkg : undefined;
}

export function SubmissionDetailsForm({
  values,
  onChange,
}: {
  values: SubmissionDetailsValues;
  onChange: (patch: Partial<SubmissionDetailsValues>) => void;
}) {
  return (
    <div className="fin-submission-step">
      <p className="fin-section-lede">
        Provide the submission context. Facility is inferred from the selected
        costs — no facility selection is required for this deployment.
      </p>

      <div className="fin-submission-form-grid mt-4">
        <FormField label="Submission kind" htmlFor="submissionKind">
          <input
            id="submissionKind"
            list="submission-kind-suggestions"
            className={inputClassName}
            value={values.submissionKind}
            onChange={(event) =>
              onChange({ submissionKind: event.target.value })
            }
            placeholder="e.g. Monthly contractual"
          />
          <datalist id="submission-kind-suggestions">
            {SUBMISSION_KIND_SUGGESTIONS.map((kind) => (
              <option key={kind} value={kind} />
            ))}
          </datalist>
        </FormField>

        <FormField label="Period label" htmlFor="periodLabel">
          <input
            id="periodLabel"
            className={inputClassName}
            value={values.periodLabel}
            onChange={(event) => onChange({ periodLabel: event.target.value })}
            placeholder="e.g. January 2026"
          />
        </FormField>
      </div>

      <h3 className="fin-section-title mt-6">Supporting package</h3>
      <p className="fin-section-lede">
        Submission-level documentation references — separate from individual
        cost evidence. File upload for package documents is not yet supported
        on the submission API; record references and notes only.
      </p>

      <div className="fin-submission-form-grid mt-4">
        <FormField label="Package reference" htmlFor="packageReference">
          <input
            id="packageReference"
            className={inputClassName}
            value={values.packageReference}
            onChange={(event) =>
              onChange({ packageReference: event.target.value })
            }
            placeholder="Cover sheet or batch reference"
          />
        </FormField>

        <FormField label="Package type" htmlFor="packageType">
          <input
            id="packageType"
            list="package-type-suggestions"
            className={inputClassName}
            value={values.packageType}
            onChange={(event) => onChange({ packageType: event.target.value })}
            placeholder="e.g. Cover sheet"
          />
          <datalist id="package-type-suggestions">
            {SUBMISSION_PACKAGE_TYPE_SUGGESTIONS.map((type) => (
              <option key={type} value={type} />
            ))}
          </datalist>
        </FormField>

        <FormField label="Package date" htmlFor="packageDate">
          <input
            id="packageDate"
            type="date"
            className={inputClassName}
            value={values.packageDate}
            onChange={(event) => onChange({ packageDate: event.target.value })}
          />
        </FormField>
      </div>

      <FormField label="Package notes" htmlFor="packageNotes" className="mt-4">
        <textarea
          id="packageNotes"
          className={`${inputClassName} min-h-[5.5rem] py-2`}
          rows={3}
          value={values.packageNotes}
          onChange={(event) => onChange({ packageNotes: event.target.value })}
          placeholder="Notes about the supporting package"
        />
      </FormField>

      <FormField label="Submission notes" htmlFor="notes" className="mt-4">
        <textarea
          id="notes"
          className={`${inputClassName} min-h-[5.5rem] py-2`}
          rows={3}
          value={values.notes}
          onChange={(event) => onChange({ notes: event.target.value })}
          placeholder="Optional notes for this submission"
        />
      </FormField>
    </div>
  );
}
