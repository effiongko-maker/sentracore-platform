"use server";

import { ActionError, executeAction, type ActionResult } from "@/lib/actions";
import { orchestrateCreateWorkOrder } from "@/lib/operational/orchestration";
import type {
  CreateWorkOrderInput,
  WorkOrder,
} from "@/modules/work-orders/types";

export async function createWorkOrder(
  input: CreateWorkOrderInput
): Promise<ActionResult<WorkOrder>> {
  return executeAction({
    name: "work_order.create",
    module: "facility_management",
    requiredCapability: "ops.create",
    input,
    handler: async (context, rawInput) => {
      const title = rawInput.title?.trim() ?? "";
      const facilityId = rawInput.facilityId?.trim() ?? "";
      if (!title) {
        throw new ActionError("VALIDATION_ERROR", "Title is required.");
      }
      if (!facilityId) {
        throw new ActionError("VALIDATION_ERROR", "Facility is required.");
      }

      const { workOrder } = await orchestrateCreateWorkOrder({
        input: {
          ...rawInput,
          title,
          facilityId,
          createdByUserId: context.userId,
          updatedByUserId: context.userId,
        },
        context,
        intake: "staff",
        sideEffectMode: "after",
      });
      return workOrder;
    },
  });
}
