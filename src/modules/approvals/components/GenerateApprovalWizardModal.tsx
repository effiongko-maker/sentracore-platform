"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, FileCheck2 } from "lucide-react";
import { Modal } from "@/components/modals/Modal";
import { Button } from "@/components/ui/Button";
import {
  FormField,
  inputClassName,
} from "@/components/forms/FormField";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import {
  useAssetName,
  useFacilityName,
  useUserName,
} from "@/hooks/useEntityLabel";
import { WorkOrderService } from "@/services/workOrders/WorkOrderService";
import type { WorkOrder } from "@/modules/work-orders/types";
import { displayWorkOrderTitle } from "@/modules/work-orders/utils";
import { createApprovalFromWorkOrder } from "../actions/createApprovalFromWorkOrder";
import {
  APPROVAL_TEMPLATES,
  DEFAULT_APPROVAL_CURRENCY,
  getApprovalTemplate,
} from "../constants";
import {
  optionalString,
  renderApprovalCoverLetter,
  toCreateApprovalFromWorkOrder,
} from "../utils";
import type { Approval, ApprovalType } from "../types";

type WizardStep = "template" | "review";

interface GenerateApprovalWizardModalProps {
  open: boolean;
  workOrderId: string;
  onClose: () => void;
  onGenerated: (approval: Approval) => void;
}

export function GenerateApprovalWizardModal({
  open,
  workOrderId,
  onClose,
  onGenerated,
}: GenerateApprovalWizardModalProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<WizardStep>("template");
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [loadingWo, setLoadingWo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [templateId, setTemplateId] = useState<ApprovalType>(
    "standard_maintenance"
  );
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [clientName, setClientName] = useState("Client");
  const [clientAddress, setClientAddress] = useState("");
  const [approvalAmount, setApprovalAmount] = useState("");
  const [currency, setCurrency] = useState(DEFAULT_APPROVAL_CURRENCY);
  const [coverLetter, setCoverLetter] = useState("");
  const [letterTouched, setLetterTouched] = useState(false);

  const facilityName = useFacilityName(workOrder?.facilityId);
  const assetName = useAssetName(workOrder?.assetId);
  const assigneeName = useUserName(workOrder?.assignedToUserId);

  useEffect(() => {
    if (!open) return;
    setStep("template");
    setLetterTouched(false);
    setTemplateId("standard_maintenance");
    setReason("");
    setClientName("Client");
    setClientAddress("");
    setCurrency(DEFAULT_APPROVAL_CURRENCY);
    setCoverLetter("");

    let cancelled = false;
    setLoadingWo(true);
    void WorkOrderService.getWorkOrder(workOrderId)
      .then((row) => {
        if (cancelled) return;
        setWorkOrder(row);
        if (row) {
          setTitle(`Approval for ${displayWorkOrderTitle(row)}`);
          setApprovalAmount(
            row.estimatedCost != null ? String(row.estimatedCost) : ""
          );
        }
      })
      .catch(() => {
        if (!cancelled) setWorkOrder(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingWo(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, workOrderId]);

  const bindContext = useMemo(() => {
    if (!workOrder) return null;
    const amountText = approvalAmount.trim();
    const amount = amountText ? Number(amountText) : undefined;
    return {
      workOrder,
      facilityName: facilityName || undefined,
      assetName: assetName || undefined,
      assigneeName: assigneeName || undefined,
      clientName,
      clientAddress,
      reason: optionalString(reason),
      approvalAmount: Number.isFinite(amount) ? amount : undefined,
      currency,
    };
  }, [
    workOrder,
    facilityName,
    assetName,
    assigneeName,
    clientName,
    clientAddress,
    reason,
    approvalAmount,
    currency,
  ]);

  useEffect(() => {
    if (!bindContext || letterTouched) return;
    setCoverLetter(renderApprovalCoverLetter(templateId, bindContext));
  }, [bindContext, templateId, letterTouched]);

  function handleContinueFromTemplate() {
    if (!workOrder) return;
    setLetterTouched(false);
    if (bindContext) {
      setCoverLetter(renderApprovalCoverLetter(templateId, bindContext));
    }
    setStep("review");
  }

  async function handleGenerate() {
    if (!workOrder) return;
    if (!title.trim()) {
      toast({
        type: "error",
        title: "Title required",
        description: "Enter a subject for this approval request.",
      });
      return;
    }
    if (!coverLetter.trim()) {
      toast({
        type: "error",
        title: "Cover letter required",
        description: "Review or edit the cover letter before generating.",
      });
      return;
    }

    setSaving(true);
    try {
      const amountText = approvalAmount.trim();
      const amount = amountText ? Number(amountText) : undefined;
      if (amountText && !Number.isFinite(amount)) {
        throw new Error("Estimated cost must be a valid number.");
      }

      const draft = toCreateApprovalFromWorkOrder(workOrder, {
        type: templateId,
        templateId,
        title: title.trim(),
        reason: optionalString(reason),
        clientName: optionalString(clientName),
        clientAddress: optionalString(clientAddress),
        approvalAmount: amount,
        currency: optionalString(currency),
        coverLetter: coverLetter.trim(),
        facilityName: facilityName || undefined,
        assetName: assetName || undefined,
        assigneeName: assigneeName || undefined,
        status: "draft",
      });

      const result = await createApprovalFromWorkOrder(workOrder.id, draft);
      if (!result.success) {
        throw new Error(result.error.message);
      }

      toast({
        type: "success",
        title: "Approval package ready",
        description: `${result.data.approval.id} generated from ${workOrder.id}.`,
      });
      onGenerated(result.data.approval);
      onClose();
    } catch (err) {
      toast({
        type: "error",
        title: "Unable to generate approval",
        description:
          err instanceof Error ? err.message : "Please try again in a moment.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Generate Approval Request"
      description={
        step === "template"
          ? "Select a cover letter template"
          : "Review auto-populated details and cover letter"
      }
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          {step === "review" ? (
            <Button
              variant="outline"
              onClick={() => setStep("template")}
              disabled={saving}
            >
              Back
            </Button>
          ) : null}
          {step === "template" ? (
            <Button
              onClick={handleContinueFromTemplate}
              disabled={!workOrder || loadingWo}
            >
              Continue
            </Button>
          ) : (
            <Button onClick={() => void handleGenerate()} disabled={saving}>
              {saving ? "Generating…" : "Generate package"}
            </Button>
          )}
        </>
      }
    >
      {loadingWo ? (
        <p className="text-sm text-muted">Loading work order…</p>
      ) : !workOrder ? (
        <p className="text-sm text-danger">
          Work order could not be loaded. A Work Order can exist without an
          Approval, but generation requires a valid Work Order record.
        </p>
      ) : step === "template" ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Source: <span className="text-foreground">{workOrder.id}</span>
            {" · "}
            {displayWorkOrderTitle(workOrder)}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {APPROVAL_TEMPLATES.map((item) => {
              const selected = templateId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setTemplateId(item.id);
                    setLetterTouched(false);
                  }}
                  aria-pressed={selected}
                  className={cn(
                    "rounded-xl border p-4 text-left transition-colors",
                    selected
                      ? "border-accent bg-accent/5"
                      : "border-border bg-card hover:border-accent/40"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-muted">
                      <FileCheck2 className="h-4 w-4" />
                    </span>
                    {selected ? (
                      <Check className="h-4 w-4 text-accent" />
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm font-semibold text-foreground">
                    {item.title}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    {item.description}
                  </p>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted">
            Selected: {getApprovalTemplate(templateId).title}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <FormField label="Subject / title" htmlFor="apr-wiz-title" required>
              <input
                id="apr-wiz-title"
                className={inputClassName}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </FormField>
            <FormField label="Client / approving authority" htmlFor="apr-wiz-client">
              <input
                id="apr-wiz-client"
                className={inputClassName}
                value={clientName}
                onChange={(event) => {
                  setClientName(event.target.value);
                  setLetterTouched(false);
                }}
              />
            </FormField>
            <FormField label="Client address" htmlFor="apr-wiz-address">
              <textarea
                id="apr-wiz-address"
                className={`${inputClassName} min-h-[4.5rem]`}
                rows={2}
                value={clientAddress}
                onChange={(event) => {
                  setClientAddress(event.target.value);
                  setLetterTouched(false);
                }}
              />
            </FormField>
            <FormField label="Reason / justification" htmlFor="apr-wiz-reason">
              <textarea
                id="apr-wiz-reason"
                className={`${inputClassName} min-h-[5rem]`}
                rows={3}
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  setLetterTouched(false);
                }}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Estimated cost" htmlFor="apr-wiz-amount">
                <input
                  id="apr-wiz-amount"
                  className={inputClassName}
                  inputMode="decimal"
                  value={approvalAmount}
                  onChange={(event) => {
                    setApprovalAmount(event.target.value);
                    setLetterTouched(false);
                  }}
                />
              </FormField>
              <FormField label="Currency" htmlFor="apr-wiz-currency">
                <input
                  id="apr-wiz-currency"
                  className={inputClassName}
                  value={currency}
                  onChange={(event) => {
                    setCurrency(event.target.value);
                    setLetterTouched(false);
                  }}
                />
              </FormField>
            </div>
            <div className="rounded-xl border border-border/70 bg-slate-50/80 p-3 text-xs text-muted">
              <p className="font-medium text-foreground">From Work Order</p>
              <ul className="mt-2 space-y-1">
                <li>Reference: {workOrder.id}</li>
                <li>Facility: {facilityName || workOrder.facilityId}</li>
                <li>Asset: {assetName || workOrder.assetId || "—"}</li>
                <li>Priority: {workOrder.priority}</li>
                <li>
                  Assignee: {assigneeName || workOrder.assignedToUserId || "—"}
                </li>
                <li>
                  Hours:{" "}
                  {workOrder.estimatedHours != null
                    ? workOrder.estimatedHours
                    : "—"}
                </li>
                <li>
                  Due:{" "}
                  {workOrder.dueAt
                    ? new Date(workOrder.dueAt).toLocaleDateString("en-GB")
                    : "—"}
                </li>
              </ul>
            </div>
          </div>

          <FormField
            label="Cover letter (editable)"
            htmlFor="apr-wiz-letter"
            className="min-h-0"
            required
          >
            <textarea
              id="apr-wiz-letter"
              className={`${inputClassName} min-h-[28rem] font-mono text-[0.8rem] leading-relaxed`}
              value={coverLetter}
              onChange={(event) => {
                setLetterTouched(true);
                setCoverLetter(event.target.value);
              }}
            />
          </FormField>
        </div>
      )}
    </Modal>
  );
}
