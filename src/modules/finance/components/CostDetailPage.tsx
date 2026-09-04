"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ReceiptText } from "lucide-react";
import { MasterDataSelect } from "@/components/forms/MasterDataSelect";
import { SearchableSelect } from "@/components/forms/SearchableSelect";
import {
  FormField,
  inputClassName,
  selectClassName,
} from "@/components/forms/FormField";
import { ModeFrame, OperateHeader, StreamSurface } from "@/components/platform";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { useFacilityOptions } from "@/hooks/useFacilityOptions";
import {
  COST_CATEGORIES,
  COST_CATEGORY_LABELS,
  type CostCategory,
  type CostRecord,
  type CostReimbursability,
  type CostSubmission,
} from "@/lib/operational/finance";
import { ApiError } from "@/services/api/ApiResponse";
import {
  CostRecordService,
  type UpdateCostRecordInput,
} from "@/services/finance/CostRecordService";
import { CostSubmissionService } from "@/services/finance/CostSubmissionService";
import { ReimbursementAuthorizationService } from "@/services/finance/ReimbursementAuthorizationService";
import { ReimbursementPaymentService } from "@/services/finance/ReimbursementPaymentService";
import { MaintenanceService } from "@/services/maintenance/MaintenanceService";
import { WorkOrderService } from "@/services/workOrders/WorkOrderService";
import { COST_REIMBURSABILITY_LABELS } from "../constants";
import { MonetaryInput } from "./MonetaryInput";
import { formatFinancialAmount } from "../utils/formatFinancialAmount";
import {
  formatMonetaryFromNumber,
  parseMonetaryInput,
} from "../utils/monetaryInput";
import {
  deriveCostWorkflow,
  findSubmissionForCost,
} from "../utils/costWorkflow";
import {
  paymentsForCostViaSubmission,
  summarizeSubmissionPayments,
} from "../utils/submissionPayment";
import { SUBMISSION_LIFECYCLE_LABELS } from "../utils/submissionLifecycle";
import type {
  ReimbursementAuthorization,
  ReimbursementPayment,
} from "@/lib/operational/finance/types";

type RelatedLink = "none" | "work" | "work_order";

type ClassificationForm = {
  description: string;
  category: CostCategory | "";
  actualAmount: string;
  budgetedAmount: string;
  facilityId: string;
  location: string;
  departmentId: string;
  relatedLink: RelatedLink;
  workId: string;
  workOrderId: string;
  reimbursability: CostReimbursability;
  evidenceReference: string;
};

type FormErrors = Partial<Record<keyof ClassificationForm, string>>;

function formatTimestamp(iso?: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  return date.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function parseOptionalAmount(value: string): number | undefined {
  return parseMonetaryInput(value);
}

function formFromRecord(record: CostRecord): ClassificationForm {
  const relatedLink: RelatedLink = record.workOrderId
    ? "work_order"
    : record.workId
      ? "work"
      : "none";
  return {
    description: record.description,
    category: record.category,
    actualAmount: formatMonetaryFromNumber(record.actualAmount),
    budgetedAmount:
      record.budgetedAmount != null
        ? formatMonetaryFromNumber(record.budgetedAmount)
        : "",
    facilityId: record.facilityId,
    location: record.location,
    departmentId: record.departmentId ?? "",
    relatedLink,
    workId: record.workId ?? "",
    workOrderId: record.workOrderId ?? "",
    reimbursability: record.reimbursability,
    evidenceReference: record.evidence.reference,
  };
}

function userFacingError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message.replace(/^Invalid CostRecord on update:\s*/i, "");
  }
  return "Unable to save this cost right now. Please try again.";
}

export function CostDetailPage({ costId }: { costId: string }) {
  const { toast } = useToast();
  const { facilities, loading: facilitiesLoading } = useFacilityOptions(true);

  const [record, setRecord] = useState<CostRecord | null>(null);
  const [linkedSubmission, setLinkedSubmission] =
    useState<CostSubmission | null>(null);
  const [linkedPayments, setLinkedPayments] = useState<ReimbursementPayment[]>(
    []
  );
  const [linkedAuthorizations, setLinkedAuthorizations] = useState<
    ReimbursementAuthorization[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ClassificationForm | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);

  const [workRows, setWorkRows] = useState<
    Array<{ id: string; title: string; facilityId: string }>
  >([]);
  const [workLoading, setWorkLoading] = useState(false);
  const [workOrderRows, setWorkOrderRows] = useState<
    Array<{ id: string; title: string; facilityId: string }>
  >([]);
  const [workOrderLoading, setWorkOrderLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cost, submissionsPage, paymentsPage, authorizationsPage] =
        await Promise.all([
          CostRecordService.getCostRecord(costId),
          CostSubmissionService.listCostSubmissions({ page: 1, pageSize: 100 }),
          ReimbursementPaymentService.listPayments({ page: 1, pageSize: 100 }),
          ReimbursementAuthorizationService.listAuthorizations({
            page: 1,
            pageSize: 100,
          }),
        ]);
      if (!cost) {
        setRecord(null);
        setLinkedSubmission(null);
        setLinkedPayments([]);
        setLinkedAuthorizations([]);
        setError("This cost could not be found.");
        return;
      }
      setRecord(cost);
      const linked = findSubmissionForCost(cost.costId, submissionsPage.data);
      setLinkedSubmission(linked);
      setLinkedPayments(
        linked
          ? paymentsForCostViaSubmission(
              cost.costId,
              [linked],
              paymentsPage.data
            )
          : []
      );
      setLinkedAuthorizations(
        linked
          ? authorizationsPage.data.filter(
              (row) => row.submissionId === linked.submissionId
            )
          : []
      );
      setForm(formFromRecord(cost));
      setEditing(cost.reimbursability === "unknown");
    } catch (err) {
      setRecord(null);
      setLinkedSubmission(null);
      setLinkedPayments([]);
      setLinkedAuthorizations([]);
      setError(
        err instanceof Error ? err.message : "Unable to load this cost."
      );
    } finally {
      setLoading(false);
    }
  }, [costId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!editing || !form || form.relatedLink !== "work") return;
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
        if (!cancelled) setWorkRows([]);
      })
      .finally(() => {
        if (!cancelled) setWorkLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editing, form?.relatedLink, form?.facilityId]);

  useEffect(() => {
    if (!editing || !form || form.relatedLink !== "work_order") return;
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
        if (!cancelled) setWorkOrderRows([]);
      })
      .finally(() => {
        if (!cancelled) setWorkOrderLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editing, form?.relatedLink, form?.facilityId]);

  const paymentSummary = useMemo(() => {
    if (!linkedSubmission) return null;
    return summarizeSubmissionPayments(
      linkedSubmission,
      linkedPayments,
      linkedAuthorizations
    );
  }, [linkedSubmission, linkedPayments, linkedAuthorizations]);

  const workflow = useMemo(
    () =>
      record
        ? deriveCostWorkflow(record, linkedSubmission, {
            paymentRecorded: Boolean(paymentSummary?.fullyPaid),
          })
        : null,
    [record, linkedSubmission, paymentSummary?.fullyPaid]
  );

  const primaryPayment = linkedPayments[0] ?? null;

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

  function updateField<K extends keyof ClassificationForm>(
    key: K,
    value: ClassificationForm[K]
  ) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validate(): boolean {
    if (!form) return false;
    const next: FormErrors = {};
    if (!form.facilityId.trim()) next.facilityId = "Facility is required";
    if (!form.location.trim()) next.location = "Location is required";
    if (!form.description.trim()) next.description = "Description is required";
    if (!form.category) next.category = "Category is required";
    const actual = parseOptionalAmount(form.actualAmount);
    if (actual == null) next.actualAmount = "Actual amount is required";
    else if (actual < 0) next.actualAmount = "Actual amount cannot be negative";
    const budgeted = parseOptionalAmount(form.budgetedAmount);
    if (form.budgetedAmount.trim() && (budgeted == null || budgeted < 0)) {
      next.budgetedAmount = "Budgeted amount must be zero or greater";
    }
    if (!form.evidenceReference.trim()) {
      next.evidenceReference = "Evidence reference is required";
    }
    if (form.relatedLink === "work" && !form.workId.trim()) {
      next.workId = "Select a work record or choose None";
    }
    if (form.relatedLink === "work_order" && !form.workOrderId.trim()) {
      next.workOrderId = "Select a work order or choose None";
    }
    if (form.reimbursability === "unknown") {
      next.reimbursability =
        "Choose Eligible or Not eligible to complete classification";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!form || !record || saving) return;
    if (!validate()) return;

    const actualAmount = parseOptionalAmount(form.actualAmount);
    if (actualAmount == null) return;

    const selectedWorkId =
      form.relatedLink === "work" ? form.workId.trim() : "";
    const selectedWorkOrderId =
      form.relatedLink === "work_order" ? form.workOrderId.trim() : "";

    const payload: UpdateCostRecordInput = {
      facilityId: form.facilityId.trim(),
      location: form.location.trim(),
      description: form.description.trim(),
      category: form.category as CostCategory,
      actualAmount,
      reimbursability: form.reimbursability,
      evidence: { reference: form.evidenceReference.trim() },
    };

    if (form.departmentId.trim()) {
      payload.departmentId = form.departmentId.trim();
    } else if (record.departmentId) {
      // Clear only when a previous department must be removed.
      payload.departmentId = "";
    }

    // Persist the active operational link ID. Never send empty workId/workOrderId
    // unless clearing a previously stored value (empty means "clear" on update).
    if (selectedWorkId) {
      payload.workId = selectedWorkId;
    } else if (record.workId) {
      payload.workId = "";
    }

    if (selectedWorkOrderId) {
      payload.workOrderId = selectedWorkOrderId;
    } else if (record.workOrderId) {
      payload.workOrderId = "";
    }

    const budgetedAmount = parseOptionalAmount(form.budgetedAmount);
    if (budgetedAmount != null) payload.budgetedAmount = budgetedAmount;

    setSaving(true);
    try {
      const updated = await CostRecordService.updateCostRecord(
        record.costId,
        payload
      );
      setRecord(updated);
      setForm(formFromRecord(updated));
      setEditing(false);
      toast({
        type: "success",
        title: "Cost updated",
        description:
          updated.reimbursability === "unknown"
            ? "Classification is still incomplete."
            : "Classification saved.",
      });
    } catch (err) {
      toast({
        type: "error",
        title: "Unable to save cost",
        description: userFacingError(err),
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <ModeFrame mode="act">
        <div className="fin-v13-skel-block" style={{ maxWidth: "40rem" }} />
      </ModeFrame>
    );
  }

  if (error || !record || !workflow || !form) {
    return (
      <ModeFrame mode="act">
        <EmptyState
          icon={ReceiptText}
          title="Unable to load cost"
          description={error ?? "This cost could not be found."}
          actionLabel="Back to costs"
          onAction={() => {
            window.location.href = "/finance/costs";
          }}
        />
      </ModeFrame>
    );
  }

  return (
    <ModeFrame mode="act">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/finance/costs"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to cost records
        </Link>
        <Link
          href="/finance"
          className="text-sm font-medium text-muted hover:underline"
        >
          Finance overview
        </Link>
      </div>

      <OperateHeader
        title={record.costId}
        description={record.description}
        signalValue={workflow.stageLabel}
        signalLabel="Workflow"
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <StreamSurface>
          <div className="fin-submission-review-block">
            <p className="fin-form-kicker">Cost detail</p>
            <dl className="fin-submission-review-dl">
              <div>
                <dt>Cost ID</dt>
                <dd className="font-mono text-sm">{record.costId}</dd>
              </div>
              <div>
                <dt>Date recorded</dt>
                <dd>{formatTimestamp(record.recordedAt)}</dd>
              </div>
              <div>
                <dt>Amount</dt>
                <dd className="font-semibold tabular-nums">
                  {formatFinancialAmount(
                    record.actualAmount,
                    record.currency
                  )}
                </dd>
              </div>
              {record.budgetedAmount != null ? (
                <div>
                  <dt>Budgeted</dt>
                  <dd className="tabular-nums">
                    {formatFinancialAmount(
                      record.budgetedAmount,
                      record.currency
                    )}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt>Facility</dt>
                <dd>
                  {record.facilityId}
                  {record.location ? ` · ${record.location}` : ""}
                </dd>
              </div>
              <div>
                <dt>Department</dt>
                <dd>{record.departmentId ?? "—"}</dd>
              </div>
              <div>
                <dt>Category</dt>
                <dd>
                  {COST_CATEGORY_LABELS[record.category as CostCategory]}
                </dd>
              </div>
              <div>
                <dt>Work</dt>
                <dd>{record.workId ?? "—"}</dd>
              </div>
              <div>
                <dt>Work Order</dt>
                <dd>
                  {record.workOrderId ? (
                    <Link
                      href={`/work-orders?id=${encodeURIComponent(record.workOrderId)}`}
                      className="text-primary hover:underline"
                    >
                      {record.workOrderId}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt>Evidence</dt>
                <dd>
                  {record.evidence.fileUrl ? (
                    <a
                      href={record.evidence.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                    >
                      {record.evidence.fileName ?? record.evidence.reference}
                    </a>
                  ) : (
                    record.evidence.reference
                  )}
                </dd>
              </div>
              <div>
                <dt>Recorded by</dt>
                <dd className="font-mono text-sm">{record.recordedBy}</dd>
              </div>
            </dl>
          </div>
        </StreamSurface>

        <StreamSurface>
          <div className="fin-submission-review-block">
            <p className="fin-form-kicker">Workflow</p>
            <dl className="fin-submission-review-dl">
              <div>
                <dt>Lifecycle</dt>
                <dd>{workflow.stageLabel}</dd>
              </div>
              <div>
                <dt>Reimbursement</dt>
                <dd>{workflow.eligibilityLabel}</dd>
              </div>
              <div>
                <dt>Stored classification</dt>
                <dd>
                  {COST_REIMBURSABILITY_LABELS[record.reimbursability]}
                </dd>
              </div>
              {linkedSubmission ? (
                <div>
                  <dt>Submission</dt>
                  <dd>
                    <Link
                      href={`/finance/submissions/${encodeURIComponent(linkedSubmission.submissionId)}`}
                      className="text-primary hover:underline"
                    >
                      {linkedSubmission.submissionId}
                    </Link>
                    <span className="text-muted">
                      {" "}
                      · {SUBMISSION_LIFECYCLE_LABELS[linkedSubmission.status]}
                    </span>
                  </dd>
                </div>
              ) : null}
              {primaryPayment ? (
                <>
                  <div>
                    <dt>Payment</dt>
                    <dd className="font-mono text-sm">
                      {primaryPayment.paymentId}
                      {primaryPayment.reference
                        ? ` · ${primaryPayment.reference}`
                        : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>Paid</dt>
                    <dd>
                      {formatFinancialAmount(
                        paymentSummary?.amountPaid ?? primaryPayment.receivedAmount,
                        primaryPayment.currency
                      )}
                      {primaryPayment.receivedAt
                        ? ` · ${new Date(primaryPayment.receivedAt).toLocaleDateString("en-GB")}`
                        : ""}
                      {paymentSummary && !paymentSummary.fullyPaid
                        ? " · partial"
                        : ""}
                    </dd>
                  </div>
                </>
              ) : null}
            </dl>
            <p className="fin-form-hint mt-3">
              Classification is explicit — a cost is not automatically eligible
              for reimbursement. Reimbursed only when a payment is recorded
              against the linked submission and the claim is fully paid.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {!editing ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setForm(formFromRecord(record));
                    setErrors({});
                    setEditing(true);
                  }}
                >
                  {workflow.needsClassification
                    ? "Classify cost"
                    : "Edit classification"}
                </Button>
              ) : null}
              {workflow.canStartSubmission ? (
                <Link
                  href={`/finance/submissions/new?costId=${encodeURIComponent(record.costId)}`}
                  className="fin-v13-btn-primary"
                >
                  Create submission
                </Link>
              ) : null}
            </div>
          </div>
        </StreamSurface>
      </div>

      {editing ? (
        <StreamSurface className="mt-4">
          <form
            className="grid gap-5 sm:grid-cols-2"
            onSubmit={(event) => void handleSave(event)}
          >
            <div className="sm:col-span-2">
              <p className="fin-form-kicker">Classification</p>
              <p className="fin-form-hint">
                Set category, operational context, and reimbursement eligibility.
                Saving Eligible or Not eligible clears Needs classification.
              </p>
            </div>

            <FormField
              label="Description"
              htmlFor="cost-edit-description"
              required
              error={errors.description}
              className="sm:col-span-2"
            >
              <textarea
                id="cost-edit-description"
                rows={2}
                className={inputClassName}
                value={form.description}
                disabled={saving}
                onChange={(event) =>
                  updateField("description", event.target.value)
                }
              />
            </FormField>

            <FormField
              label="Cost category"
              htmlFor="cost-edit-category"
              required
              error={errors.category}
            >
              <select
                id="cost-edit-category"
                className={selectClassName}
                value={form.category}
                disabled={saving}
                onChange={(event) =>
                  updateField(
                    "category",
                    event.target.value as CostCategory | ""
                  )
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
              htmlFor="cost-edit-reimbursability"
              required
              error={errors.reimbursability}
              hint="Not eligible · Eligible. Submitted and Reimbursed are derived from submissions and payment — not set here."
            >
              <select
                id="cost-edit-reimbursability"
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
                <option value="unknown">Unknown — needs classification</option>
                <option value="reimbursable">Eligible</option>
                <option value="non_reimbursable">Not eligible</option>
              </select>
            </FormField>

            <FormField
              label="Actual amount"
              htmlFor="cost-edit-actual"
              required
              error={errors.actualAmount}
            >
              <MonetaryInput
                id="cost-edit-actual"
                value={form.actualAmount}
                disabled={saving}
                onValueChange={(next) => updateField("actualAmount", next)}
              />
            </FormField>

            <FormField
              label="Budgeted amount"
              htmlFor="cost-edit-budgeted"
              error={errors.budgetedAmount}
            >
              <MonetaryInput
                id="cost-edit-budgeted"
                value={form.budgetedAmount}
                disabled={saving}
                onValueChange={(next) => updateField("budgetedAmount", next)}
              />
            </FormField>

            <FormField
              label="Facility"
              htmlFor="cost-edit-facility"
              required
              error={errors.facilityId}
            >
              <select
                id="cost-edit-facility"
                className={selectClassName}
                value={form.facilityId}
                disabled={saving || facilitiesLoading}
                onChange={(event) =>
                  updateField("facilityId", event.target.value)
                }
              >
                <option value="">
                  {facilitiesLoading
                    ? "Loading facilities…"
                    : "Select facility"}
                </option>
                {facilities.map((facility) => (
                  <option key={facility.id} value={facility.id}>
                    {facility.name}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField
              label="Location"
              htmlFor="cost-edit-location"
              required
              error={errors.location}
            >
              <input
                id="cost-edit-location"
                className={inputClassName}
                value={form.location}
                disabled={saving}
                onChange={(event) =>
                  updateField("location", event.target.value)
                }
              />
            </FormField>

            <FormField label="Department" htmlFor="cost-edit-department">
              <MasterDataSelect
                id="cost-edit-department"
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
              htmlFor="cost-edit-related"
            >
              <select
                id="cost-edit-related"
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
                htmlFor="cost-edit-work"
                error={errors.workId}
                className="sm:col-span-2"
              >
                <SearchableSelect
                  id="cost-edit-work"
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
                htmlFor="cost-edit-wo"
                error={errors.workOrderId}
                className="sm:col-span-2"
              >
                <SearchableSelect
                  id="cost-edit-wo"
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

            <FormField
              label="Evidence reference"
              htmlFor="cost-edit-evidence"
              required
              error={errors.evidenceReference}
              className="sm:col-span-2"
            >
              <input
                id="cost-edit-evidence"
                className={inputClassName}
                value={form.evidenceReference}
                disabled={saving}
                onChange={(event) =>
                  updateField("evidenceReference", event.target.value)
                }
              />
            </FormField>

            <div className="fin-submission-actions sm:col-span-2">
              <Button
                type="button"
                variant="ghost"
                disabled={saving}
                onClick={() => {
                  setForm(formFromRecord(record));
                  setErrors({});
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save classification"}
              </Button>
            </div>
          </form>
        </StreamSurface>
      ) : null}
    </ModeFrame>
  );
}
