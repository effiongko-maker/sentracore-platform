import {
  isIncidentCancelled,
  isIncidentSuccessfullyTerminal,
  isMaintenanceCancelled,
  isMaintenanceSuccessfullyTerminal,
} from "./status";
import type { IssueTreatmentRef, IssueWorkOrderRef } from "./types";

export function mapMaintenanceToTreatmentRef(row: {
  id: string;
  title: string;
  status: string;
}): IssueTreatmentRef {
  return {
    kind: "maintenance",
    id: row.id,
    status: row.status,
    title: row.title,
    isSuccessfullyTerminal: isMaintenanceSuccessfullyTerminal(row.status),
    isCancelled: isMaintenanceCancelled(row.status),
  };
}

/**
 * Incident as treatment/handling activity when it is the linked treatment path.
 * Conceptually Incident is also Issue classification — both views are valid;
 * this ref does not create a second persistence universe.
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
  options?: { viaTreatmentId?: string; viaTreatmentKind?: "maintenance" | "incident_handling" }
): IssueWorkOrderRef {
  const viaTreatmentId =
    options?.viaTreatmentId ||
    row.maintenanceId ||
    row.incidentId;
  const viaTreatmentKind =
    options?.viaTreatmentKind ||
    (row.maintenanceId
      ? "maintenance"
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
