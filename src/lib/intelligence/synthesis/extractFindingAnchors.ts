import type { OperationalPatternFinding } from "@/lib/intelligence/patterns/detectOperationalLifecyclePatterns";
import type { FindingAnchors } from "./types";

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function evidenceValue(
  evidence: OperationalPatternFinding["evidence"],
  type: string
): unknown {
  return evidence.find((entry) => entry.type === type)?.value;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * Extract durable entity anchors from a pattern finding's evidence.
 * Used for deterministic correlation — not inferred from prose.
 */
export function extractFindingAnchors(
  finding: OperationalPatternFinding
): FindingAnchors {
  const facilityIds = unique([
    ...(finding.facilityId ? [finding.facilityId] : []),
    ...asStringArray(evidenceValue(finding.evidence, "facility_ids")),
  ]);
  const assetIds = unique(asStringArray(evidenceValue(finding.evidence, "asset_ids")));
  const entityIds = unique(asStringArray(evidenceValue(finding.evidence, "entity_ids")));
  const eventIds = unique([
    ...finding.relatedEventIds,
    ...asStringArray(evidenceValue(finding.evidence, "event_ids")),
  ]);

  const incidentIds: string[] = [];
  const maintenanceIds: string[] = [];
  const workOrderIds: string[] = [];

  for (const id of entityIds) {
    // Scope tokens from detectors: asset:X / facility:X are not entity IDs.
    if (id.startsWith("asset:") || id.startsWith("facility:")) continue;
  }

  // Pattern scope often encodes asset:/facility: in findingKey.
  const scopeMatch = finding.findingKey.match(
    /operational:[^:]+:(asset|facility):(.+)$/
  );
  if (scopeMatch?.[1] === "asset" && scopeMatch[2]) {
    assetIds.push(scopeMatch[2]);
  }
  if (scopeMatch?.[1] === "facility" && scopeMatch[2]) {
    facilityIds.push(scopeMatch[2]);
  }

  // Linked open incident IDs from delayed WO detector.
  for (const id of asStringArray(
    evidenceValue(finding.evidence, "linked_open_incident_ids")
  )) {
    incidentIds.push(id);
  }

  // Heuristic: entity IDs appearing only in incident-heavy findings.
  // Prefer explicit lists when present; otherwise keep entityIds generic.
  const maintenanceCount =
    typeof evidenceValue(finding.evidence, "maintenance_event_count") === "number"
      ? (evidenceValue(finding.evidence, "maintenance_event_count") as number)
      : 0;
  const incidentCount =
    typeof evidenceValue(finding.evidence, "incident_event_count") === "number"
      ? (evidenceValue(finding.evidence, "incident_event_count") as number)
      : 0;
  const workOrderCount =
    typeof evidenceValue(finding.evidence, "work_order_event_count") === "number"
      ? (evidenceValue(finding.evidence, "work_order_event_count") as number)
      : 0;

  // When a finding is dominated by one module, treat entityIds as that module.
  if (incidentCount > 0 && maintenanceCount === 0 && workOrderCount === 0) {
    incidentIds.push(...entityIds);
  } else if (maintenanceCount > 0 && incidentCount === 0 && workOrderCount === 0) {
    maintenanceIds.push(...entityIds);
  } else if (workOrderCount > 0 && incidentCount === 0 && maintenanceCount === 0) {
    workOrderIds.push(...entityIds);
  }

  const subject = evidenceValue(finding.evidence, "subject");
  if (typeof subject === "string" && subject.trim()) {
    assetIds.push(subject.trim());
  }

  return {
    findingId: finding.id,
    findingKey: finding.findingKey,
    patternKey: finding.patternKey,
    facilityIds: unique(facilityIds),
    assetIds: unique(assetIds),
    incidentIds: unique(incidentIds),
    maintenanceIds: unique(maintenanceIds),
    workOrderIds: unique(workOrderIds),
    entityIds: unique(entityIds),
    eventIds: unique(eventIds),
    score: finding.score,
    severity: finding.severity,
  };
}

export function enrichAnchorsFromTimelineEvents(
  anchors: FindingAnchors,
  events: Array<{
    id: string;
    entityId: string;
    entityType: string;
    facilityId: string | null;
    assetId: string | null;
    incidentId?: string | null;
    maintenanceId?: string | null;
    workOrderIds?: string[];
  }>
): FindingAnchors {
  const related = events.filter((event) => anchors.eventIds.includes(event.id));
  const facilityIds = [...anchors.facilityIds];
  const assetIds = [...anchors.assetIds];
  const incidentIds = [...anchors.incidentIds];
  const maintenanceIds = [...anchors.maintenanceIds];
  const workOrderIds = [...anchors.workOrderIds];
  const entityIds = [...anchors.entityIds];

  for (const event of related) {
    if (event.facilityId) facilityIds.push(event.facilityId);
    if (event.assetId) assetIds.push(event.assetId);
    if (event.incidentId) incidentIds.push(event.incidentId);
    if (event.maintenanceId) maintenanceIds.push(event.maintenanceId);
    if (event.workOrderIds?.length) workOrderIds.push(...event.workOrderIds);
    entityIds.push(event.entityId);
    if (event.entityType === "incident") incidentIds.push(event.entityId);
    if (event.entityType === "maintenance") maintenanceIds.push(event.entityId);
    if (event.entityType === "work_order") workOrderIds.push(event.entityId);
  }

  return {
    ...anchors,
    facilityIds: unique(facilityIds),
    assetIds: unique(assetIds),
    incidentIds: unique(incidentIds),
    maintenanceIds: unique(maintenanceIds),
    workOrderIds: unique(workOrderIds),
    entityIds: unique(entityIds),
  };
}
