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
import {
  updateApprovalRecord,
} from "../actions/createApprovalFromWorkOrder";
import {
  APPROVAL_STATUS_FILTER_OPTIONS,
  APPROVAL_TYPES,
  DEFAULT_APPROVAL_CURRENCY,
} from "../constants";
import {
  labelizeApprovalStatus,
  labelizeApprovalType,
  optionalString,
} from "../utils";
import type { Approval, ApprovalStatus, ApprovalType } from "../types";

interface ApprovalFormModalProps {
  open: boolean;
  approval: Approval;
  onClose: () => void;
  onSaved?: () => void;
}

type FormState = {
  title: string;
  type: ApprovalType;
  status: ApprovalStatus;
  reason: string;
  coverLetter: string;
  clientName: string;
  clientAddress: string;
  approvalAmount: string;
  approvedAmount: string;
  currency: string;
  submittedAt: string;
  decisionAt: string;
  decisionNotes: string;
  expiresAt: string;
};

function toLocalInput(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoOrUndefined(value: string): string | undefined {
  const text = value.trim();
  if (!text) return undefined;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function ApprovalFormModal({
  open,
  approval,
  onClose,
  onSaved,
}: ApprovalFormModalProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    title: approval.title,
    type: approval.type ?? "standard_maintenance",
    status: approval.status,
    reason: approval.reason ?? "",
    coverLetter: approval.coverLetter ?? "",
    clientName: approval.clientName ?? "",
    clientAddress: approval.clientAddress ?? "",
    approvalAmount:
      approval.approvalAmount != null ? String(approval.approvalAmount) : "",
    approvedAmount:
      approval.approvedAmount != null ? String(approval.approvedAmount) : "",
    currency: approval.currency ?? DEFAULT_APPROVAL_CURRENCY,
    submittedAt: toLocalInput(approval.submittedAt),
    decisionAt: toLocalInput(approval.decisionAt),
    decisionNotes: approval.decisionNotes ?? "",
    expiresAt: toLocalInput(approval.expiresAt),
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      title: approval.title,
      type: approval.type ?? "standard_maintenance",
      status: approval.status,
      reason: approval.reason ?? "",
      coverLetter: approval.coverLetter ?? "",
      clientName: approval.clientName ?? "",
      clientAddress: approval.clientAddress ?? "",
      approvalAmount:
        approval.approvalAmount != null ? String(approval.approvalAmount) : "",
      approvedAmount:
        approval.approvedAmount != null ? String(approval.approvedAmount) : "",
      currency: approval.currency ?? DEFAULT_APPROVAL_CURRENCY,
      submittedAt: toLocalInput(approval.submittedAt),
      decisionAt: toLocalInput(approval.decisionAt),
      decisionNotes: approval.decisionNotes ?? "",
      expiresAt: toLocalInput(approval.expiresAt),
    });
  }, [open, approval]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!form.title.trim()) {
      toast({
        type: "error",
        title: "Title required",
        description: "Enter a title for this approval request.",
      });
      return;
    }

    setSaving(true);
    try {
      const amountText = form.approvalAmount.trim();
      const amount = amountText ? Number(amountText) : undefined;
      if (amountText && !Number.isFinite(amount)) {
        throw new Error("Approval amount must be a valid number.");
      }
      const approvedText = form.approvedAmount.trim();
      const approvedAmount = approvedText ? Number(approvedText) : undefined;
      if (approvedText && !Number.isFinite(approvedAmount)) {
        throw new Error("Approved amount must be a valid number.");
      }

      const nextStatus = form.status;
      const submittedAt =
        toIsoOrUndefined(form.submittedAt) ||
        (nextStatus === "awaiting_decision" ||
        nextStatus === "submitted" ||
        nextStatus === "awaiting_response" ||
        nextStatus === "approved" ||
        nextStatus === "rejected" ||
        nextStatus === "returned"
          ? approval.submittedAt || new Date().toISOString()
          : undefined);
      const decisionAt =
        toIsoOrUndefined(form.decisionAt) ||
        (nextStatus === "approved" ||
        nextStatus === "rejected" ||
        nextStatus === "returned" ||
        nextStatus === "closed"
          ? approval.decisionAt || new Date().toISOString()
          : undefined);

      const result = await updateApprovalRecord(approval.id, {
        title: form.title.trim(),
        type: form.type,
        status: nextStatus,
        reason: optionalString(form.reason),
        coverLetter: optionalString(form.coverLetter),
        clientName: optionalString(form.clientName),
        clientAddress: optionalString(form.clientAddress),
        approvalAmount: amount,
        approvedAmount,
        currency: optionalString(form.currency),
        submittedAt,
        decisionAt,
        decisionNotes: optionalString(form.decisionNotes),
        expiresAt: toIsoOrUndefined(form.expiresAt),
        generatedAt:
          approval.generatedAt ||
          (nextStatus !== "draft" ? new Date().toISOString() : undefined),
      });
      if (!result.success) {
        throw new Error(result.error.message);
      }

      toast({
        type: "success",
        title: "Approval updated",
        description: `${approval.id} has been saved.`,
      });
      onSaved?.();
      onClose();
    } catch (err) {
      toast({
        type: "error",
        title: "Unable to update approval",
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
      title="Edit approval"
      description={approval.id}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving…" : "Save approval"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Title" htmlFor="apr-title" className="sm:col-span-2" required>
          <input
            id="apr-title"
            className={inputClassName}
            value={form.title}
            onChange={(event) => updateField("title", event.target.value)}
          />
        </FormField>

        <FormField label="Status" htmlFor="apr-status" required>
          <select
            id="apr-status"
            className={selectClassName}
            value={form.status}
            onChange={(event) =>
              updateField("status", event.target.value as ApprovalStatus)
            }
          >
            {APPROVAL_STATUS_FILTER_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {labelizeApprovalStatus(value)}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Type" htmlFor="apr-type" required>
          <select
            id="apr-type"
            className={selectClassName}
            value={form.type}
            onChange={(event) =>
              updateField("type", event.target.value as ApprovalType)
            }
          >
            {APPROVAL_TYPES.map((value) => (
              <option key={value} value={value}>
                {labelizeApprovalType(value)}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Work Order" htmlFor="apr-work-order">
          <input
            id="apr-work-order"
            className={inputClassName}
            value={approval.workOrderId}
            disabled
          />
        </FormField>

        <FormField label="Client name" htmlFor="apr-client">
          <input
            id="apr-client"
            className={inputClassName}
            value={form.clientName}
            onChange={(event) => updateField("clientName", event.target.value)}
          />
        </FormField>

        <FormField label="Approval amount" htmlFor="apr-amount">
          <input
            id="apr-amount"
            className={inputClassName}
            inputMode="decimal"
            value={form.approvalAmount}
            onChange={(event) =>
              updateField("approvalAmount", event.target.value)
            }
          />
        </FormField>

        <FormField label="Approved amount" htmlFor="apr-approved-amount">
          <input
            id="apr-approved-amount"
            className={inputClassName}
            inputMode="decimal"
            value={form.approvedAmount}
            onChange={(event) =>
              updateField("approvedAmount", event.target.value)
            }
          />
        </FormField>

        <FormField label="Currency" htmlFor="apr-currency">
          <input
            id="apr-currency"
            className={inputClassName}
            value={form.currency}
            onChange={(event) => updateField("currency", event.target.value)}
          />
        </FormField>

        <FormField label="Submitted at" htmlFor="apr-submitted">
          <input
            id="apr-submitted"
            type="datetime-local"
            className={inputClassName}
            value={form.submittedAt}
            onChange={(event) => updateField("submittedAt", event.target.value)}
          />
        </FormField>

        <FormField label="Decision at" htmlFor="apr-decision">
          <input
            id="apr-decision"
            type="datetime-local"
            className={inputClassName}
            value={form.decisionAt}
            onChange={(event) => updateField("decisionAt", event.target.value)}
          />
        </FormField>

        <FormField label="Expires at" htmlFor="apr-expires">
          <input
            id="apr-expires"
            type="datetime-local"
            className={inputClassName}
            value={form.expiresAt}
            onChange={(event) => updateField("expiresAt", event.target.value)}
          />
        </FormField>

        <FormField label="Client address" htmlFor="apr-client-address" className="sm:col-span-2">
          <textarea
            id="apr-client-address"
            className={`${inputClassName} min-h-[4.5rem]`}
            rows={2}
            value={form.clientAddress}
            onChange={(event) =>
              updateField("clientAddress", event.target.value)
            }
          />
        </FormField>

        <FormField label="Reason" htmlFor="apr-reason" className="sm:col-span-2">
          <textarea
            id="apr-reason"
            className={`${inputClassName} min-h-[5rem]`}
            rows={3}
            value={form.reason}
            onChange={(event) => updateField("reason", event.target.value)}
          />
        </FormField>

        <FormField label="Cover letter" htmlFor="apr-letter" className="sm:col-span-2">
          <textarea
            id="apr-letter"
            className={`${inputClassName} min-h-[12rem]`}
            rows={8}
            value={form.coverLetter}
            onChange={(event) => updateField("coverLetter", event.target.value)}
          />
        </FormField>

        <FormField label="Decision notes" htmlFor="apr-notes" className="sm:col-span-2">
          <textarea
            id="apr-notes"
            className={`${inputClassName} min-h-[5rem]`}
            rows={3}
            value={form.decisionNotes}
            onChange={(event) =>
              updateField("decisionNotes", event.target.value)
            }
          />
        </FormField>
      </div>
    </Modal>
  );
}
