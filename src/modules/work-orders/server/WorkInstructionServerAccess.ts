import "server-only";
import type { PaginatedResult } from "@/types";
import type {
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
  WorkOrder,
  WorkOrderListParams,
} from "@/modules/work-orders/types";
import { onMaintenanceMutation, onWorkOrderMutation } from "@/services/cache/domainCache";
import { getFmWorkInstructionServerService } from "./getFmWorkInstructionServerService";

/**
 * Server-only Work Instruction persistence for Action Engine / orchestration.
 * Supabase (fm_work_instructions) is the single source of truth — never Apps Script.
 *
 * Browser code must use `@/services/workOrders/WorkOrderService`
 * (apiClient → /api/work-orders) instead.
 */
export const WorkInstructionServerAccess = {
  async listWorkOrders(params: WorkOrderListParams = {}): Promise<PaginatedResult<WorkOrder>> {
    return (await getFmWorkInstructionServerService()).list(params);
  },

  async getWorkOrder(idOrCode: string): Promise<WorkOrder | null> {
    return (await getFmWorkInstructionServerService()).findById(idOrCode);
  },

  async createWorkOrder(input: CreateWorkOrderInput): Promise<WorkOrder> {
    const created = await (await getFmWorkInstructionServerService()).create(input);
    onWorkOrderMutation();
    onMaintenanceMutation();
    return created;
  },

  async updateWorkOrder(idOrCode: string, input: UpdateWorkOrderInput): Promise<WorkOrder> {
    return (await WorkInstructionServerAccess.updateWorkOrderWithMeta(idOrCode, input)).entity;
  },

  async updateWorkOrderWithMeta(
    idOrCode: string,
    input: UpdateWorkOrderInput
  ): Promise<{ entity: WorkOrder; previousStatus: string }> {
    const { workOrder, previousStatus } = await (await getFmWorkInstructionServerService()).update({
      ...input,
      id: idOrCode,
    });
    onWorkOrderMutation();
    return { entity: workOrder, previousStatus };
  },
};
