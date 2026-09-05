"use server";

import { ActionError, executeAction, type ActionResult } from "@/lib/actions";
import { emitActionEvent } from "@/lib/actions/events";
import { OperationalEventTypes } from "@/lib/events/taxonomy";
import { ApprovalService } from "@/services/approvals/ApprovalService";
import { WorkOrderService } from "@/services/workOrders/WorkOrderService";
import {
  appendApprovalActivity,
  isAwaitingResponse,
  isAwaitingSubmission,
  newActivityId,
  normalizeApprovalStatus,
} from "../lifecycle";
import type {
  Approval,
  FollowUpApprovalInput,
  RecordApprovalDecisionInput,
  SubmitApprovalInput,
  UpdateApprovalInput,
} from "../types";

async function bumpLinkedWorkOrder(approval: Approval) {
  if (!approval.workOrderId) return;
  try {
    await WorkOrderService.updateWorkOrder(approval.workOrderId, {
      approvalId: approval.id,
      requiresApproval: true,
    });
  } catch {
    // Non-blocking — approval already saved.
  }
}

function approvalEventData(approval: Approval, extra?: Record<string, unknown>) {
  return {
    approvalId: approval.id,
    workOrderId: approval.workOrderId,
    facilityId: approval.facilityId,
    assetId: approval.assetId ?? null,
    status: approval.status,
    type: approval.type,
    approvalAmount: approval.approvalAmount ?? null,
    approvedAmount: approval.approvedAmount ?? null,
    ...extra,
  };
}

/**
 * Mark an approval as submitted to the client → awaiting_decision.
 * Atomically persists status + submittedAt + submission metadata.
 */
export async function submitApprovalRequest(
  approvalId: string,
  input: SubmitApprovalInput
): Promise<ActionResult<{ approval: Approval }>> {
  return executeAction({
    name: "approval.submit",
    module: "facility_management",
    requiredCapability: "approvals.manage",
    input: { approvalId, input },
    handler: async (context, raw) => {
      const id = String(raw.approvalId || "").trim();
      const payload = raw.input as SubmitApprovalInput;
      if (!id) {
        throw new ActionError("VALIDATION_ERROR", "Approval id is required.");
      }
      if (!payload?.submittedAt || !payload?.submissionMethod) {
        throw new ActionError(
          "VALIDATION_ERROR",
          "Submission date and method are required."
        );
      }

      const existing = await ApprovalService.getApproval(id);
      if (!existing) {
        throw new ActionError("VALIDATION_ERROR", "Approval not found.");
      }
      if (!isAwaitingSubmission(existing.status)) {
        throw new ActionError(
          "VALIDATION_ERROR",
          "Only approvals awaiting submission can be marked submitted."
        );
      }

      const now = context.now;
      const summary = `Approval ${existing.id} submitted${
        payload.submittedTo ? ` to ${payload.submittedTo}` : ""
      } via ${payload.submissionMethod.replace(/_/g, " ")}.`;

      const update: UpdateApprovalInput = {
        status: "awaiting_decision",
        submittedAt: payload.submittedAt,
        submissionMethod: payload.submissionMethod,
        submittedTo: payload.submittedTo,
        submissionReference: payload.submissionReference,
        acknowledgementFileName: payload.acknowledgement?.fileName,
        acknowledgementFileMime: payload.acknowledgement?.mimeType,
        acknowledgementFileSize: payload.acknowledgement?.sizeBytes,
        lastActivityAt: now,
        lastActivitySummary: summary,
        activityLog: appendApprovalActivity(existing.activityLog, {
          id: newActivityId("apr-submit"),
          action: "approval_submitted",
          at: now,
          summary,
          actorUserId: context.userId,
          data: {
            submissionMethod: payload.submissionMethod,
            submittedTo: payload.submittedTo,
            submissionReference: payload.submissionReference,
            notes: payload.notes,
            acknowledgementFileName: payload.acknowledgement?.fileName,
          },
        }),
      };

      const approval = await ApprovalService.updateApproval(id, update);
      // Always re-read so client surfaces match sheet (status + submittedAt).
      const verified =
        (await ApprovalService.getApproval(id)) ?? approval;
      if (
        normalizeApprovalStatus(verified.status, verified.submittedAt) ===
        "draft"
      ) {
        throw new ActionError(
          "INTERNAL_ERROR",
          "Submission saved but status did not transition to awaiting decision. Redeploy ApprovalRepository.gs and retry."
        );
      }
      await bumpLinkedWorkOrder(verified);

      try {
        await emitActionEvent(context, {
          eventType: OperationalEventTypes.FACILITY_APPROVAL_SUBMITTED,
          entityType: "approval",
          entityId: verified.id,
          data: approvalEventData(verified, {
            submissionMethod: payload.submissionMethod,
            submittedTo: payload.submittedTo ?? null,
          }),
        });
      } catch {
        // Domain write succeeded — event is best-effort.
      }

      return { approval: verified };
    },
  });
}

/**
 * Record a follow-up without changing lifecycle status.
 */
export async function recordApprovalFollowUp(
  approvalId: string,
  input: FollowUpApprovalInput
): Promise<ActionResult<{ approval: Approval }>> {
  return executeAction({
    name: "approval.follow_up",
    module: "facility_management",
    requiredCapability: "approvals.manage",
    input: { approvalId, input },
    handler: async (context, raw) => {
      const id = String(raw.approvalId || "").trim();
      const payload = raw.input as FollowUpApprovalInput;
      if (!id) {
        throw new ActionError("VALIDATION_ERROR", "Approval id is required.");
      }
      if (!payload?.followedUpAt || !payload?.method || !payload?.outcomeNotes) {
        throw new ActionError(
          "VALIDATION_ERROR",
          "Follow-up date, method, and notes are required."
        );
      }

      const existing = await ApprovalService.getApproval(id);
      if (!existing) {
        throw new ActionError("VALIDATION_ERROR", "Approval not found.");
      }
      if (!isAwaitingResponse(existing.status)) {
        throw new ActionError(
          "VALIDATION_ERROR",
          "Follow-ups apply to approvals awaiting a client response."
        );
      }

      const now = context.now;
      const summary = `Follow-up recorded on ${existing.id} via ${payload.method.replace(/_/g, " ")}.`;

      const approval = await ApprovalService.updateApproval(id, {
        lastFollowUpAt: payload.followedUpAt,
        lastActivityAt: now,
        lastActivitySummary: summary,
        activityLog: appendApprovalActivity(existing.activityLog, {
          id: newActivityId("apr-fu"),
          action: "approval_followed_up",
          at: now,
          summary,
          actorUserId: context.userId,
          data: {
            method: payload.method,
            contactPerson: payload.contactPerson,
            outcomeNotes: payload.outcomeNotes,
            nextFollowUpAt: payload.nextFollowUpAt,
            followedUpAt: payload.followedUpAt,
          },
        }),
      });
      await bumpLinkedWorkOrder(approval);

      try {
        await emitActionEvent(context, {
          eventType: OperationalEventTypes.FACILITY_APPROVAL_FOLLOWED_UP,
          entityType: "approval",
          entityId: approval.id,
          data: approvalEventData(approval, {
            method: payload.method,
            nextFollowUpAt: payload.nextFollowUpAt ?? null,
          }),
        });
      } catch {
        // best-effort
      }

      return { approval };
    },
  });
}

/**
 * Record client decision. Does not complete or cancel the Work Order.
 */
export async function recordApprovalDecision(
  approvalId: string,
  input: RecordApprovalDecisionInput
): Promise<ActionResult<{ approval: Approval }>> {
  return executeAction({
    name: "approval.record_decision",
    module: "facility_management",
    protected: true,
    protectedActionId: "approval.record_decision",
    requiredCapability: "approvals.manage",
    getStepUpPassword: (raw) =>
      (raw.input as RecordApprovalDecisionInput | undefined)?.stepUpPassword,
    input: { approvalId, input },
    handler: async (context, raw) => {
      const id = String(raw.approvalId || "").trim();
      const payload = raw.input as RecordApprovalDecisionInput;
      if (!id) {
        throw new ActionError("VALIDATION_ERROR", "Approval id is required.");
      }
      if (!payload?.decision || !payload?.decisionAt) {
        throw new ActionError(
          "VALIDATION_ERROR",
          "Decision and decision date are required."
        );
      }

      const existing = await ApprovalService.getApproval(id);
      if (!existing) {
        throw new ActionError("VALIDATION_ERROR", "Approval not found.");
      }
      if (!isAwaitingResponse(existing.status)) {
        throw new ActionError(
          "VALIDATION_ERROR",
          "Decisions can only be recorded while awaiting a response."
        );
      }

      const now = context.now;
      let nextStatus: Approval["status"] = "approved";
      let eventType: string = OperationalEventTypes.FACILITY_APPROVAL_APPROVED;
      let action: "approval_approved" | "approval_partially_approved" | "approval_rejected" =
        "approval_approved";
      let summary = `Approval ${existing.id} approved`;

      if (payload.decision === "rejected") {
        nextStatus = "rejected";
        eventType = OperationalEventTypes.FACILITY_APPROVAL_REJECTED;
        action = "approval_rejected";
        summary = `Approval ${existing.id} rejected.`;
      } else if (payload.decision === "partially_approved") {
        nextStatus = "approved";
        eventType = OperationalEventTypes.FACILITY_APPROVAL_PARTIALLY_APPROVED;
        action = "approval_partially_approved";
        summary = `Approval ${existing.id} partially approved${
          payload.approvedAmount != null
            ? ` for ${existing.currency ? `${existing.currency} ` : ""}${payload.approvedAmount.toLocaleString()}`
            : ""
        }.`;
      } else {
        summary = `Approval ${existing.id} approved${
          payload.approvedAmount != null
            ? ` for ${existing.currency ? `${existing.currency} ` : ""}${payload.approvedAmount.toLocaleString()}`
            : ""
        }.`;
      }

      const approval = await ApprovalService.updateApproval(id, {
        status: nextStatus,
        decisionAt: payload.decisionAt,
        decisionOutcome: payload.decision,
        decisionNotes: payload.decisionNotes,
        decisionReference: payload.decisionReference,
        approvedAmount:
          payload.decision === "rejected"
            ? undefined
            : payload.approvedAmount ?? existing.approvalAmount,
        approvedByUserId: context.userId,
        decisionDocumentFileName: payload.decisionDocument?.fileName,
        decisionDocumentFileMime: payload.decisionDocument?.mimeType,
        decisionDocumentFileSize: payload.decisionDocument?.sizeBytes,
        lastActivityAt: now,
        lastActivitySummary: summary,
        activityLog: appendApprovalActivity(existing.activityLog, {
          id: newActivityId("apr-dec"),
          action,
          at: now,
          summary,
          actorUserId: context.userId,
          data: {
            decision: payload.decision,
            approvedAmount: payload.approvedAmount,
            decisionReference: payload.decisionReference,
            decisionDocumentFileName: payload.decisionDocument?.fileName,
            authorityMode: context.protectedAuthority?.mode ?? null,
            authorityLabel: context.protectedAuthority?.label ?? null,
            operatingRole: context.operatingAccess?.role ?? null,
            protectedActionId: "approval.record_decision",
          },
        }),
      });
      await bumpLinkedWorkOrder(approval);

      try {
        await emitActionEvent(context, {
          eventType,
          entityType: "approval",
          entityId: approval.id,
          data: approvalEventData(approval, {
            decision: payload.decision,
            decisionReference: payload.decisionReference ?? null,
            protectedActionId: "approval.record_decision",
            authorityMode: context.protectedAuthority?.mode ?? null,
            authorityLabel: context.protectedAuthority?.label ?? null,
            operatingRole: context.operatingAccess?.role ?? null,
            platformRole: context.operatingAccess?.platformRole ?? null,
            isSuperAdmin: context.operatingAccess?.isSuperAdmin ?? false,
          }),
        });
      } catch {
        // best-effort
      }

      return { approval };
    },
  });
}

export async function cancelApprovalRequest(
  approvalId: string
): Promise<ActionResult<{ approval: Approval }>> {
  return executeAction({
    name: "approval.cancel",
    module: "facility_management",
    requiredCapability: "approvals.manage",
    input: { approvalId },
    handler: async (context, raw) => {
      const id = String(raw.approvalId || "").trim();
      if (!id) {
        throw new ActionError("VALIDATION_ERROR", "Approval id is required.");
      }
      const existing = await ApprovalService.getApproval(id);
      if (!existing) {
        throw new ActionError("VALIDATION_ERROR", "Approval not found.");
      }
      const status = normalizeApprovalStatus(existing.status);
      if (
        status === "approved" ||
        status === "cancelled" ||
        status === "expired" ||
        status === "closed"
      ) {
        throw new ActionError(
          "VALIDATION_ERROR",
          "This approval can no longer be cancelled."
        );
      }

      const now = context.now;
      const summary = `Approval ${existing.id} cancelled.`;
      const approval = await ApprovalService.updateApproval(id, {
        status: "cancelled",
        lastActivityAt: now,
        lastActivitySummary: summary,
        activityLog: appendApprovalActivity(existing.activityLog, {
          id: newActivityId("apr-cancel"),
          action: "approval_cancelled",
          at: now,
          summary,
          actorUserId: context.userId,
        }),
      });
      await bumpLinkedWorkOrder(approval);

      try {
        await emitActionEvent(context, {
          eventType: OperationalEventTypes.FACILITY_APPROVAL_CANCELLED,
          entityType: "approval",
          entityId: approval.id,
          data: approvalEventData(approval),
        });
      } catch {
        // best-effort
      }

      return { approval };
    },
  });
}
