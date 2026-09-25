"use client";

import { useState } from "react";
import { Modal } from "@/components/modals/Modal";
import { FormField, inputClassName } from "@/components/forms/FormField";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

/** Same methods as the Approval follow-up (fm_commercial_follow_ups.method). */
export const COMMERCIAL_FOLLOW_UP_METHODS = [
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "physical_visit", label: "Physical visit" },
  { value: "client_portal", label: "Client portal" },
  { value: "other", label: "Other" },
] as const;

export type CommercialFollowUpMethodValue = (typeof COMMERCIAL_FOLLOW_UP_METHODS)[number]["value"];

export type CommercialFollowUpDraft = {
  followedUpAt: string;
  method: CommercialFollowUpMethodValue;
  contactPerson?: string;
  outcomeNotes: string;
  nextFollowUpAt?: string;
};

function localNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Record a follow-up (chasing) event — the pattern Approvals already use. Following up never changes the record's
 * status and never implies that anything has been paid.
 */
export function CommercialFollowUpModal({
  open,
  reference,
  onClose,
  onSave,
}: {
  open: boolean;
  /** Display reference of the record being followed up (e.g. WO-2026-000012, SUB-2026-000007). */
  reference: string;
  onClose: () => void;
  onSave: (draft: CommercialFollowUpDraft) => Promise<void>;
}) {
  const { toast } = useToast();
  const [followedUpAt, setFollowedUpAt] = useState(localNow);
  const [method, setMethod] = useState<CommercialFollowUpMethodValue>("phone");
  const [contactPerson, setContactPerson] = useState("");
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [nextFollowUpAt, setNextFollowUpAt] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!outcomeNotes.trim()) {
      toast({ type: "error", title: "Outcome notes required", description: "Describe the follow-up outcome before saving." });
      return;
    }
    setSaving(true);
    try {
      await onSave({
        followedUpAt: new Date(followedUpAt).toISOString(),
        method,
        contactPerson: contactPerson.trim() || undefined,
        outcomeNotes: outcomeNotes.trim(),
        nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt).toISOString() : undefined,
      });
      toast({ type: "success", title: "Follow-up recorded", description: `${reference}: status and payment state are unchanged.` });
      setOutcomeNotes("");
      setContactPerson("");
      setNextFollowUpAt("");
      onClose();
    } catch (err) {
      toast({ type: "error", title: "Unable to record follow-up", description: err instanceof Error ? err.message : "Please try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      title="Record follow-up"
      description={`${reference} · Following up does not change the status or mark anything as paid.`}
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
        <FormField label="Follow-up date/time" htmlFor="cfu-at" required>
          <input id="cfu-at" type="datetime-local" className={inputClassName} value={followedUpAt} onChange={(e) => setFollowedUpAt(e.target.value)} />
        </FormField>
        <FormField label="Method" htmlFor="cfu-method" required>
          <select id="cfu-method" className={inputClassName} value={method} onChange={(e) => setMethod(e.target.value as CommercialFollowUpMethodValue)}>
            {COMMERCIAL_FOLLOW_UP_METHODS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Contact person" htmlFor="cfu-contact">
          <input id="cfu-contact" className={inputClassName} value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} placeholder="Optional" />
        </FormField>
        <FormField label="Outcome notes" htmlFor="cfu-notes" required>
          <textarea id="cfu-notes" className={inputClassName} rows={3} value={outcomeNotes} onChange={(e) => setOutcomeNotes(e.target.value)} placeholder="What did the client say?" />
        </FormField>
        <FormField label="Next follow-up" htmlFor="cfu-next">
          <input id="cfu-next" type="datetime-local" className={inputClassName} value={nextFollowUpAt} onChange={(e) => setNextFollowUpAt(e.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}
