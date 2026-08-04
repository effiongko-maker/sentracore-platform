import { UserService } from "@/services/users/UserService";
import { FacilityService } from "@/services/facilities/FacilityService";
import { AssetService } from "@/services/assets/AssetService";
import { WorkOrderService } from "@/services/workOrders/WorkOrderService";
import { MaintenanceService } from "@/services/maintenance/MaintenanceService";
import { loadDirectoryPages } from "./loadDirectoryPages";
import { registerEntityResolver } from "./registry";

/** Stable kind keys — import these at call sites instead of raw strings. */
export const EntityKinds = {
  user: "user",
  facility: "facility",
  asset: "asset",
  workOrder: "workOrder",
  maintenance: "maintenance",
} as const;

let defaultsRegistered = false;

/** Idempotent bootstrap of built-in entity types. */
export function registerDefaultEntityResolvers(): void {
  if (defaultsRegistered) return;
  defaultsRegistered = true;

  registerEntityResolver({
    kind: EntityKinds.user,
    label: "User",
    loadDirectory: () =>
      loadDirectoryPages({
        listPage: (page, pageSize) =>
          UserService.listUsers({ page, pageSize }),
        getId: (user) => user.id,
        getName: (user) => user.name,
      }),
  });

  registerEntityResolver({
    kind: EntityKinds.facility,
    label: "Facility",
    loadDirectory: () =>
      loadDirectoryPages({
        listPage: (page, pageSize) =>
          FacilityService.listFacilities({ page, pageSize }),
        getId: (facility) => facility.id,
        getName: (facility) => facility.name,
      }),
  });

  registerEntityResolver({
    kind: EntityKinds.asset,
    label: "Asset",
    loadDirectory: () =>
      loadDirectoryPages({
        listPage: (page, pageSize) =>
          AssetService.listAssets({ page, pageSize }),
        getId: (asset) => asset.id,
        getName: (asset) => asset.name,
      }),
  });

  registerEntityResolver({
    kind: EntityKinds.workOrder,
    label: "Work Order",
    loadDirectory: () =>
      loadDirectoryPages({
        listPage: (page, pageSize) =>
          WorkOrderService.listWorkOrders({ page, pageSize }),
        getId: (workOrder) => workOrder.id,
        getName: (workOrder) => workOrder.title,
      }),
  });

  registerEntityResolver({
    kind: EntityKinds.maintenance,
    label: "Maintenance",
    loadDirectory: () =>
      loadDirectoryPages({
        listPage: (page, pageSize) =>
          MaintenanceService.listMaintenance({ page, pageSize }),
        getId: (row) => row.id,
        getName: (row) => row.title,
      }),
  });
}
