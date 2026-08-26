"use client";

import { useState } from "react";
import { Modal } from "@/components/modals/Modal";
import { FormField, inputClassName } from "@/components/forms/FormField";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { APPROVAL_SUBMISSION_METHOD_OPTIONS } from "../constants";
import { submitApprovalRequest } from "../actions/approvalLifecycleActions";
import type {
  Approval,
  ApprovalAttachmentRef,
  ApprovalSubmissionMethod,
} from "../types";

interface SubmitApprovalModalProps {
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

export function SubmitApprovalModal({
  open,
  approval,
  onClose,
  onSaved,
}: SubmitApprovalModalProps) {
  const { toast } = useToast();
  const [submittedAt, setSubmittedAt] = useState(toLocalDateTimeValue());
  const [method, setMethod] =
    useState<ApprovalSubmissionMethod>("email");
  const [submittedTo, setSubmittedTo] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  if (!approval) return null;

  async function handleSubmit() {
    setSaving(true);
    try {
      const acknowledgement = await fileToRef(file);
      const result = await submitApprovalRequest(approval!.id, {
        submittedAt: new Date(submittedAt).toISOString(),
        submissionMethod: method,
        submittedTo: submittedTo.trim() || undefined,
        submissionReference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        acknowledgement,
      });
      if (!result.success || !result.data) {
        throw new Error(
          !result.success
            ? result.error.message
            : "Unable to submit approval."
        );
      }
      toast({
        type: "success",
        title: "Marked as submitted",
        description: `${result.data.approval.id} is now awaiting response.`,
      });
      onSaved(result.data.approval);
      onClose();
    } catch (err) {
      toast({
        type: "error",
        title: "Unable to mark as submitted",
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
      title="Submit Approval Request"
      description={approval.id}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} loading={saving}>
            Mark as submitted
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Submission date/time" htmlFor="apr-submit-at" required>
          <input
            id="apr-submit-at"
            type="datetime-local"
            className={inputClassName}
            value={submittedAt}
            onChange={(e) => setSubmittedAt(e.target.value)}
          />
        </FormField>
        <FormField label="Submission method" htmlFor="apr-submit-method" required>
          <select
            id="apr-submit-method"
            className={inputClassName}
            value={method}
            onChange={(e) =>
              setMethod(e.target.value as ApprovalSubmissionMethod)
            }
          >
            {APPROVAL_SUBMISSION_METHOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Submitted to" htmlFor="apr-submit-to">
          <input
            id="apr-submit-to"
            className={inputClassName}
            value={submittedTo}
            onChange={(e) => setSubmittedTo(e.target.value)}
            placeholder="Client contact or organisation"
          />
        </FormField>
        <FormField
          label="Reference / correspondence number"
          htmlFor="apr-submit-ref"
        >
          <input
            id="apr-submit-ref"
            className={inputClassName}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </FormField>
        <FormField
          label="Upload acknowledgement copy"
          htmlFor="apr-submit-ack"
        >
          <input
            id="apr-submit-ack"
            type="file"
            className={inputClassName}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <p className="mt-1 text-xs text-muted">
            Optional but encouraged. Filename and metadata are persisted with
            the approval (same pattern as other operational attachments).
          </p>
        </FormField>
        <FormField label="Notes" htmlFor="apr-submit-notes">
          <textarea
            id="apr-submit-notes"
            className={inputClassName}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </FormField>
      </div>
    </Modal>
  );
}
