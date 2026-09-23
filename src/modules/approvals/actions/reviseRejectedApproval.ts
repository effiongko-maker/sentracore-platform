"use server";

import { ActionError, executeAction, type ActionResult } from "@/lib/actions";
import { ApprovalServerAccess as ApprovalService } from "@/modules/approvals/server/ApprovalServerAccess";
import { normalizeApprovalStatus } from "../lifecycle";
import type { Approval } from "../types";

/**
 * Revise & resubmit a REJECTED Work-level client approval (Job Order route). One Approval process per Work: the same
 * row returns to draft, is revised with the existing Edit action and resubmitted with submitApprovalRequest (→
 * awaiting_decision), then decided again via approval.record_decision. The prior rejection is never lost: its
 * decision and submission details are snapshotted into the append-only activity history (written before the row is
 * reopened) alongside the original approval_rejected entry. No second Approval is created and no Job Order is touched;
 * execution stays blocked until the resubmitted Approval is granted and the Job Order is recorded.
 */
export async function reviseRejectedApproval(
  approvalId: string,
  input: { reason?: string } = {},
): Promise<ActionResult<{ approval: Approval }>> {
  return executeAction({
    name: "approval.revise_rejected",
    module: "facility_management",
    requiredCapability: "approvals.manage",
    input: { approvalId, input },
    handler: async (context, raw) => {
      const id = String(raw.approvalId || "").trim();
      if (!id) {
        throw new ActionError("VALIDATION_ERROR", "Approval id is required.");
      }
      const existing = await ApprovalService.getApproval(id);
      if (!existing) {
        throw new ActionError("VALIDATION_ERROR", "Approval not found.");
      }
      if (normalizeApprovalStatus(existing.status) !== "rejected") {
        throw new ActionError("VALIDATION_ERROR", "Only a rejected approval can be revised and resubmitted.");
      }
      if (!existing.workId) {
        throw new ActionError(
          "VALIDATION_ERROR",
          "Only a Work-level client approval (Job Order route) is revised and resubmitted.",
        );
      }

      const revisionNumber =
        (existing.activities ?? []).filter((entry) => entry.data?.revision === true).length + 1;
      const reason = raw.input?.reason?.trim() || undefined;

      const approval = await ApprovalService.updateApproval(
        id,
        {
          status: "draft",
          // The current decision / submission leave the row (the snapshot below keeps them in history).
          decisionAt: null,
          decisionOutcome: null,
          decisionNotes: null,
          decisionReference: null,
          approvedAmount: null,
          approvedByUserId: null,
          decisionDocumentFileName: null,
          decisionDocumentFileMime: null,
          decisionDocumentFileSize: null,
          submittedAt: null,
          submissionMethod: null,
          submittedTo: null,
          submissionReference: null,
          acknowledgementFileName: null,
          acknowledgementFileMime: null,
          acknowledgementFileSize: null,
          lastFollowUpAt: null,
        },
        {
          // Clears (never writes) the decision; recording a decision stays with the protected record_decision action.
          reopenRejected: true,
          activity: {
            action: "approval_updated",
            at: context.now,
            summary: `Approval ${existing.id} reopened for revision ${revisionNumber} after the client's rejection${
              reason ? ` — ${reason}` : ""
            }.`,
            data: {
              revision: true,
              revisionNumber,
              reason: reason ?? null,
              previousDecision: {
                outcome: existing.decisionOutcome ?? null,
                decisionAt: existing.decisionAt ?? null,
                decisionNotes: existing.decisionNotes ?? null,
                decisionReference: existing.decisionReference ?? null,
                decidedByProfileId: existing.approvedByUserId ?? null,
                decisionDocumentFileName: existing.decisionDocumentFileName ?? null,
              },
              previousSubmission: {
                submittedAt: existing.submittedAt ?? null,
                submissionMethod: existing.submissionMethod ?? null,
                submittedTo: existing.submittedTo ?? null,
                submissionReference: existing.submissionReference ?? null,
                approvalAmount: existing.approvalAmount ?? null,
              },
            },
          },
        },
      );

      // History is the append-only activity above; resubmission emits facility.approval_submitted as usual.
      return { approval };
    },
  });
}
