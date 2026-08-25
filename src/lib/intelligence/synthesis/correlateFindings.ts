import type { CorrelationStrength, FindingAnchors } from "./types";

function overlap(a: string[], b: string[]): string[] {
  if (a.length === 0 || b.length === 0) return [];
  const setB = new Set(b);
  return a.filter((value) => setB.has(value));
}

/**
 * Deterministic relationship strength between two findings.
 *
 * Strong: shared asset / incident / maintenance / work order IDs
 * Medium: shared facility + shared events or complementary pattern keys
 * Weak: shared facility only (insufficient alone to merge)
 * None: no shared anchors
 */
export function correlateFindings(
  a: FindingAnchors,
  b: FindingAnchors
): {
  strength: CorrelationStrength;
  reasons: string[];
} {
  const reasons: string[] = [];

  const sharedAssets = overlap(a.assetIds, b.assetIds);
  const sharedIncidents = overlap(a.incidentIds, b.incidentIds);
  const sharedMaintenance = overlap(a.maintenanceIds, b.maintenanceIds);
  const sharedWorkOrders = overlap(a.workOrderIds, b.workOrderIds);
  const sharedEvents = overlap(a.eventIds, b.eventIds);
  const sharedEntities = overlap(a.entityIds, b.entityIds);
  const sharedFacilities = overlap(a.facilityIds, b.facilityIds);

  if (sharedAssets.length > 0) {
    reasons.push(`shared_asset:${sharedAssets.join(",")}`);
  }
  if (sharedIncidents.length > 0) {
    reasons.push(`shared_incident:${sharedIncidents.join(",")}`);
  }
  if (sharedMaintenance.length > 0) {
    reasons.push(`shared_maintenance:${sharedMaintenance.join(",")}`);
  }
  if (sharedWorkOrders.length > 0) {
    reasons.push(`shared_work_order:${sharedWorkOrders.join(",")}`);
  }
  if (sharedEvents.length > 0) {
    reasons.push(`shared_events:${sharedEvents.length}`);
  }
  if (sharedEntities.length > 0) {
    reasons.push(`shared_entities:${sharedEntities.length}`);
  }
  if (sharedFacilities.length > 0) {
    reasons.push(`shared_facility:${sharedFacilities.join(",")}`);
  }

  const strongEntity =
    sharedAssets.length > 0 ||
    sharedIncidents.length > 0 ||
    sharedMaintenance.length > 0 ||
    sharedWorkOrders.length > 0;

  if (strongEntity || sharedEvents.length >= 2) {
    return { strength: "strong", reasons };
  }

  // Same asset-scoped entity ID appearing in both entity lists.
  if (sharedEntities.length > 0 && sharedFacilities.length > 0) {
    return { strength: "strong", reasons };
  }

  const complementary =
    isComplementaryPair(a.patternKey, b.patternKey) &&
    sharedFacilities.length > 0;

  if (complementary || (sharedFacilities.length > 0 && sharedEvents.length > 0)) {
    return { strength: "medium", reasons };
  }

  if (sharedFacilities.length > 0) {
    return { strength: "weak", reasons };
  }

  return { strength: "none", reasons: [] };
}

function isComplementaryPair(a: string, b: string): boolean {
  const pair = new Set([a, b]);
  const complementaryGroups: string[][] = [
    [
      "repeated_maintenance_without_resolution",
      "maintenance_precedes_incident",
      "delayed_work_orders",
      "asset_recurrence",
      "operational_backlog",
    ],
    [
      "incidents_after_maintenance",
      "asset_recurrence",
      "maintenance_precedes_incident",
    ],
    [
      "incidents_outpacing_response",
      "operational_backlog",
      "delayed_work_orders",
    ],
  ];

  return complementaryGroups.some((group) => {
    const set = new Set(group);
    return [...pair].every((key) => set.has(key));
  });
}

/** True when findings should be clustered into one story. */
export function shouldMergeFindings(
  a: FindingAnchors,
  b: FindingAnchors
): boolean {
  const { strength } = correlateFindings(a, b);
  if (strength === "strong") return true;
  if (strength !== "medium") return false;

  // Medium correlation still requires a durable link beyond facility alone.
  return (
    overlap(a.assetIds, b.assetIds).length > 0 ||
    overlap(a.incidentIds, b.incidentIds).length > 0 ||
    overlap(a.maintenanceIds, b.maintenanceIds).length > 0 ||
    overlap(a.workOrderIds, b.workOrderIds).length > 0 ||
    overlap(a.eventIds, b.eventIds).length > 0 ||
    overlap(a.entityIds, b.entityIds).length > 0
  );
}
