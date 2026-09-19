"use server";

import { ActionError, executeAction, type ActionResult } from "@/lib/actions";
import { orchestrateCreateWorkOrderFromMaintenance } from "@/lib/operational/orchestration";
import type { Maintenance } from "@/modules/maintenance/types";
import type { WorkOrder, WorkOrderOrderType } from "@/modules/work-orders/types";
import { validateOrderTypeSelection } from "../instructionKind";

export type CreateWorkOrderFromMaintenanceResult = {
  maintenance: Maintenance;
  workOrder: WorkOrder;
};

export async function createWorkOrderFromMaintenance(
  maintenanceId: string,
  orderType: WorkOrderOrderType | ""
): Promise<ActionResult<CreateWorkOrderFromMaintenanceResult>> {
  return executeAction({
    name: "work_order.create_from_maintenance",
    module: "facility_management",
    requiredCapability: "ops.create",
    input: { maintenanceId, orderType },
    handler: async (context, rawInput) => {
      const id = rawInput.maintenanceId?.trim() ?? "";
      if (!id) {
        throw new ActionError(
          "VALIDATION_ERROR",
          "Maintenance ID is required."
        );
      }

      // Order Type is a manual selection — never defaulted or inferred.
      const selection = validateOrderTypeSelection(rawInput.orderType);
      if (!selection.ok) {
        throw new ActionError("VALIDATION_ERROR", selection.message);
      }

      return orchestrateCreateWorkOrderFromMaintenance({
        maintenanceId: id,
        orderType: selection.kind,
        context,
      });
    },
  });
}
