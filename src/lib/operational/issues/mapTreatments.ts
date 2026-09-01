import {
  isIncidentCancelled,
  isIncidentSuccessfullyTerminal,
  isMaintenanceCancelled,
  isMaintenanceSuccessfullyTerminal,
} from "./status";
import type { IssueTreatmentRef, IssueWorkOrderRef } from "./types";

/**
 * Map Maintenance row → Work treatment ref (Phase 15).
 * Kind is "work"; persistence remains Maintenance.
 */
export function mapMaintenanceToTreatmentRef(row: {
  id: string;
  title: string;
  status: string;
}): IssueTreatmentRef {
  return {
    kind: "work",
    id: row.id,
    status: row.status,
    title: row.title,
    isSuccessfullyTerminal: isMaintenanceSuccessfullyTerminal(row.status),
    isCancelled: isMaintenanceCancelled(row.status),
  };
}

/** @deprecated Prefer mapMaintenanceToTreatmentRef (emits kind work). */
export const mapWorkToTreatmentRef = mapMaintenanceToTreatmentRef;

/**
 * Legacy Incident handling — only when an Incident record already exists.
 * Not used for new FM Log Issue / canonical Treat → Work flows.
 */
export function mapIncidentToTreatmentRef(row: {
  id: string;
  title: string;
  status: string;
}): IssueTreatmentRef {
  return {
    kind: "incident_handling",
    id: row.id,
    status: row.status,
    title: row.title,
    isSuccessfullyTerminal: isIncidentSuccessfullyTerminal(row.status),
    isCancelled: isIncidentCancelled(row.status),
  };
}

export function mapWorkOrderToIssueRef(
  row: {
    id: string;
    title: string;
    status: string;
    maintenanceId?: string;
    incidentId?: string;
  },
  options?: {
    viaTreatmentId?: string;
    viaTreatmentKind?: "work" | "maintenance" | "incident_handling";
  }
): IssueWorkOrderRef {
  const viaTreatmentId =
    options?.viaTreatmentId || row.maintenanceId || row.incidentId;
  const viaTreatmentKind =
    options?.viaTreatmentKind ||
    (row.maintenanceId
      ? "work"
      : row.incidentId
        ? "incident_handling"
        : undefined);

  return {
    id: row.id,
    status: row.status,
    title: row.title,
    viaTreatmentId,
    viaTreatmentKind,
  };
}
