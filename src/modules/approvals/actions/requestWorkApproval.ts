"use server";

import { ActionError, executeAction, type ActionResult } from "@/lib/actions";
import { emitActionEvent } from "@/lib/actions/events";
import { OperationalEventTypes } from "@/lib/events/taxonomy";
import { ApprovalServerAccess as ApprovalService } from "@/modules/approvals/server/ApprovalServerAccess";
import { FmApprovalAlreadyExistsError } from "@/modules/approvals/server/FmApprovalRepository";
import { MaintenanceServerAccess as MaintenanceService } from "@/modules/maintenance/server/MaintenanceServerAccess";
import type { Approval } from "../types";

export type RequestWorkApprovalResult = {
  approval: Approval;
  created: boolean;
};

/**
 * Job Order route: request the client's decision on proposed Work BEFORE any Job Order exists. The Approval belongs
 * to the Work (fm_approvals.work_id, one per Work); it never creates a Job Order or a client reference — the issued
 * Job Order is recorded from the Work once approval is granted. Retry-safe: an existing request is returned as is.
 * Submission, follow-up and the protected decision use the existing Approval lifecycle actions.
 */
export async function requestWorkApproval(workId: string): Promise<ActionResult<RequestWorkApprovalResult>> {
  return executeAction({
    name: "approval.request_for_work",
    module: "facility_management",
    requiredCapability: "approvals.manage",
    input: { workId },
    handler: async (context, rawInput) => {
      const id = String(rawInput.workId || "").trim();
      if (!id) throw new ActionError("VALIDATION_ERROR", "Work id is required.");

      const work = await MaintenanceService.getMaintenance(id);
      if (!work) throw new ActionError("VALIDATION_ERROR", "Work not found.");
      const workRef = work.workUuid ?? work.id;

      const existing = await ApprovalService.getApprovalForWork(workRef);
      if (existing) return { approval: existing, created: false };

      let approval: Approval;
      try {
        approval = await ApprovalService.createApproval(
          {
            workId: workRef,
            title: `Client approval for ${work.title}`.slice(0, 200),
            description: work.description ?? work.title,
            type: "standard_maintenance",
            status: "draft",
          },
          {
            activity: {
              action: "approval_created",
              at: context.now,
              summary: `Client approval requested for ${work.id} (before Job Order issue).`,
            },
          }
        );
      } catch (error) {
        if (!(error instanceof FmApprovalAlreadyExistsError)) throw error;
        const raced = await ApprovalService.getApprovalForWork(workRef);
        if (!raced) throw error;
        return { approval: raced, created: false };
      }

      try {
        await emitActionEvent(context, {
          eventType: OperationalEventTypes.FACILITY_APPROVAL_CREATED,
          entityType: "approval",
          entityId: approval.approvalUuid ?? approval.id,
          data: {
            approvalId: approval.id,
            workId: work.id,
            facilityId: approval.facilityId,
            status: approval.status,
            type: approval.type,
          },
        });
      } catch {
        // best-effort
      }

      return { approval, created: true };
    },
  });
}
