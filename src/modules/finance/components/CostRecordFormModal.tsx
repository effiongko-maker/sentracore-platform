"use client";

import { useEffect, useMemo, useState } from "react";
import { MasterDataSelect } from "@/components/forms/MasterDataSelect";
import { SearchableSelect } from "@/components/forms/SearchableSelect";
import {
  FormField,
  inputClassName,
  selectClassName,
} from "@/components/forms/FormField";
import { Modal } from "@/components/modals/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useFacilityOptions } from "@/hooks/useFacilityOptions";
import {
  COST_CATEGORIES,
  COST_CATEGORY_LABELS,
  DEFAULT_COST_RECORD_CURRENCY,
  type CostCategory,
  type CostReimbursability,
} from "@/lib/operational/finance";
import type { CostRecord } from "@/lib/operational/finance/types";
import { ApiError } from "@/services/api/ApiResponse";
import {
  CostRecordService,
  type CreateCostRecordInput,
} from "@/services/finance/CostRecordService";
import { MaintenanceService } from "@/services/maintenance/MaintenanceService";
import { UserService } from "@/services/users/UserService";
import { WorkOrderService } from "@/services/workOrders/WorkOrderService";
import { COST_REIMBURSABILITY_LABELS } from "../constants";
import { MonetaryInput } from "./MonetaryInput";
import { formatFinancialAmount } from "../utils/formatFinancialAmount";
import {
  formatMonetaryFromNumber,
  parseMonetaryInput,
} from "../utils/monetaryInput";

type RelatedLink = "none" | "work" | "work_order";

type CostEntryForm = {
  facilityId: string;
  location: string;
  description: string;
  category: CostCategory | "";
  actualAmount: string;
  budgetedAmount: string;
  currency: string;
  reimbursability: CostReimbursability;
  evidenceReference: string;
  evidenceFile: File | null;
  departmentId: string;
  relatedLink: RelatedLink;
  workId: string;
  workOrderId: string;
};

type FormErrors = Partial<Record<keyof CostEntryForm, string>>;

export type CostRecordFormModalProps = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void | Promise<void>;
  initialValues?: Partial<CreateCostRecordInput>;
};

function emptyForm(initial?: Partial<CreateCostRecordInput>): CostEntryForm {
  const relatedLink: RelatedLink = initial?.workOrderId
    ? "work_order"
    : initial?.workId
      ? "work"
      : "none";

  return {
    facilityId: initial?.facilityId ?? "",
    location: initial?.location ?? "",
    description: initial?.description ?? "",
    category: initial?.category ?? "",
    actualAmount:
      initial?.actualAmount != null
        ? formatMonetaryFromNumber(initial.actualAmount)
        : "",
    budgetedAmount:
      initial?.budgetedAmount != null
        ? formatMonetaryFromNumber(initial.budgetedAmount)
        : "",
    currency: initial?.currency ?? DEFAULT_COST_RECORD_CURRENCY,
    reimbursability: initial?.reimbursability ?? "unknown",
    evidenceReference: initial?.evidence?.reference ?? "",
    evidenceFile: null,
    departmentId: initial?.departmentId ?? "",
    relatedLink,
    workId: initial?.workId ?? "",
    workOrderId: initial?.workOrderId ?? "",
  };
}

function userFacingError(error: unknown): string {
  if (error instanceof ApiError) {
    const message = error.message;
    if (/driveapp|authori[sz]|permission|access denied/i.test(message)) {
      return "Receipt storage needs a one-time Google Drive approval in Apps Script. Ask an administrator to run the evidence-storage setup, then try again.";
    }
    if (/is required|must be|invalid|non-negative|evidence/i.test(message)) {
      return message.replace(/^Invalid CostRecord on create:\s*/i, "");
    }
  }
  return "Unable to record this cost right now. Please try again.";
}

function parseOptionalAmount(value: string): number | undefined {
  return parseMonetaryInput(value);
}

const MAX_EVIDENCE_FILE_BYTES = 5 * 1024 * 1024;
const EVIDENCE_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

async function toEvidenceUpload(file: File) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The evidence file could not be read."));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
  const base64 = dataUrl.split(",", 2)[1];
  if (!base64) throw new Error("The evidence file could not be encoded.");
  return {
    fileName: file.name,
    mimeType: file.type as "application/pdf" | "image/jpeg" | "image/png",
    sizeBytes: file.size,
    base64,
  };
}

export function CostRecordFormModal({
  open,
  onClose,
  onSaved,
  initialValues,
}: CostRecordFormModalProps) {
  const { toast } = useToast();
  const { facilities, loading: facilitiesLoading } = useFacilityOptions(open);
  const [form, setForm] = useState<CostEntryForm>(() => emptyForm(initialValues));
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [recordedBy, setRecordedBy] = useState<string | null>(null);
  const [phase, setPhase] = useState<"form" | "success">("form");
  const [formVersion, setFormVersion] = useState(0);
  const [createdRecord, setCreatedRecord] = useState<CostRecord | null>(null);
  const [workRows, setWorkRows] = useState<
    Array<{ id: string; title: string; facilityId: string }>
  >([]);
  const [workLoading, setWorkLoading] = useState(false);
  const [workOrderRows, setWorkOrderRows] = useState<
    Array<{ id: string; title: string; facilityId: string }>
  >([]);
  const [workOrderLoading, setWorkOrderLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm(initialValues));
    setErrors({});
    setPhase("form");
    setCreatedRecord(null);
    setFormVersion((current) => current + 1);
  }, [open, initialValues]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    UserService.getCurrentUser()
      .then((user) => {
        if (!cancelled) setRecordedBy(user.id);
      })
      .catch(() => {
        if (!cancelled) setRecordedBy(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || form.relatedLink !== "work") return;
    let cancelled = false;
    setWorkLoading(true);
    MaintenanceService.listMaintenance({
      page: 1,
      pageSize: 50,
      status: "all",
      priority: "all",
      type: "all",
      facilityId: form.facilityId || "all",
      assignedToUserId: "all",
      sort: "newest",
    })
      .then((page) => {
        if (cancelled) return;
        setWorkRows(
          page.data.map((row) => ({
            id: row.id,
            title: row.title,
            facilityId: row.facilityId,
          }))
        );
      })
      .catch(() => {
        if (cancelled) return;
        setWorkRows([]);
      })
      .finally(() => {
        if (!cancelled) setWorkLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, form.relatedLink, form.facilityId]);

  useEffect(() => {
    if (!open || form.relatedLink !== "work_order") return;
    let cancelled = false;
    setWorkOrderLoading(true);
    WorkOrderService.listWorkOrders({
      page: 1,
      pageSize: 50,
      status: "all",
      priority: "all",
      facilityId: form.facilityId || "all",
      assetId: "all",
      assignedToUserId: "all",
      maintenanceId: "all",
      sort: "newest",
    })
      .then((page) => {
        if (cancelled) return;
        setWorkOrderRows(
          page.data.map((row) => ({
            id: row.id,
            title: row.title,
            facilityId: row.facilityId,
          }))
        );
      })
      .catch(() => {
        if (cancelled) return;
        setWorkOrderRows([]);
      })
      .finally(() => {
        if (!cancelled) setWorkOrderLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, form.relatedLink, form.facilityId]);

  const workOptions = useMemo(
    () =>
      workRows.map((row) => ({
        value: row.id,
        label: `${row.id} · ${row.title}`,
        keywords: [row.facilityId],
      })),
    [workRows]
  );

  const workOrderOptions = useMemo(
    () =>
      workOrderRows.map((row) => ({
        value: row.id,
        label: `${row.id} · ${row.title}`,
        keywords: [row.facilityId],
      })),
    [workOrderRows]
  );

  function updateField<K extends keyof CostEntryForm>(
    key: K,
    value: CostEntryForm[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validate(): boolean {
    const next: FormErrors = {};
    if (!form.facilityId.trim()) next.facilityId = "Facility is required";
    if (!form.location.trim()) next.location = "Location is required";
    if (!form.description.trim()) {
      next.description = "Description is required";
    }
    if (!form.category) next.category = "Category is required";
    const actual = parseOptionalAmount(form.actualAmount);
    if (actual == null) next.actualAmount = "Actual amount is required";
    else if (actual < 0) next.actualAmount = "Actual amount cannot be negative";
    const budgeted = parseOptionalAmount(form.budgetedAmount);
    if (form.budgetedAmount.trim() && (budgeted == null || budgeted < 0)) {
      next.budgetedAmount = "Budgeted amount must be zero or greater";
    }
    if (!form.evidenceFile && !form.evidenceReference.trim()) {
      next.evidenceReference = "Upload a receipt or invoice, or enter its reference";
    }
    if (form.evidenceFile) {
      if (!EVIDENCE_MIME_TYPES.has(form.evidenceFile.type)) {
        next.evidenceReference = "Use a PDF, JPEG, or PNG receipt or invoice";
      } else if (form.evidenceFile.size > MAX_EVIDENCE_FILE_BYTES) {
        next.evidenceReference = "The receipt or invoice must be 5 MB or smaller";
      }
    }
    if (form.relatedLink === "work" && !form.workId.trim()) {
      next.workId = "Select a work record or choose None";
    }
    if (form.relatedLink === "work_order" && !form.workOrderId.trim()) {
      next.workOrderId = "Select a work order or choose None";
    }
    if (!recordedBy) {
      next.description =
        next.description ??
        "Your session could not be verified. Sign in again and retry.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving || phase === "success") return;
    if (!validate()) return;

    const actualAmount = parseOptionalAmount(form.actualAmount);
    if (actualAmount == null || !recordedBy) return;

    const payload: CreateCostRecordInput = {
      facilityId: form.facilityId.trim(),
      location: form.location.trim(),
      description: form.description.trim(),
      category: form.category as CostCategory,
      actualAmount,
      currency: form.currency.trim() || DEFAULT_COST_RECORD_CURRENCY,
      reimbursability: form.reimbursability,
      evidence: { reference: form.evidenceReference.trim() || form.evidenceFile?.name },
      recordedBy,
    };

    const budgetedAmount = parseOptionalAmount(form.budgetedAmount);
    if (budgetedAmount != null) payload.budgetedAmount = budgetedAmount;
    if (form.departmentId.trim()) payload.departmentId = form.departmentId.trim();
    if (form.relatedLink === "work" && form.workId.trim()) {
      payload.workId = form.workId.trim();
    }
    if (form.relatedLink === "work_order" && form.workOrderId.trim()) {
      payload.workOrderId = form.workOrderId.trim();
    }

    setSaving(true);
    try {
      if (form.evidenceFile) {
        payload.evidence.upload = await toEvidenceUpload(form.evidenceFile);
      }
      const created = await CostRecordService.createCostRecord(payload);
      setCreatedRecord(created);
      setPhase("success");
      toast({
        type: "success",
        title: "Cost recorded",
        description: `${formatFinancialAmount(created.actualAmount, created.currency)} · ${COST_CATEGORY_LABELS[created.category]}`,
      });
      await onSaved?.();
    } catch (error) {
      toast({
        type: "error",
        title: "Unable to record cost",
        description: userFacingError(error),
      });
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    if (saving) return;
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      size="xl"
      title={phase === "success" ? "Cost recorded" : "Record cost"}
      description={
        phase === "success"
          ? "The operational cost has been saved."
          : "Add a cost you spent on operations. Only the essentials are up front."
      }
      footer={
        phase === "success" ? (
          <div className="flex justify-end">
            <Button type="button" onClick={handleClose}>
              Done
            </Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={handleClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" form="cost-entry-form" disabled={saving}>
              {saving ? "Recording…" : "Record cost"}
            </Button>
          </div>
        )
      }
    >
      {phase === "success" && createdRecord ? (
        <div className="space-y-3 py-2">
          <p className="text-base font-semibold text-foreground">
            {formatFinancialAmount(
              createdRecord.actualAmount,
              createdRecord.currency
            )}{" "}
            · {COST_CATEGORY_LABELS[createdRecord.category]}
          </p>
          <p className="text-sm text-muted">{createdRecord.description}</p>
          {createdRecord.evidence.fileName ? (
            <p className="text-sm text-muted">
              Receipt saved: {createdRecord.evidence.fileName}
            </p>
          ) : null}
          <p className="font-mono text-sm text-muted">{createdRecord.costId}</p>
        </div>
      ) : (
        <form
          id="cost-entry-form"
          className="grid gap-5 sm:grid-cols-2"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <FormField
            label="What was this for?"
            htmlFor="cost-description"
            required
            error={errors.description}
            className="sm:col-span-2"
          >
            <textarea
              id="cost-description"
              rows={2}
              className={inputClassName}
              value={form.description}
              disabled={saving}
              placeholder="Diesel purchased for generator operations"
              onChange={(event) =>
                updateField("description", event.target.value)
              }
            />
          </FormField>

          <FormField
            label="How much?"
            htmlFor="cost-actual-amount"
            required
            error={errors.actualAmount}
          >
            <MonetaryInput
              id="cost-actual-amount"
              value={form.actualAmount}
              disabled={saving}
              onValueChange={(next) => updateField("actualAmount", next)}
            />
          </FormField>

          <FormField
            label="Where?"
            htmlFor="cost-facility"
            required
            error={errors.facilityId}
          >
            <select
              id="cost-facility"
              className={selectClassName}
              value={form.facilityId}
              disabled={saving || facilitiesLoading}
              onChange={(event) => updateField("facilityId", event.target.value)}
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

          <FormField
            label="What kind of cost?"
            htmlFor="cost-category"
            required
            error={errors.category}
            className="sm:col-span-2"
          >
            <select
              id="cost-category"
              className={selectClassName}
              value={form.category}
              disabled={saving}
              onChange={(event) =>
                updateField("category", event.target.value as CostCategory | "")
              }
            >
              <option value="">Select category</option>
              {COST_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {COST_CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </FormField>

          <FormField
            label="Can we claim this back?"
            htmlFor="cost-reimbursability"
            hint="Leave as Unknown if you are not sure yet."
            className="sm:col-span-2"
          >
            <select
              id="cost-reimbursability"
              className={selectClassName}
              value={form.reimbursability}
              disabled={saving}
              onChange={(event) =>
                updateField(
                  "reimbursability",
                  event.target.value as CostReimbursability
                )
              }
            >
              {(Object.keys(COST_REIMBURSABILITY_LABELS) as CostReimbursability[]).map(
                (value) => (
                  <option key={value} value={value}>
                    {COST_REIMBURSABILITY_LABELS[value]}
                  </option>
                )
              )}
            </select>
          </FormField>

          <FormField
            label="Receipt or invoice"
            htmlFor="cost-evidence"
            required
            hint="Upload a PDF, JPEG, or PNG (up to 5 MB), or enter a reference."
            error={errors.evidenceReference}
            className="sm:col-span-2"
          >
            <div className="fin-form-evidence">
              <input
                key={formVersion}
                id="cost-evidence"
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                className={inputClassName}
                disabled={saving}
                onChange={(event) =>
                  updateField("evidenceFile", event.target.files?.[0] ?? null)
                }
              />
              {form.evidenceFile ? (
                <p className="fin-form-hint">
                  Selected: {form.evidenceFile.name}
                </p>
              ) : null}
              <input
                id="cost-evidence-reference"
                aria-label="Invoice or receipt reference"
                className={`${inputClassName} mt-2`}
                value={form.evidenceReference}
                disabled={saving}
                placeholder="Or enter the invoice / receipt reference"
                onChange={(event) =>
                  updateField("evidenceReference", event.target.value)
                }
              />
            </div>
          </FormField>

          <details
            className="fin-form-more sm:col-span-2"
            open={Boolean(
              errors.location ||
                errors.budgetedAmount ||
                errors.workId ||
                errors.workOrderId
            )}
          >
            <summary className="fin-form-more-summary">More details</summary>
            <div className="fin-form-more-body grid gap-5 sm:grid-cols-2">
              <FormField
                label="Budgeted amount"
                htmlFor="cost-budgeted-amount"
                hint="Optional — what was budgeted for this cost."
                error={errors.budgetedAmount}
              >
                <MonetaryInput
                  id="cost-budgeted-amount"
                  value={form.budgetedAmount}
                  disabled={saving}
                  onValueChange={(next) => updateField("budgetedAmount", next)}
                />
              </FormField>

              <FormField label="Currency" htmlFor="cost-currency">
                <input
                  id="cost-currency"
                  className={inputClassName}
                  value={form.currency}
                  disabled
                  readOnly
                />
              </FormField>

              <FormField
                label="Location"
                htmlFor="cost-location"
                required
                error={errors.location}
              >
                <input
                  id="cost-location"
                  className={inputClassName}
                  value={form.location}
                  disabled={saving}
                  placeholder="Generator house / rear service area"
                  onChange={(event) =>
                    updateField("location", event.target.value)
                  }
                />
              </FormField>

              <FormField label="Department" htmlFor="cost-department">
                <MasterDataSelect
                  id="cost-department"
                  entity="departments"
                  value={form.departmentId}
                  onChange={(value) => updateField("departmentId", value)}
                  facilityId={form.facilityId || undefined}
                  enabled={Boolean(form.facilityId)}
                  disabled={saving || !form.facilityId}
                  allowEmpty
                  emptyOptionLabel="No department"
                />
              </FormField>

              <FormField
                label="Maintenance / work classification"
                htmlFor="cost-related-link"
                className="sm:col-span-2"
              >
                <select
                  id="cost-related-link"
                  className={selectClassName}
                  value={form.relatedLink}
                  disabled={saving}
                  onChange={(event) => {
                    const value = event.target.value as RelatedLink;
                    updateField("relatedLink", value);
                    if (value !== "work") updateField("workId", "");
                    if (value !== "work_order") updateField("workOrderId", "");
                  }}
                >
                  <option value="none">None</option>
                  <option value="work">Work</option>
                  <option value="work_order">Work Order</option>
                </select>
              </FormField>

              {form.relatedLink === "work" ? (
                <FormField
                  label="Work"
                  htmlFor="cost-work-id"
                  error={errors.workId}
                  className="sm:col-span-2"
                >
                  <SearchableSelect
                    id="cost-work-id"
                    aria-label="Work"
                    value={form.workId}
                    onChange={(value) => updateField("workId", value)}
                    options={workOptions}
                    allowEmpty
                    emptyOptionLabel="Select work"
                    searchPlaceholder="Search by reference or title…"
                    loading={workLoading}
                    disabled={saving}
                  />
                </FormField>
              ) : null}

              {form.relatedLink === "work_order" ? (
                <FormField
                  label="Work Order"
                  htmlFor="cost-work-order-id"
                  error={errors.workOrderId}
                  className="sm:col-span-2"
                >
                  <SearchableSelect
                    id="cost-work-order-id"
                    aria-label="Work Order"
                    value={form.workOrderId}
                    onChange={(value) => updateField("workOrderId", value)}
                    options={workOrderOptions}
                    allowEmpty
                    emptyOptionLabel="Select work order"
                    searchPlaceholder="Search by reference or title…"
                    loading={workOrderLoading}
                    disabled={saving}
                  />
                </FormField>
              ) : null}
            </div>
          </details>
        </form>
      )}
    </Modal>
  );
}
