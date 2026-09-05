"use server";

import { ActionError, executeAction, type ActionResult } from "@/lib/actions";
import { emitActionEvent } from "@/lib/actions/events";
import { OperationalEventTypes } from "@/lib/events/taxonomy";
import { ApprovalService } from "@/services/approvals/ApprovalService";
import { WorkOrderService } from "@/services/workOrders/WorkOrderService";
import {
  appendApprovalActivity,
  newActivityId,
} from "../lifecycle";
import { toCreateApprovalFromWorkOrder } from "../utils";
import type { Approval, CreateApprovalInput } from "../types";

export type CreateApprovalFromWorkOrderResult = {
  approval: Approval;
};

/**
 * Create / update a formal client Approval Request from a Work Order.
 * Persists bidirectional relationship and bumps Work Order updatedAt.
 * Does not change Work Order status.
 */
export async function createApprovalFromWorkOrder(
  workOrderId: string,
  overrides: Partial<CreateApprovalInput> = {}
): Promise<ActionResult<CreateApprovalFromWorkOrderResult>> {
  return executeAction({
    name: "approval.create_from_work_order",
    module: "facility_management",
    requiredCapability: "approvals.manage",
    input: { workOrderId, overrides },
    handler: async (context, rawInput) => {
      const id = String(rawInput.workOrderId || "").trim();
      if (!id) {
        throw new ActionError(
          "VALIDATION_ERROR",
          "Work order id is required."
        );
      }

      const workOrder = await WorkOrderService.getWorkOrder(id);
      if (!workOrder) {
        throw new ActionError("VALIDATION_ERROR", "Work order not found.");
      }

      const payload = toCreateApprovalFromWorkOrder(
        workOrder,
        rawInput.overrides ?? {}
      );

      if (workOrder.approvalId) {
        const existing = await ApprovalService.getApproval(
          workOrder.approvalId
        );
        if (existing) {
          const summary = `Approval package revised for ${existing.id}.`;
          const updated = await ApprovalService.updateApproval(existing.id, {
            ...payload,
            status: payload.status ?? existing.status ?? "draft",
            generatedAt:
              payload.generatedAt ??
              existing.generatedAt ??
              new Date().toISOString(),
            lastActivityAt: context.now,
            lastActivitySummary: summary,
            activityLog: appendApprovalActivity(existing.activityLog, {
              id: newActivityId("apr-gen"),
              action: "approval_package_generated",
              at: context.now,
              summary,
              actorUserId: context.userId,
            }),
          });
          await WorkOrderService.updateWorkOrder(id, {
            approvalId: updated.id,
            requiresApproval: true,
          });
          return { approval: updated };
        }
      }

      const created = await ApprovalService.createApproval({
        ...payload,
        status: payload.status ?? "draft",
        lastActivityAt: context.now,
        lastActivitySummary: `Approval request created.`,
      });

      const summary = `Approval ${created.id} created for ${workOrder.id}.`;
      const approval = await ApprovalService.updateApproval(created.id, {
        lastActivityAt: context.now,
        lastActivitySummary: summary,
        activityLog: appendApprovalActivity(undefined, {
          id: newActivityId("apr-create"),
          action: "approval_created",
          at: context.now,
          summary,
          actorUserId: context.userId,
        }),
      });

      await WorkOrderService.updateWorkOrder(id, {
        approvalId: approval.id,
        requiresApproval: true,
      });

      try {
        await emitActionEvent(context, {
          eventType: OperationalEventTypes.FACILITY_APPROVAL_CREATED,
          entityType: "approval",
          entityId: approval.id,
          data: {
            approvalId: approval.id,
            workOrderId: approval.workOrderId,
            facilityId: approval.facilityId,
            status: approval.status,
            type: approval.type,
          },
        });
      } catch {
        // best-effort
      }

      return { approval };
    },
  });
}

/**
 * Persist Approval updates and bump linked Work Order recency.
 * Does not auto-transition Work Order status.
 */
export async function updateApprovalRecord(
  approvalId: string,
  input: Partial<CreateApprovalInput>
): Promise<ActionResult<{ approval: Approval }>> {
  return executeAction({
    name: "approval.update",
    module: "facility_management",
    requiredCapability: "approvals.manage",
    input: { approvalId, input },
    handler: async (_context, rawInput) => {
      const id = String(rawInput.approvalId || "").trim();
      if (!id) {
        throw new ActionError(
          "VALIDATION_ERROR",
          "Approval id is required."
        );
      }

      const approval = await ApprovalService.updateApproval(
        id,
        rawInput.input ?? {}
      );

      if (approval.workOrderId) {
        try {
          await WorkOrderService.updateWorkOrder(approval.workOrderId, {
            approvalId: approval.id,
            requiresApproval: true,
          });
        } catch {
          // Non-blocking — approval already saved.
        }
      }

      return { approval };
    },
  });
}
