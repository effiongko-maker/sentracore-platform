"use server";

import { ActionError, executeAction, type ActionResult } from "@/lib/actions";
import { orchestrateCompleteWorkOrder } from "@/lib/operational/orchestration";
import type { WorkOrder } from "@/modules/work-orders/types";

export type CompleteWorkOrderInput = {
  workOrderId: string;
  completionNotes?: string;
  resolveLinkedMaintenance?: boolean;
};

export async function completeWorkOrder(
  input: CompleteWorkOrderInput
): Promise<ActionResult<WorkOrder>> {
  return executeAction({
    name: "work_order.complete",
    module: "facility_management",
    requiredCapability: "ops.edit",
    input,
    handler: async (context, rawInput) => {
      if (!rawInput.workOrderId?.trim()) {
        throw new ActionError("VALIDATION_ERROR", "Work order ID is required.");
      }

      return orchestrateCompleteWorkOrder({
        workOrderId: rawInput.workOrderId.trim(),
        context,
        completionNotes: rawInput.completionNotes,
        resolveLinkedMaintenance: rawInput.resolveLinkedMaintenance === true,
      });
    },
  });
}
