import "server-only";
import type { PaginatedResult } from "@/types";
import type {
  CreateMaintenanceInput,
  Maintenance,
  MaintenanceCatalogEntry,
  MaintenanceCatalogListParams,
  MaintenanceListParams,
  UpdateMaintenanceInput,
} from "@/modules/maintenance/types";
import { applyWorkOrderRule } from "@/modules/maintenance/utils";
import { onMaintenanceMutation } from "@/services/cache/domainCache";
import { FmWorkNotFoundError } from "./fmWorkDomain";
import { getFmWorkServerService } from "./getFmWorkServerService";

/**
 * Server-only Work persistence for Action Engine / orchestration.
 * Mirrors MaintenanceService method shapes without pulling session helpers
 * into the browser bundle.
 *
 * Browser code must use `@/services/maintenance/MaintenanceService`
 * (apiClient → /api/maintenance) instead.
 */
export const MaintenanceServerAccess = {
  async listMaintenance(
    params: MaintenanceListParams = {}
  ): Promise<PaginatedResult<Maintenance>> {
    const service = await getFmWorkServerService();
    return service.list(params);
  },

  async listMaintenanceCatalog(
    params: MaintenanceCatalogListParams = {}
  ): Promise<PaginatedResult<MaintenanceCatalogEntry>> {
    const service = await getFmWorkServerService();
    return service.listCatalog(params);
  },

  async getMaintenance(id: string): Promise<Maintenance | null> {
    try {
      const service = await getFmWorkServerService();
      return await service.getById(id);
    } catch (error) {
      if (error instanceof FmWorkNotFoundError) return null;
      throw error;
    }
  },

  async createMaintenance(
    input: CreateMaintenanceInput
  ): Promise<Maintenance> {
    const service = await getFmWorkServerService();
    const created = await service.create(applyWorkOrderRule(input));
    onMaintenanceMutation();
    return created;
  },

  async updateMaintenance(
    id: string,
    input: UpdateMaintenanceInput
  ): Promise<Maintenance> {
    const { entity } = await MaintenanceServerAccess.updateMaintenanceWithMeta(
      id,
      input
    );
    return entity;
  },

  async updateMaintenanceWithMeta(
    id: string,
    input: UpdateMaintenanceInput
  ): Promise<{ entity: Maintenance; previousStatus: string }> {
    const service = await getFmWorkServerService();
    const raw = await service.update(
      applyWorkOrderRule({
        ...input,
        id,
        _returnPreviousStatus: true,
      } as UpdateMaintenanceInput & {
        id: string;
        _returnPreviousStatus: boolean;
      })
    );
    const previousStatus =
      raw._previousStatus != null && String(raw._previousStatus).trim()
        ? String(raw._previousStatus)
        : String(raw.status ?? "requested");
    const entity = { ...raw };
    delete entity._previousStatus;
    onMaintenanceMutation();
    return { entity, previousStatus };
  },

  async deactivateMaintenance(id: string): Promise<Maintenance> {
    const service = await getFmWorkServerService();
    const deactivated = await service.deactivate({ id });
    onMaintenanceMutation();
    return deactivated;
  },
};
