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

/**
 * Create a Work Instruction for Work. Classified Work: the Order Type is its execution basis (pass "" — a different
 * explicit value is refused server-side), and a Job Order is recorded only after the client's Approval is granted,
 * optionally with the client's own Job Order reference. Legacy-unclassified Work: the explicit Order Type is required.
 */
export async function createWorkOrderFromMaintenance(
  maintenanceId: string,
  orderType: WorkOrderOrderType | "",
  clientReference?: string
): Promise<ActionResult<CreateWorkOrderFromMaintenanceResult>> {
  return executeAction({
    name: "work_order.create_from_maintenance",
    module: "facility_management",
    requiredCapability: "ops.create",
    input: { maintenanceId, orderType, clientReference },
    handler: async (context, rawInput) => {
      const id = rawInput.maintenanceId?.trim() ?? "";
      if (!id) {
        throw new ActionError(
          "VALIDATION_ERROR",
          "Maintenance ID is required."
        );
      }

      // A supplied Order Type must be valid; when omitted the repository derives it from the Work's execution basis
      // (legacy-unclassified Work still requires it there). Never defaulted or inferred from anything else.
      let orderType: WorkOrderOrderType | undefined;
      if (rawInput.orderType) {
        const selection = validateOrderTypeSelection(rawInput.orderType);
        if (!selection.ok) {
          throw new ActionError("VALIDATION_ERROR", selection.message);
        }
        orderType = selection.kind;
      }

      return orchestrateCreateWorkOrderFromMaintenance({
        maintenanceId: id,
        orderType,
        clientReference: rawInput.clientReference?.trim() || undefined,
        context,
      });
    },
  });
}
