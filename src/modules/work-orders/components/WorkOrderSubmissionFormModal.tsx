"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/modals/Modal";
import { Button } from "@/components/ui/Button";
import { FormField, inputClassName } from "@/components/forms/FormField";
import { useToast } from "@/components/ui/Toast";
import { CatalogFailureNotice } from "@/components/ui/CatalogFailureNotice";
import { useReferenceCatalog } from "@/hooks/useReferenceCatalog";
import { FacilityService } from "@/services/facilities/FacilityService";
import { MaintenanceService } from "@/services/maintenance/MaintenanceService";
import { WorkOrderService } from "@/services/workOrders/WorkOrderService";
import type { Facility } from "@/modules/facilities/types";
import type { Maintenance } from "@/modules/maintenance/types";
import { WORK_INSTRUCTION_KIND_LABELS } from "../instructionKind";
import {
  WORK_ORDER_SUBMISSION_STATUS_LABELS,
  type WorkOrder,
  type WorkOrderOrderType,
  type WorkOrderSubmissionStatus,
} from "../types";

const ALL_FACILITIES = "__all__";

type FormState = {
  orderType: WorkOrderOrderType | "";
  title: string;
  facility: string;
  submissionDate: string;
  amount: string;
  submissionStatus: WorkOrderSubmissionStatus;
  workIds: string[];
};

function initialState(workOrder: WorkOrder | null | undefined, orderType: WorkOrderOrderType | null | undefined): FormState {
  const facilityIds = workOrder?.facilityIds?.length ? workOrder.facilityIds : workOrder?.facilityId ? [workOrder.facilityId] : [];
  return {
    orderType: workOrder?.orderType ?? orderType ?? "",
    title: workOrder?.title ?? "",
    facility: facilityIds.length > 1 ? ALL_FACILITIES : facilityIds[0] ?? "",
    submissionDate: workOrder?.submissionDate ?? "",
    amount: workOrder?.submissionAmountSource === "recorded" && workOrder.submissionAmount != null ? String(workOrder.submissionAmount) : "",
    submissionStatus: workOrder?.submissionStatus ?? "submitted",
    workIds: workOrder?.linkedWorkIds ?? [],
  };
}

/**
 * A Work Order / Job Order is a commercial submission package: several pieces of Work may be submitted together, and
 * none is required. Order Type is the explicit selection (from the tab, or chosen here) — never inferred from the
 * amount.
 */
export function WorkOrderSubmissionFormModal({
  open,
  mode,
  workOrder,
  initialOrderType,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: "create" | "edit";
  workOrder?: WorkOrder | null;
  initialOrderType?: WorkOrderOrderType | null;
  onClose: () => void;
  onSaved?: (workOrder: WorkOrder) => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(() => initialState(workOrder, initialOrderType));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [workSearch, setWorkSearch] = useState("");
  const [saving, setSaving] = useState(false);
  // A WO/JO that belongs to legacy Work keeps its facility/Works/type from that Work; only the submission facts change.
  const workLinked = mode === "edit" && Boolean(workOrder?.maintenanceId);

  const facilitiesCatalog = useReferenceCatalog(open, () =>
    FacilityService.listFacilities({ page: 1, pageSize: 200 }).then((page) => page.data)
  );
  const workCatalog = useReferenceCatalog(open && !workLinked, () =>
    MaintenanceService.listMaintenance({ page: 1, pageSize: 500 }).then((page) => page.data)
  );
  const facilities: Facility[] = useMemo(
    () => facilitiesCatalog.items.filter((f) => f.status === "active" && ["ncc annex", "csirt"].includes(f.name.trim().toLowerCase())),
    [facilitiesCatalog.items]
  );

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      setForm(initialState(mode === "edit" ? workOrder : null, initialOrderType));
      setErrors({});
      setWorkSearch("");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, mode, workOrder, initialOrderType]);

  const facilityIds = useMemo(
    () => (form.facility === ALL_FACILITIES ? facilities.map((f) => f.id) : form.facility ? [form.facility] : []),
    [form.facility, facilities]
  );

  const eligibleWork = useMemo(() => {
    const term = workSearch.trim().toLowerCase();
    return (workCatalog.items as Maintenance[])
      .filter((w) => w.recordOrigin !== "migrated_historical" && facilityIds.includes(w.facilityId))
      .filter((w) => !term || w.id.toLowerCase().includes(term) || w.title.toLowerCase().includes(term))
      .slice(0, 100);
  }, [workCatalog.items, facilityIds, workSearch]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validate(): boolean {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.orderType) next.orderType = "Select Work Order or Job Order";
    if (!form.title.trim()) next.title = "Title is required";
    if (!workLinked && facilityIds.length === 0) next.facility = "Facility is required";
    const amount = form.amount.trim() ? Number(form.amount) : null;
    if (amount != null && (!Number.isFinite(amount) || amount < 0)) next.amount = "Amount must be a non-negative number";
    if (form.submissionStatus !== "draft") {
      if (!form.submissionDate) next.submissionDate = "Submission date is required once submitted";
      if (amount == null || amount <= 0) next.amount = "Amount is required once submitted";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const amount = form.amount.trim() ? Number(form.amount) : null;
      const common = {
        title: form.title.trim(),
        submissionDate: form.submissionDate || null,
        submissionAmount: amount,
        submissionStatus: form.submissionStatus,
      };
      const saved =
        mode === "edit" && workOrder
          ? await WorkOrderService.updateSubmission(workOrder.id, {
              ...common,
              ...(workLinked ? {} : { orderType: form.orderType as WorkOrderOrderType, facilityIds, workIds: form.workIds }),
            })
          : await WorkOrderService.createSubmission({
              ...common,
              orderType: form.orderType as WorkOrderOrderType,
              facilityIds,
              workIds: form.workIds,
            });
      toast({
        type: "success",
        title: mode === "edit" ? "Submission updated" : `${WORK_INSTRUCTION_KIND_LABELS[saved.orderType ?? "work_order"]} created`,
        description: `${saved.id} · ${saved.title}`,
      });
      await onSaved?.(saved);
      onClose();
    } catch (err) {
      toast({
        type: "error",
        title: mode === "edit" ? "Unable to update submission" : "Unable to create submission",
        description: err instanceof Error ? err.message : "Please try again in a moment.",
      });
    } finally {
      setSaving(false);
    }
  }

  const kindLabel = form.orderType ? WORK_INSTRUCTION_KIND_LABELS[form.orderType] : "Work Order / Job Order";
  const orderTypeFixed = mode === "create" ? Boolean(initialOrderType) : workLinked;
  const failedCatalogs = [
    facilitiesCatalog.failed && { label: "Facility", retry: facilitiesCatalog.retry },
    workCatalog.failed && { label: "Work", retry: workCatalog.retry },
  ].filter((item): item is { label: string; retry: () => void } => Boolean(item));

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      title={mode === "edit" ? `Edit ${kindLabel}` : `New ${kindLabel}`}
      description="A commercial submission to the client. Several pieces of Work can be submitted together; linking Work is optional."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="wo-submission-form" loading={saving}>
            {mode === "edit" ? "Save changes" : `Create ${kindLabel}`}
          </Button>
        </>
      }
    >
      <form id="wo-submission-form" onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
        {failedCatalogs.length ? (
          <div className="sm:col-span-2">
            <CatalogFailureNotice failed={failedCatalogs} />
          </div>
        ) : null}

        {orderTypeFixed ? null : (
          <FormField label="Order Type" htmlFor="wos-type" required error={errors.orderType} className="sm:col-span-2">
            <select
              id="wos-type"
              className={inputClassName}
              value={form.orderType}
              onChange={(e) => set("orderType", e.target.value as WorkOrderOrderType | "")}
            >
              <option value="">Select Work Order or Job Order</option>
              <option value="work_order">{WORK_INSTRUCTION_KIND_LABELS.work_order}</option>
              <option value="job_order">{WORK_INSTRUCTION_KIND_LABELS.job_order}</option>
            </select>
          </FormField>
        )}

        <FormField label="Title" htmlFor="wos-title" required error={errors.title} className="sm:col-span-2">
          <input id="wos-title" className={inputClassName} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="What is being submitted" />
        </FormField>

        {workLinked ? null : (
          <FormField label="Facility" htmlFor="wos-facility" required error={errors.facility}>
            <select id="wos-facility" className={inputClassName} value={form.facility} onChange={(e) => set("facility", e.target.value)}>
              <option value="">Select facility</option>
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
              {facilities.length > 1 ? (
                <option value={ALL_FACILITIES}>Both</option>
              ) : null}
            </select>
          </FormField>
        )}

        <FormField label="Submission status" htmlFor="wos-status" required hint="Follow-ups are recorded separately and never imply payment.">
          <select
            id="wos-status"
            className={inputClassName}
            value={form.submissionStatus}
            onChange={(e) => set("submissionStatus", e.target.value as WorkOrderSubmissionStatus)}
          >
            {(Object.keys(WORK_ORDER_SUBMISSION_STATUS_LABELS) as WorkOrderSubmissionStatus[]).map((status) => (
              <option key={status} value={status}>
                {WORK_ORDER_SUBMISSION_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Submission date" htmlFor="wos-date" required={form.submissionStatus !== "draft"} error={errors.submissionDate}>
          <input id="wos-date" type="date" className={inputClassName} value={form.submissionDate} onChange={(e) => set("submissionDate", e.target.value)} />
        </FormField>

        <FormField label="Amount (NGN)" htmlFor="wos-amount" required={form.submissionStatus !== "draft"} error={errors.amount} hint="The amount requested in this submission. Execution costs are recorded separately.">
          <input
            id="wos-amount"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            className={inputClassName}
            value={form.amount}
            onChange={(e) => set("amount", e.target.value)}
          />
        </FormField>

        {workLinked ? null : (
          <FormField
            label="Work included (optional)"
            htmlFor="wos-work-search"
            hint={facilityIds.length ? "Select any Work submitted in this package." : "Choose a facility to list its Work."}
            className="sm:col-span-2"
          >
            <input
              id="wos-work-search"
              className={inputClassName}
              value={workSearch}
              onChange={(e) => setWorkSearch(e.target.value)}
              placeholder="Search Work by reference or title"
              disabled={!facilityIds.length}
            />
            <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border/70 p-2">
              {workCatalog.loading ? <p className="text-xs text-muted">Loading Work…</p> : null}
              {!workCatalog.loading && facilityIds.length && eligibleWork.length === 0 ? (
                <p className="text-xs text-muted">No current Work for this facility.</p>
              ) : null}
              {eligibleWork.map((w) => {
                const checked = form.workIds.includes(w.id);
                return (
                  <label key={w.id} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      onChange={() => set("workIds", checked ? form.workIds.filter((id) => id !== w.id) : [...form.workIds, w.id])}
                    />
                    <span>
                      <span className="font-medium text-foreground">{w.id}</span> <span className="text-muted">· {w.title}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            {form.workIds.length ? <p className="mt-1 text-xs text-muted">{form.workIds.length} Work selected</p> : null}
          </FormField>
        )}
      </form>
    </Modal>
  );
}
