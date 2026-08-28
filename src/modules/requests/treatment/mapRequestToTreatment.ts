import type { CreateIncidentInput } from "@/modules/incidents/types";
import type { CreateMaintenanceInput } from "@/modules/maintenance/types";
import type { RequestRecord } from "../types";
import { optionalString } from "../utils";

/**
 * Semantic prefill only — FM completes operational fields before create.
 */
export function mapRequestToMaintenanceSeed(
  request: RequestRecord
): Partial<CreateMaintenanceInput> {
  const locationBlock = optionalString(request.locationDetail);
  const descriptionParts = [
    optionalString(request.description),
    locationBlock ? `Location: ${locationBlock}` : undefined,
    optionalString(request.reporterName)
      ? `Reported by: ${request.reporterName}`
      : undefined,
    optionalString(request.reporterContact)
      ? `Contact: ${request.reporterContact}`
      : undefined,
  ].filter(Boolean);

  return {
    title: request.title,
    description: descriptionParts.join("\n\n") || request.title,
    facilityId: request.facilityId,
    source: "request",
    type: "corrective",
    priority: "medium",
    status: "requested",
    reportedAt: request.occurredAt,
    reportedByUserId: optionalString(request.reportedByUserId),
    requiresWorkOrder: false,
    sourceRequestId: request.id,
  };
}

export function mapRequestToIncidentSeed(
  request: RequestRecord
): Partial<CreateIncidentInput> {
  return {
    title: request.title,
    description: optionalString(request.description) || request.title,
    facilityId: request.facilityId,
    locationDetail: optionalString(request.locationDetail),
    source: "request",
    type: "other",
    severity: "medium",
    status: "reported",
    reportedVia: "portal",
    reportedAt: request.occurredAt,
    reportedByUserId: optionalString(request.reportedByUserId),
    requiresWorkOrder: false,
    sourceRequestId: request.id,
  };
}
