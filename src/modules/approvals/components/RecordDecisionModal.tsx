"use client";

import { useState } from "react";
import { Modal } from "@/components/modals/Modal";
import { FormField, inputClassName } from "@/components/forms/FormField";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { recordApprovalDecision } from "../actions/approvalLifecycleActions";
import type {
  Approval,
  ApprovalAttachmentRef,
  ApprovalDecisionOutcome,
} from "../types";

interface RecordDecisionModalProps {
  open: boolean;
  approval: Approval | null;
  onClose: () => void;
  onSaved: (approval: Approval) => void;
}

function toLocalDateTimeValue(iso = new Date().toISOString()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function fileToRef(
  file: File | null
): Promise<ApprovalAttachmentRef | undefined> {
  if (!file) return undefined;
  return {
    fileName: file.name,
    mimeType: file.type || undefined,
    sizeBytes: file.size,
  };
}

export function RecordDecisionModal({
  open,
  approval,
  onClose,
  onSaved,
}: RecordDecisionModalProps) {
  const { toast } = useToast();
  const [decision, setDecision] =
    useState<ApprovalDecisionOutcome>("approved");
  const [decisionAt, setDecisionAt] = useState(toLocalDateTimeValue());
  const [approvedAmount, setApprovedAmount] = useState(
    approval?.approvalAmount != null ? String(approval.approvalAmount) : ""
  );
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  if (!approval) return null;

  async function handleSave() {
    setSaving(true);
    try {
      const amount =
        approvedAmount.trim() === "" ? undefined : Number(approvedAmount);
      if (
        approvedAmount.trim() !== "" &&
        (amount == null || !Number.isFinite(amount))
      ) {
        throw new Error("Approved amount must be a valid number.");
      }

      const result = await recordApprovalDecision(approval!.id, {
        decision,
        decisionAt: new Date(decisionAt).toISOString(),
        approvedAmount: decision === "rejected" ? undefined : amount,
        decisionReference: reference.trim() || undefined,
        decisionNotes: notes.trim() || undefined,
        decisionDocument: await fileToRef(file),
      });
      if (!result.success || !result.data) {
        throw new Error(
          !result.success
            ? result.error.message
            : "Unable to record decision."
        );
      }
      toast({
        type: "success",
        title: "Decision recorded",
        description: `${result.data.approval.id} — ${decision.replace(/_/g, " ")}.`,
      });
      onSaved(result.data.approval);
      onClose();
    } catch (err) {
      toast({
        type: "error",
        title: "Unable to record decision",
        description:
          err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record decision"
      description={approval.id}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} loading={saving}>
            Save decision
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Decision" htmlFor="apr-dec-outcome" required>
          <select
            id="apr-dec-outcome"
            className={inputClassName}
            value={decision}
            onChange={(e) =>
              setDecision(e.target.value as ApprovalDecisionOutcome)
            }
          >
            <option value="approved">Approved</option>
            <option value="partially_approved">Partially approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </FormField>
        <FormField label="Decision date" htmlFor="apr-dec-at" required>
          <input
            id="apr-dec-at"
            type="datetime-local"
            className={inputClassName}
            value={decisionAt}
            onChange={(e) => setDecisionAt(e.target.value)}
          />
        </FormField>
        {decision !== "rejected" ? (
          <FormField
            label={
              decision === "partially_approved"
                ? "Approved amount (partial)"
                : "Approved amount"
            }
            htmlFor="apr-dec-amount"
          >
            <input
              id="apr-dec-amount"
              type="number"
              className={inputClassName}
              value={approvedAmount}
              onChange={(e) => setApprovedAmount(e.target.value)}
              placeholder={
                approval.approvalAmount != null
                  ? `Requested: ${approval.approvalAmount}`
                  : undefined
              }
            />
            {decision === "partially_approved" &&
            approval.approvalAmount != null ? (
              <p className="mt-1 text-xs text-muted">
                Requested / estimated:{" "}
                {approval.currency ? `${approval.currency} ` : ""}
                {approval.approvalAmount.toLocaleString()}
              </p>
            ) : null}
          </FormField>
        ) : null}
        <FormField
          label="Reference / client decision number"
          htmlFor="apr-dec-ref"
        >
          <input
            id="apr-dec-ref"
            className={inputClassName}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </FormField>
        <FormField label="Upload decision document" htmlFor="apr-dec-doc">
          <input
            id="apr-dec-doc"
            type="file"
            className={inputClassName}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </FormField>
        <FormField label="Decision notes" htmlFor="apr-dec-notes">
          <textarea
            id="apr-dec-notes"
            className={inputClassName}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder={
              decision === "rejected" ? "Rejection reason / notes" : undefined
            }
          />
        </FormField>
        <p className="text-xs text-muted">
          Recording a decision does not complete or cancel the linked Work
          Order. Approval answers whether work may proceed.
        </p>
      </div>
    </Modal>
  );
}
