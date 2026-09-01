import { normalizeMaintenanceRelationships } from "@/lib/operational/relationships";
import type { Maintenance } from "@/modules/maintenance/types";

/** Canonical linked Work Order IDs for a Work / Maintenance row (deduped, ordered). */
export function collectLinkedWorkOrderIds(
  work: Pick<Maintenance, "workOrderId" | "workOrderIds">
): string[] {
  const rel = normalizeMaintenanceRelationships(work);
  return rel.workOrderIds;
}
