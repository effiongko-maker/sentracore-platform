/**
 * Domain cache key namespaces + mutation invalidation helpers.
 *
 * Catalogs: short TTL via sharedRequest.
 * Operational lists: in-flight coalesce only.
 * Workload derive: short TTL; cleared when operational registers change.
 */

import { invalidateOperationalWorkload } from "@/lib/operational/workload/workloadCacheState";
import { EntityResolver, EntityKinds } from "@/services/entityResolver";
import { SnapshotService } from "@/services/reporting/SnapshotService";
import { invalidateSharedRequests } from "./sharedRequest";

export const CacheNamespaces = {
  usersCatalog: "catalog:users",
  assetsCatalog: "catalog:assets",
  usersList: "list:users",
  assetsList: "list:assets",
  maintenanceCatalog: "catalog:maintenance",
  facilities: "catalog:facilities",
  masterData: "catalog:master-data",
  workOrdersList: "list:work-orders",
  incidentsList: "list:incidents",
  maintenanceList: "list:maintenance",
  approvalsList: "list:approvals",
  requestsList: "list:requests",
  costRecordsList: "list:cost-records",
} as const;

export function invalidateUsersCatalog(): void {
  invalidateSharedRequests(CacheNamespaces.usersCatalog);
  EntityResolver.invalidate(EntityKinds.user);
}

export function invalidateAssetsCatalog(): void {
  invalidateSharedRequests(CacheNamespaces.assetsCatalog);
  EntityResolver.invalidate(EntityKinds.asset);
}

export function invalidateMaintenanceCatalog(): void {
  invalidateSharedRequests(CacheNamespaces.maintenanceCatalog);
}

export function invalidateFacilitiesCatalog(): void {
  invalidateSharedRequests(CacheNamespaces.facilities);
  invalidateSharedRequests(
    `${CacheNamespaces.masterData}:locationCatalog`
  );
  EntityResolver.invalidate(EntityKinds.facility);
}

export function invalidateMasterDataCatalog(entity?: string): void {
  if (entity) {
    invalidateSharedRequests(`${CacheNamespaces.masterData}:${entity}`);
    invalidateSharedRequests(
      `${CacheNamespaces.masterData}:locationCatalog`
    );
    const kind =
      entity === "departments"
        ? EntityKinds.department
        : entity === "buildings"
          ? EntityKinds.building
          : entity === "floors"
            ? EntityKinds.floor
            : entity === "rooms"
              ? EntityKinds.room
              : entity === "vendors"
                ? EntityKinds.vendor
                : null;
    if (kind) EntityResolver.invalidate(kind);
  } else {
    invalidateSharedRequests(CacheNamespaces.masterData);
    EntityResolver.invalidate(EntityKinds.department);
    EntityResolver.invalidate(EntityKinds.building);
    EntityResolver.invalidate(EntityKinds.floor);
    EntityResolver.invalidate(EntityKinds.room);
    EntityResolver.invalidate(EntityKinds.vendor);
  }
}

export function invalidateWorkOrdersLists(): void {
  invalidateSharedRequests(CacheNamespaces.workOrdersList);
  EntityResolver.invalidate(EntityKinds.workOrder);
  invalidateOperationalWorkload();
  SnapshotService.invalidate();
}

export function invalidateIncidentsLists(): void {
  invalidateSharedRequests(CacheNamespaces.incidentsList);
  invalidateOperationalWorkload();
  SnapshotService.invalidate();
}

export function invalidateMaintenanceLists(): void {
  invalidateSharedRequests(CacheNamespaces.maintenanceList);
  invalidateMaintenanceCatalog();
  EntityResolver.invalidate(EntityKinds.maintenance);
  invalidateOperationalWorkload();
  SnapshotService.invalidate();
}

export function invalidateApprovalsLists(): void {
  invalidateSharedRequests(CacheNamespaces.approvalsList);
  SnapshotService.invalidate();
}

export function invalidateRequestsLists(): void {
  invalidateSharedRequests(CacheNamespaces.requestsList);
}

export function onWorkOrderMutation(): void {
  invalidateWorkOrdersLists();
}

export function onIncidentMutation(): void {
  invalidateIncidentsLists();
}

export function onMaintenanceMutation(): void {
  invalidateMaintenanceLists();
}

export function onApprovalMutation(): void {
  invalidateApprovalsLists();
}

export function onRequestMutation(): void {
  invalidateRequestsLists();
}

export function invalidateCostRecordsLists(): void {
  invalidateSharedRequests(CacheNamespaces.costRecordsList);
  SnapshotService.invalidate();
}

export function onCostRecordMutation(): void {
  invalidateCostRecordsLists();
}

export function onUserMutation(): void {
  invalidateUsersCatalog();
  invalidateSharedRequests(CacheNamespaces.usersList);
  SnapshotService.invalidate();
}

export function onAssetMutation(): void {
  invalidateAssetsCatalog();
  invalidateSharedRequests(CacheNamespaces.assetsList);
  SnapshotService.invalidate();
}

export function onFacilityMutation(): void {
  invalidateFacilitiesCatalog();
  SnapshotService.invalidate();
}

export function onMasterDataMutation(entity: string): void {
  invalidateMasterDataCatalog(entity);
  SnapshotService.invalidate();
}
