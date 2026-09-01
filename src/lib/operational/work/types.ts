/**
 * Work domain — Phase 15 consolidation foundation.
 *
 * Conceptual: WORK = what we are doing about an Issue (treatment/action).
 * Persistence (compatibility): existing Maintenance sheet / Maintenance.status.
 *
 * Work ≠ Work Order (execution).
 * Work ≠ Incident (legacy domain — do not create for normal FM flows).
 *
 * @see MODEL.md
 */

import type { Maintenance, MaintenanceStatus } from "@/modules/maintenance/types";

/**
 * Physical backing store for Work during compatibility.
 * Do not create a Work sheet in Phase 15.
 */
export const WORK_BACKING_STORE = {
  domain: "maintenance" as const,
  sheet: "Maintenance",
  statusField: "Maintenance.status",
  idPrefix: "MNT-",
  note: "Work is conceptually distinct from Maintenance. Existing Maintenance persistence is the temporary Work store.",
} as const;

/**
 * Work lifecycle = Maintenance.status values (unchanged physically).
 * Conceptual semantics documented in MODEL.md.
 */
export type WorkStatus = MaintenanceStatus;

export type WorkPriority = "low" | "medium" | "high" | "critical";

/**
 * Operational Work activity addressing an Issue.
 * Mapped from Maintenance rows — not a second persisted entity.
 */
export type WorkRecord = {
  id: string;
  title: string;
  description?: string;
  facilityId: string;
  /** Location may live on Issue context or description notes. */
  locationDetail?: string;
  assetId?: string;
  priority: WorkPriority;
  status: WorkStatus;
  department?: string;
  assignedToUserId?: string;
  assignedGroupId?: string;
  reportedByUserId?: string;
  reportedAt: string;
  scheduledStartAt?: string;
  scheduledEndAt?: string;
  dueAt?: string;
  startedAt?: string;
  completedAt?: string;
  completionNotes?: string;
  workPerformed?: string;
  holdReason?: string;
  requiresWorkOrder?: boolean;
  workOrderId?: string;
  workOrderIds?: string[];
  /** Intake Request when Work was created from staff Request. */
  sourceRequestId?: string;
  /** Legacy Incident link when present — compatibility only. */
  legacyIncidentId?: string;
  operationalEventId?: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId?: string;
  updatedByUserId?: string;
  /**
   * Compatibility marker: this Work view is projected from a Maintenance row.
   */
  backing: {
    kind: "maintenance";
    maintenanceId: string;
  };
};

/** Conceptual Work lifecycle meaning (status strings unchanged). */
export const WORK_STATUS_SEMANTICS: Record<WorkStatus, string> = {
  requested: "work identified",
  triaged: "work assessed",
  scheduled: "work scheduled",
  in_progress: "work underway",
  on_hold: "work paused",
  completed: "work completed",
  cancelled: "work cancelled",
};

/** Operator-facing status labels (persisted values unchanged). */
export const WORK_STATUS_LABELS: Record<WorkStatus, string> = {
  requested: "Awaiting action",
  triaged: "Assessed",
  scheduled: "Scheduled",
  in_progress: "In progress",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** Issue lens identity for a Work-backed Maintenance root. */
export function issueHrefForWork(workId: string): string {
  return `/issues?id=${encodeURIComponent(`issue:maintenance:${workId}`)}`;
}

export function requestHrefForWork(requestId: string): string {
  return `/requests?id=${encodeURIComponent(requestId)}`;
}

export function mapMaintenanceToWork(m: Maintenance): WorkRecord {
  return {
    id: m.id,
    title: m.title,
    description: m.description,
    facilityId: m.facilityId,
    assetId: m.assetId,
    priority: m.priority,
    status: m.status,
    department: m.department,
    assignedToUserId: m.assignedToUserId,
    assignedGroupId: m.assignedGroupId,
    reportedByUserId: m.reportedByUserId,
    reportedAt: m.reportedAt,
    scheduledStartAt: m.scheduledStartAt,
    scheduledEndAt: m.scheduledEndAt,
    dueAt: m.dueAt,
    startedAt: m.startedAt,
    completedAt: m.completedAt,
    completionNotes: m.completionNotes,
    workPerformed: m.workPerformed,
    holdReason: m.holdReason,
    requiresWorkOrder: m.requiresWorkOrder,
    workOrderId: m.workOrderId,
    workOrderIds: m.workOrderIds,
    sourceRequestId: m.sourceRequestId,
    legacyIncidentId: m.incidentId,
    operationalEventId: m.operationalEventId,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    createdByUserId: m.createdByUserId,
    updatedByUserId: m.updatedByUserId,
    backing: {
      kind: "maintenance",
      maintenanceId: m.id,
    },
  };
}

export function isWorkSuccessfullyTerminal(status: string): boolean {
  return status === "completed";
}

export function isWorkCancelled(status: string): boolean {
  return status === "cancelled";
}

/** Deep-link into the Work / WIP surface (Phase 16). */
export function workHref(workId: string): string {
  return `/work?id=${encodeURIComponent(workId)}`;
}

/** Compatibility deep-link to the legacy Maintenance route. */
export function maintenanceCompatHref(workId: string): string {
  return `/maintenance?id=${encodeURIComponent(workId)}`;
}
