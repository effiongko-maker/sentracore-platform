import type { OperationalPictureAggregate } from "@/modules/workspace/operationalPicture";
import { postToAppsScriptData } from "@/services/api/appsScriptProxy";

export const OPERATIONAL_PICTURE_CONTRACT_VERSION =
  "operational-picture.v1" as const;
export const ASSIGNMENT_SUMMARY_CONTRACT_VERSION =
  "assignment-summary.v1" as const;

type UnavailableDomain = { state: "unavailable" };
export type AssignmentSummaryDomain =
  | { state: "healthy"; active: number }
  | UnavailableDomain;

export type OperationalPictureSummary = OperationalPictureAggregate & {
  contractVersion: typeof OPERATIONAL_PICTURE_CONTRACT_VERSION;
  asOf: string;
};

export type AssignmentSummary = {
  contractVersion: typeof ASSIGNMENT_SUMMARY_CONTRACT_VERSION;
  operationalUserId: string;
  maintenance: AssignmentSummaryDomain;
  workOrders: AssignmentSummaryDomain;
  incidents: AssignmentSummaryDomain;
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function count(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value as number;
}

function state(value: unknown, label: string): "healthy" | "unavailable" {
  if (value !== "healthy" && value !== "unavailable") {
    throw new Error(`${label}.state is invalid.`);
  }
  return value;
}

function maintenanceDomain(value: unknown) {
  const domain = record(value, "maintenance");
  if (state(domain.state, "maintenance") === "unavailable") {
    return { state: "unavailable" as const };
  }
  return {
    state: "healthy" as const,
    critical: count(domain.critical, "maintenance.critical"),
    inProgress: count(domain.inProgress, "maintenance.inProgress"),
    awaitingAction: count(
      domain.awaitingAction,
      "maintenance.awaitingAction"
    ),
    overdue: count(domain.overdue, "maintenance.overdue"),
  };
}

function workOrderDomain(value: unknown) {
  const domain = record(value, "workOrders");
  if (state(domain.state, "workOrders") === "unavailable") {
    return { state: "unavailable" as const };
  }
  return {
    state: "healthy" as const,
    awaitingAction: count(domain.awaitingAction, "workOrders.awaitingAction"),
    overdue: count(domain.overdue, "workOrders.overdue"),
  };
}

function approvalDomain(value: unknown) {
  const domain = record(value, "approvals");
  if (state(domain.state, "approvals") === "unavailable") {
    return { state: "unavailable" as const };
  }
  return {
    state: "healthy" as const,
    awaitingAction: count(domain.awaitingAction, "approvals.awaitingAction"),
  };
}

function assignmentDomain(value: unknown, label: string): AssignmentSummaryDomain {
  const domain = record(value, label);
  if (state(domain.state, label) === "unavailable") {
    return { state: "unavailable" };
  }
  return { state: "healthy", active: count(domain.active, `${label}.active`) };
}

export function parseOperationalPictureSummary(
  value: unknown,
  expectedAsOf: string
): OperationalPictureSummary {
  const payload = record(value, "Operational Picture payload");
  if (payload.contractVersion !== OPERATIONAL_PICTURE_CONTRACT_VERSION) {
    throw new Error("Unsupported Operational Picture contract version.");
  }
  if (payload.asOf !== expectedAsOf) {
    throw new Error("Operational Picture asOf echo mismatch.");
  }
  return {
    contractVersion: OPERATIONAL_PICTURE_CONTRACT_VERSION,
    asOf: expectedAsOf,
    maintenance: maintenanceDomain(payload.maintenance),
    workOrders: workOrderDomain(payload.workOrders),
    approvals: approvalDomain(payload.approvals),
  };
}

export function parseAssignmentSummary(
  value: unknown,
  expectedOperationalUserId: string
): AssignmentSummary {
  const payload = record(value, "Assignment Summary payload");
  if (payload.contractVersion !== ASSIGNMENT_SUMMARY_CONTRACT_VERSION) {
    throw new Error("Unsupported Assignment Summary contract version.");
  }
  if (payload.operationalUserId !== expectedOperationalUserId) {
    throw new Error("Assignment Summary operational identity mismatch.");
  }
  return {
    contractVersion: ASSIGNMENT_SUMMARY_CONTRACT_VERSION,
    operationalUserId: expectedOperationalUserId,
    maintenance: assignmentDomain(payload.maintenance, "maintenance"),
    workOrders: assignmentDomain(payload.workOrders, "workOrders"),
    incidents: assignmentDomain(payload.incidents, "incidents"),
  };
}

export async function loadOperationalPictureSummary(
  asOf: string
): Promise<OperationalPictureSummary> {
  const data = await postToAppsScriptData(
    {
      resource: "command-centre-fm",
      action: "getOperationalPicture",
      payload: { asOf },
    },
    { resource: "command-centre-fm", action: "getOperationalPicture" },
    "CommandCentreFmSummaryService.getOperationalPicture"
  );
  return parseOperationalPictureSummary(data, asOf);
}

export async function loadAssignmentSummary(
  operationalUserId: string
): Promise<AssignmentSummary> {
  const data = await postToAppsScriptData(
    {
      resource: "command-centre-fm",
      action: "getAssignmentSummary",
      payload: { operationalUserId },
    },
    { resource: "command-centre-fm", action: "getAssignmentSummary" },
    "CommandCentreFmSummaryService.getAssignmentSummary"
  );
  return parseAssignmentSummary(data, operationalUserId);
}
