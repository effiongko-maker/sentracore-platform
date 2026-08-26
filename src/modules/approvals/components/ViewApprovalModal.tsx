"use client";

import Link from "next/link";
import { Modal } from "@/components/modals/Modal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/utils";
import { useFacilityName } from "@/hooks/useEntityLabel";
import { APPROVAL_STATUS_VARIANT } from "../constants";
import { getApprovalLifecycleActions, parseApprovalActivityLog } from "../lifecycle";
import {
  displayApprovalTitle,
  labelizeApprovalStatus,
  labelizeApprovalType,
} from "../utils";
import type { Approval } from "../types";

interface ViewApprovalModalProps {
  open: boolean;
  approval: Approval | null;
  onClose: () => void;
  onEdit?: (approval: Approval) => void;
  onPackage?: (approval: Approval) => void;
  onSubmit?: (approval: Approval) => void;
  onFollowUp?: (approval: Approval) => void;
  onDecision?: (approval: Approval) => void;
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">
        {label}
      </p>
      <div className="text-sm text-foreground whitespace-pre-wrap">
        {value || "—"}
      </div>
    </div>
  );
}

function formatBytes(size?: number) {
  if (size == null || !Number.isFinite(size)) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function ViewApprovalModal({
  open,
  approval,
  onClose,
  onEdit,
  onPackage,
  onSubmit,
  onFollowUp,
  onDecision,
}: ViewApprovalModalProps) {
  const facilityName = useFacilityName(approval?.facilityId);

  if (!approval) return null;

  const actions = getApprovalLifecycleActions(
    approval.status,
    approval.submittedAt
  );
  const activities = parseApprovalActivityLog(approval.activityLog);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={displayApprovalTitle(approval)}
      description={approval.id}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {actions.canPrint && onPackage ? (
            <Button
              variant="outline"
              onClick={() => {
                onClose();
                onPackage(approval);
              }}
            >
              Print package
            </Button>
          ) : null}
          {actions.canSubmit && onSubmit ? (
            <Button
              onClick={() => {
                onClose();
                onSubmit(approval);
              }}
            >
              Mark as submitted
            </Button>
          ) : null}
          {actions.canFollowUp && onFollowUp ? (
            <Button
              variant="outline"
              onClick={() => {
                onClose();
                onFollowUp(approval);
              }}
            >
              Record follow-up
            </Button>
          ) : null}
          {actions.canRecordDecision && onDecision ? (
            <Button
              onClick={() => {
                onClose();
                onDecision(approval);
              }}
            >
              Record decision
            </Button>
          ) : null}
          {actions.canEdit && onEdit && !actions.canSubmit ? (
            <Button
              variant="outline"
              onClick={() => {
                onClose();
                onEdit(approval);
              }}
            >
              Edit approval
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 pb-5">
        <Badge variant={APPROVAL_STATUS_VARIANT[approval.status]}>
          {labelizeApprovalStatus(approval.status)}
        </Badge>
        {approval.decisionOutcome === "partially_approved" ? (
          <Badge variant="warning">Partially approved</Badge>
        ) : null}
        <span className="text-sm text-muted">
          {labelizeApprovalType(approval.type)}
        </span>
        {approval.workOrderId ? (
          <Link
            href="/work-orders"
            className="text-sm font-medium text-accent underline-offset-2 hover:underline"
          >
            {approval.workOrderId}
          </Link>
        ) : null}
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Detail label="Approval ID" value={approval.id} />
        <Detail label="Work Order" value={approval.workOrderId} />
        <Detail
          label="Facility"
          value={facilityName || approval.facilityId || "—"}
        />
        <Detail label="Asset" value={approval.assetId || "—"} />
        <Detail label="Client" value={approval.clientName || "—"} />
        <Detail
          label="Amount"
          value={
            approval.approvalAmount != null
              ? `${approval.currency ? `${approval.currency} ` : ""}${approval.approvalAmount.toLocaleString()}`
              : "—"
          }
        />
        <Detail
          label="Approved amount"
          value={
            approval.approvedAmount != null
              ? `${approval.currency ? `${approval.currency} ` : ""}${approval.approvedAmount.toLocaleString()}`
              : "—"
          }
        />
        <Detail label="Template" value={approval.templateId || "—"} />
        <Detail
          label="Generated"
          value={
            approval.generatedAt ? formatDate(approval.generatedAt) : "—"
          }
        />
        <Detail
          label="Submitted"
          value={
            approval.submittedAt ? formatDate(approval.submittedAt) : "—"
          }
        />
        <Detail
          label="Submission method"
          value={
            approval.submissionMethod
              ? String(approval.submissionMethod).replace(/_/g, " ")
              : "—"
          }
        />
        <Detail label="Submitted to" value={approval.submittedTo || "—"} />
        <Detail
          label="Submission reference"
          value={approval.submissionReference || "—"}
        />
        <Detail
          label="Acknowledgement / submission evidence"
          value={
            approval.acknowledgementFileName
              ? `${approval.acknowledgementFileName}${
                  approval.acknowledgementFileSize != null
                    ? ` (${formatBytes(approval.acknowledgementFileSize)})`
                    : ""
                }`
              : "—"
          }
        />
        <Detail
          label="Decision"
          value={approval.decisionAt ? formatDate(approval.decisionAt) : "—"}
        />
        <Detail
          label="Decision reference"
          value={approval.decisionReference || "—"}
        />
        <Detail
          label="Decision document"
          value={
            approval.decisionDocumentFileName
              ? `${approval.decisionDocumentFileName}${
                  approval.decisionDocumentFileSize != null
                    ? ` (${formatBytes(approval.decisionDocumentFileSize)})`
                    : ""
                }`
              : "—"
          }
        />
        <Detail
          label="Expires"
          value={approval.expiresAt ? formatDate(approval.expiresAt) : "—"}
        />
        <Detail
          label="Last activity"
          value={
            approval.lastActivitySummary
              ? `${approval.lastActivitySummary}${
                  approval.lastActivityAt
                    ? ` · ${formatDate(approval.lastActivityAt)}`
                    : ""
                }`
              : "—"
          }
        />
        <Detail
          label="Last follow-up"
          value={
            approval.lastFollowUpAt ? formatDate(approval.lastFollowUpAt) : "—"
          }
        />
        <Detail label="Description" value={approval.description || "—"} />
        <Detail label="Reason" value={approval.reason || "—"} />
        <Detail
          label="Decision notes"
          value={approval.decisionNotes || "—"}
        />
        <div className="sm:col-span-2">
          <Detail label="Client address" value={approval.clientAddress || "—"} />
        </div>
        <div className="sm:col-span-2">
          <Detail label="Cover letter" value={approval.coverLetter || "—"} />
        </div>
        {activities.length > 0 ? (
          <div className="sm:col-span-2 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">
              Activity
            </p>
            <ul className="space-y-2 rounded-lg border border-border/70 p-3">
              {[...activities].reverse().slice(0, 8).map((entry) => (
                <li key={entry.id} className="text-sm text-foreground">
                  <span className="text-muted">
                    {entry.at ? formatDate(entry.at) : "—"}
                  </span>
                  {" · "}
                  {entry.summary}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
