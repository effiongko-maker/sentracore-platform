"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/modals/Modal";
import { Button } from "@/components/ui/Button";
import {
  FormField,
  inputClassName,
  selectClassName,
} from "@/components/forms/FormField";
import { useToast } from "@/components/ui/Toast";
import { useFacilities } from "@/modules/facilities/hooks/useFacilities";
import { labelize } from "@/modules/incidents/utils";
import { logIssue, type LogIssueResult } from "../actions/logIssue";

const URGENCY = ["low", "medium", "high", "critical"] as const;

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (result: LogIssueResult) => void;
};

/**
 * FM Log Issue — describe what needs attention.
 * Creates Work (Maintenance backing). No Incident. No taxonomy.
 */
export function LogIssueModal({ open, onClose, onCreated }: Props) {
  const { toast } = useToast();
  const { facilities } = useFacilities();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [facilityId, setFacilityId] = useState("");
  const [locationDetail, setLocationDetail] = useState("");
  const [urgency, setUrgency] =
    useState<(typeof URGENCY)[number]>("medium");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDescription("");
    setLocationDetail("");
    setUrgency("medium");
    setFacilityId((prev) => prev || facilities[0]?.id || "");
  }, [open, facilities]);

  const facilityOptions = useMemo(
    () =>
      facilities.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name || f.id}
        </option>
      )),
    [facilities]
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await logIssue({
        title,
        description: description || undefined,
        facilityId,
        locationDetail: locationDetail || undefined,
        urgency,
      });
      if (!result.success) {
        throw new Error(result.error.message);
      }
      if (result.data.requestId !== null) {
        throw new Error("Log Issue incorrectly created a Request");
      }
      toast({
        type: "success",
        title: "Issue logged",
        description: `Logged — continue work from ${result.data.rootId}.`,
      });
      onCreated(result.data);
      onClose();
    } catch (err) {
      toast({
        type: "error",
        title: "Could not log Issue",
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
      title="Log Issue"
      description="Describe what needs attention. Treating the Issue creates work."
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="log-issue-form" disabled={saving}>
            {saving ? "Logging…" : "Log Issue"}
          </Button>
        </div>
      }
    >
      <form id="log-issue-form" className="space-y-4" onSubmit={handleSubmit}>
        <FormField label="What happened?" htmlFor="log-issue-title" required>
          <input
            id="log-issue-title"
            className={inputClassName}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="Short description of what needs attention"
          />
        </FormField>

        <FormField label="Details" htmlFor="log-issue-desc">
          <textarea
            id="log-issue-desc"
            className={inputClassName}
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FormField>

        <FormField label="Facility" htmlFor="log-issue-facility" required>
          <select
            id="log-issue-facility"
            className={selectClassName}
            value={facilityId}
            onChange={(e) => setFacilityId(e.target.value)}
            required
          >
            <option value="">Select facility</option>
            {facilityOptions}
          </select>
        </FormField>

        <FormField label="Location detail" htmlFor="log-issue-location">
          <input
            id="log-issue-location"
            className={inputClassName}
            value={locationDetail}
            onChange={(e) => setLocationDetail(e.target.value)}
            placeholder="Floor, room, area…"
          />
        </FormField>

        <FormField label="Priority" htmlFor="log-issue-urgency">
          <select
            id="log-issue-urgency"
            className={selectClassName}
            value={urgency}
            onChange={(e) =>
              setUrgency(e.target.value as (typeof URGENCY)[number])
            }
          >
            {URGENCY.map((u) => (
              <option key={u} value={u}>
                {labelize(u)}
              </option>
            ))}
          </select>
        </FormField>
      </form>
    </Modal>
  );
}
