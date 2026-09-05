"use server";

import { ActionError, executeAction, type ActionResult } from "@/lib/actions";
import { orchestrateCreateWorkOrderFromMaintenance } from "@/lib/operational/orchestration";
import type { Maintenance } from "@/modules/maintenance/types";
import type { WorkOrder } from "@/modules/work-orders/types";

export type CreateWorkOrderFromMaintenanceResult = {
  maintenance: Maintenance;
  workOrder: WorkOrder;
};

export async function createWorkOrderFromMaintenance(
  maintenanceId: string
): Promise<ActionResult<CreateWorkOrderFromMaintenanceResult>> {
  return executeAction({
    name: "work_order.create_from_maintenance",
    module: "facility_management",
    requiredCapability: "ops.create",
    input: { maintenanceId },
    handler: async (context, rawInput) => {
      const id = rawInput.maintenanceId?.trim() ?? "";
      if (!id) {
        throw new ActionError(
          "VALIDATION_ERROR",
          "Maintenance ID is required."
        );
      }

      return orchestrateCreateWorkOrderFromMaintenance({
        maintenanceId: id,
        context,
      });
    },
  });
}
