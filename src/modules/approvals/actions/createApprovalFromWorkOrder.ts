"use server";

import { ActionError, executeAction, type ActionResult } from "@/lib/actions";
import { emitActionEvent } from "@/lib/actions/events";
import { OperationalEventTypes } from "@/lib/events/taxonomy";
import { ApprovalServerAccess as ApprovalService } from "@/modules/approvals/server/ApprovalServerAccess";
import { FmApprovalAlreadyExistsError } from "@/modules/approvals/server/FmApprovalRepository";
import { WorkInstructionServerAccess as WorkOrderService } from "@/modules/work-orders/server/WorkInstructionServerAccess";
import { toCreateApprovalFromWorkOrder } from "../utils";
import type { Approval, CreateApprovalInput } from "../types";

export type CreateApprovalFromWorkOrderResult = {
  approval: Approval;
};

/**
 * Create / revise the formal client Approval Request of a Work Instruction.
 * One Approval per Work Instruction (a UUID relationship — never matched by
 * code). Revising updates the existing Approval. Retry-safe: a concurrent
 * create loses on the unique index and falls back to revising the winner.
 * `requires_approval` records the declared requirement; the Approval's
 * existence and status are separate facts. Does not change Work Instruction status.
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
        throw new ActionError("VALIDATION_ERROR", "Work order id is required.");
      }

      const workOrder = await WorkOrderService.getWorkOrder(id);
      if (!workOrder) {
        throw new ActionError("VALIDATION_ERROR", "Work order not found.");
      }

      const payload = toCreateApprovalFromWorkOrder(workOrder, rawInput.overrides ?? {});
      const instructionRef = workOrder.workOrderUuid ?? workOrder.id;

      const revise = async (existing: Approval): Promise<Approval> => {
        const summary = `Approval package revised for ${existing.id}.`;
        return ApprovalService.updateApproval(
          existing.id,
          {
            ...payload,
            workOrderId: instructionRef,
            // Revising a package never resets lifecycle status (a recorded
            // decision must not silently revert to draft) unless explicitly asked.
            status: rawInput.overrides?.status ?? existing.status,
            generatedAt: payload.generatedAt ?? existing.generatedAt ?? new Date().toISOString(),
          },
          {
            activity: {
              action: "approval_package_generated",
              at: context.now,
              summary,
            },
          }
        );
      };

      const existing = await ApprovalService.getApprovalForWorkInstruction(instructionRef);
      if (existing) {
        const approval = await revise(existing);
        await WorkOrderService.updateWorkOrder(id, { requiresApproval: true });
        return { approval };
      }

      let approval: Approval;
      let created = true;
      try {
        approval = await ApprovalService.createApproval(
          { ...payload, workOrderId: instructionRef, status: payload.status ?? "draft" },
          {
            activity: {
              action: "approval_created",
              at: context.now,
              summary: `Approval request created for ${workOrder.id}.`,
            },
          }
        );
      } catch (error) {
        if (!(error instanceof FmApprovalAlreadyExistsError)) throw error;
        const raced = await ApprovalService.getApprovalForWorkInstruction(instructionRef);
        if (!raced) throw error;
        approval = await revise(raced);
        created = false;
      }

      await WorkOrderService.updateWorkOrder(id, { requiresApproval: true });

      if (created) {
        try {
          await emitActionEvent(context, {
            eventType: OperationalEventTypes.FACILITY_APPROVAL_CREATED,
            entityType: "approval",
            entityId: approval.approvalUuid ?? approval.id,
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
      }

      return { approval };
    },
  });
}

/**
 * Persist descriptive Approval updates. Decision fields and decision
 * statuses are rejected here — only approval.record_decision may write them.
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
        throw new ActionError("VALIDATION_ERROR", "Approval id is required.");
      }
      const approval = await ApprovalService.updateApproval(id, rawInput.input ?? {});
      return { approval };
    },
  });
}
