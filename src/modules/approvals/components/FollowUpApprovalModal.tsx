"use client";

import { useState } from "react";
import { Modal } from "@/components/modals/Modal";
import { FormField, inputClassName } from "@/components/forms/FormField";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { APPROVAL_FOLLOW_UP_METHOD_OPTIONS } from "../constants";
import { recordApprovalFollowUp } from "../actions/approvalLifecycleActions";
import type { Approval, ApprovalFollowUpMethod } from "../types";

interface FollowUpApprovalModalProps {
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

export function FollowUpApprovalModal({
  open,
  approval,
  onClose,
  onSaved,
}: FollowUpApprovalModalProps) {
  const { toast } = useToast();
  const [followedUpAt, setFollowedUpAt] = useState(toLocalDateTimeValue());
  const [method, setMethod] = useState<ApprovalFollowUpMethod>("phone");
  const [contactPerson, setContactPerson] = useState("");
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [nextFollowUpAt, setNextFollowUpAt] = useState("");
  const [saving, setSaving] = useState(false);

  if (!approval) return null;

  async function handleSave() {
    if (!outcomeNotes.trim()) {
      toast({
        type: "error",
        title: "Outcome notes required",
        description: "Describe the follow-up outcome before saving.",
      });
      return;
    }
    setSaving(true);
    try {
      const result = await recordApprovalFollowUp(approval!.id, {
        followedUpAt: new Date(followedUpAt).toISOString(),
        method,
        contactPerson: contactPerson.trim() || undefined,
        outcomeNotes: outcomeNotes.trim(),
        nextFollowUpAt: nextFollowUpAt
          ? new Date(nextFollowUpAt).toISOString()
          : undefined,
      });
      if (!result.success || !result.data) {
        throw new Error(
          !result.success
            ? result.error.message
            : "Unable to record follow-up."
        );
      }
      toast({
        type: "success",
        title: "Follow-up recorded",
        description: `${result.data.approval.id} remains awaiting response.`,
      });
      onSaved(result.data.approval);
      onClose();
    } catch (err) {
      toast({
        type: "error",
        title: "Unable to record follow-up",
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
      title="Record Follow-up"
      description={approval.id}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} loading={saving}>
            Save follow-up
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Follow-up date/time" htmlFor="apr-fu-at" required>
          <input
            id="apr-fu-at"
            type="datetime-local"
            className={inputClassName}
            value={followedUpAt}
            onChange={(e) => setFollowedUpAt(e.target.value)}
          />
        </FormField>
        <FormField label="Method" htmlFor="apr-fu-method" required>
          <select
            id="apr-fu-method"
            className={inputClassName}
            value={method}
            onChange={(e) =>
              setMethod(e.target.value as ApprovalFollowUpMethod)
            }
          >
            {APPROVAL_FOLLOW_UP_METHOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Contact person" htmlFor="apr-fu-contact">
          <input
            id="apr-fu-contact"
            className={inputClassName}
            value={contactPerson}
            onChange={(e) => setContactPerson(e.target.value)}
          />
        </FormField>
        <FormField label="Outcome / notes" htmlFor="apr-fu-notes" required>
          <textarea
            id="apr-fu-notes"
            className={inputClassName}
            value={outcomeNotes}
            onChange={(e) => setOutcomeNotes(e.target.value)}
            rows={4}
          />
        </FormField>
        <FormField label="Next follow-up date" htmlFor="apr-fu-next">
          <input
            id="apr-fu-next"
            type="datetime-local"
            className={inputClassName}
            value={nextFollowUpAt}
            onChange={(e) => setNextFollowUpAt(e.target.value)}
          />
        </FormField>
      </div>
    </Modal>
  );
}
