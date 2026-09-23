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
import { useScopedFacilityResolver } from "@/hooks/useScopedFacilityResolver";

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
import {
  resolveWorkInstructionKind,
  WORK_INSTRUCTION_KIND_LABELS,
} from "@/modules/work-orders/instructionKind";
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
    if (/permission|access denied|forbidden/i.test(message)) {
      return "You do not have permission to record this cost.";
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
    Array<{
      id: string;
      title: string;
      facilityId: string;
      estimatedCost?: number;
    }>
  >([]);
  const [workOrderLoading, setWorkOrderLoading] = useState(false);

  /** The user's active facility assignment (UUID) — or the record's own facility. */
  const resolveScoped = useScopedFacilityResolver({ open, creating: !initialValues?.facilityId?.trim() });
  const scopedFacilityId = useMemo(() => {
    if (initialValues?.facilityId?.trim()) return initialValues.facilityId.trim();
    return resolveScoped(facilities);
  }, [facilities, initialValues?.facilityId, resolveScoped]);

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm(initialValues));
    setErrors({});
    setPhase("form");
    setCreatedRecord(null);
    setFormVersion((current) => current + 1);
  }, [open, initialValues]);

  useEffect(() => {
    if (!open || !scopedFacilityId) return;
    setForm((current) =>
      current.facilityId === scopedFacilityId
        ? current
        : { ...current, facilityId: scopedFacilityId }
    );
  }, [open, scopedFacilityId]);

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
            estimatedCost: row.estimatedCost,
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
      workOrderRows.map((row) => {
        const kind = resolveWorkInstructionKind(row);
        return {
          value: row.id,
          label: `${row.id} · ${WORK_INSTRUCTION_KIND_LABELS[kind]} · ${row.title}`,
          keywords: [
            row.facilityId,
            WORK_INSTRUCTION_KIND_LABELS[kind],
            kind,
          ],
        };
      }),
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
    const facilityId = form.facilityId.trim() || scopedFacilityId;
    if (!facilityId) {
      next.description =
        next.description ??
        (facilitiesLoading
          ? "Facility context is still loading. Try again in a moment."
          : "Facility context is unavailable right now.");
    }
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
    if (!form.evidenceReference.trim()) {
      next.evidenceReference = "Enter the receipt or invoice reference";
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
    const facilityId = form.facilityId.trim() || scopedFacilityId;
    if (actualAmount == null || !recordedBy || !facilityId) return;

    const payload: CreateCostRecordInput = {
      facilityId,
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
      // Receipt file upload is unavailable until evidence storage moves to
      // SentraCore™ — the receipt / invoice reference is the evidence.
      const created = await CostRecordService.createCostRecord(payload);
      setCreatedRecord(created);
      setPhase("success");
      toast({
        type: "success",
        title: "Cost recorded",
        description: `${formatFinancialAmount(created.actualAmount, created.currency)} · ${created.category ? COST_CATEGORY_LABELS[created.category] : "Not recorded"}`,
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
            · {createdRecord.category ? COST_CATEGORY_LABELS[createdRecord.category] : "Not recorded"}
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
            className="sm:col-span-2"
          >
            <MonetaryInput
              id="cost-actual-amount"
              value={form.actualAmount}
              disabled={saving}
              onValueChange={(next) => updateField("actualAmount", next)}
            />
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
            label="Reimbursement eligibility"
            htmlFor="cost-reimbursability"
            hint="Can this cost be claimed back from the client (NCC)? Only costs marked NCC Reimbursable can be added to a reimbursement claim. Independent of Order Type. Leave as Unknown if not decided yet."
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
            hint="Receipt file upload is unavailable until evidence storage moves to SentraCore™. Enter the receipt or invoice reference."
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
                disabled
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
                placeholder="Invoice / receipt reference"
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
                label="Related Work / Work Instruction"
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
                  <option value="work_order">Work Instruction (Work Order / Job Order)</option>
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
                  label="Work / Job Order"
                  htmlFor="cost-work-order-id"
                  error={errors.workOrderId}
                  hint="Order Type (Work Order vs Job Order) is determined by the linked record’s estimated cost only. Reimbursability above is independent. Actual cost does not change Order Type."
                  className="sm:col-span-2"
                >
                  <SearchableSelect
                    id="cost-work-order-id"
                    aria-label="Work / Job Order"
                    value={form.workOrderId}
                    onChange={(value) => updateField("workOrderId", value)}
                    options={workOrderOptions}
                    allowEmpty
                    emptyOptionLabel="Select work or job order"
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
