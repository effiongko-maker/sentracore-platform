import type { Approval } from "@/modules/approvals/types";
import type { Incident } from "@/modules/incidents/types";
import type { Maintenance } from "@/modules/maintenance/types";
import type { WorkOrder } from "@/modules/work-orders/types";
import { labelize } from "@/modules/workspace/utils";
import type { AttentionMatter, AttentionModel } from "@/modules/workspace/types";
import {
  ACTIVE_INCIDENT_STATUSES,
  ACTIVE_MAINTENANCE_STATUSES,
  WORKSPACE_ASSIGNED_WORK_ORDER_STATUSES,
} from "@/lib/operational/workload";
import { toIsoUtc } from "@/services/reporting/normalize";

/** Same rule as organisational pulse criticalIncidents. */
export const ATTENTION_OPEN_INCIDENT = ACTIVE_INCIDENT_STATUSES;

export const ATTENTION_CRITICAL_SEVERITY = new Set(["critical", "high"]);

const OPEN_WO = WORKSPACE_ASSIGNED_WORK_ORDER_STATUSES;
const OPEN_MNT = ACTIVE_MAINTENANCE_STATUSES;

const ATTENTION_VISIBLE_LIMIT = 5;

const APPROVAL_ATTENTION_STATUSES = new Set([
  "draft",
  "awaiting_decision",
  "awaiting_submission",
  "generated",
  "submitted",
  "awaiting_response",
  "rejected",
  "returned",
]);

export type AttentionBuildInput = {
  asOf: string;
  currentUserId?: string;
  incidents: Incident[];
  workOrders: WorkOrder[];
  maintenance: Maintenance[];
  approvals: Approval[];
  facilityNameById: Map<string, string>;
};

function dayKey(iso: string): string {
  return toIsoUtc(iso).slice(0, 10);
}

function isBeforeDay(iso: string | undefined, asOf: string): boolean {
  if (!iso) return false;
  return dayKey(iso) < dayKey(asOf);
}

function workOrderDue(row: WorkOrder): string | undefined {
  return row.dueAt || row.slaDueAt;
}

function severityRank(severity: AttentionMatter["severity"]): number {
  return severity === "critical" ? 0 : 1;
}

function facilityLabel(
  facilityId: string | undefined,
  facilityNameById: Map<string, string>,
  fallback?: string
): string {
  if (facilityId && facilityNameById.has(facilityId)) {
    return facilityNameById.get(facilityId)!;
  }
  return fallback?.trim() || facilityId || "Unknown location";
}

function buildIncidentReason(incident: Incident): string {
  if (incident.isEmergency) {
    return "Flagged as an emergency — intervene without delay.";
  }

  if (incident.severity === "critical") {
    if (incident.type === "safety" || incident.type === "security") {
      return "Potential safety risk requires immediate assessment.";
    }
    if (incident.status === "reported" || incident.status === "triaged") {
      return "Critical severity with no containment recorded. Immediate action required.";
    }
    if (incident.status === "investigating") {
      return "Critical investigation in progress — maintain close oversight.";
    }
    return "Critical severity requires immediate intervention.";
  }

  if (incident.type === "safety" || incident.type === "security") {
    return "Elevated safety concern requires prompt review.";
  }
  if (incident.requiresWorkOrder && !incident.workOrderId) {
    return "Work order still required — assign and route follow-up.";
  }
  if (incident.status === "reported") {
    return "Newly reported at high severity — triage and assign ownership.";
  }
  if (incident.description?.trim()) {
    const clipped = incident.description.trim().replace(/\s+/g, " ");
    if (clipped.length > 110) {
      return `${clipped.slice(0, 107)}…`;
    }
    return clipped;
  }
  return "Elevated severity requires prompt operational review.";
}

function buildIncidentAction(
  incident: Incident
): Pick<AttentionMatter, "actionLabel" | "href"> {
  if (incident.requiresWorkOrder && !incident.workOrderId) {
    return { actionLabel: "Assign work →", href: "/work-orders" };
  }
  if (incident.workOrderId) {
    return { actionLabel: "Open work order →", href: "/work-orders" };
  }
  return { actionLabel: "Review incident →", href: "/incidents" };
}

function fromIncidents(
  incidents: Incident[],
  facilityNameById: Map<string, string>
): AttentionMatter[] {
  return incidents
    .filter(
      (row) =>
        ATTENTION_OPEN_INCIDENT.has(row.status) &&
        ATTENTION_CRITICAL_SEVERITY.has(row.severity)
    )
    .map((incident): AttentionMatter => {
      const action = buildIncidentAction(incident);
      return {
        id: `inc-${incident.id}`,
        severity: incident.severity === "critical" ? "critical" : "high",
        title: incident.title?.trim() || incident.id,
        location: facilityLabel(
          incident.facilityId,
          facilityNameById,
          incident.locationDetail
        ),
        entityLabel: "Incident",
        reason: buildIncidentReason(incident),
        actionLabel: action.actionLabel,
        href: action.href,
        entityId: incident.id,
      };
    });
}

function fromOverdueWorkOrders(
  workOrders: WorkOrder[],
  asOf: string,
  facilityNameById: Map<string, string>,
  seenWoIds: Set<string>
): AttentionMatter[] {
  const matters: AttentionMatter[] = [];
  for (const row of workOrders) {
    if (!OPEN_WO.has(row.status)) continue;
    const due = workOrderDue(row);
    if (!isBeforeDay(due, asOf)) continue;
    seenWoIds.add(row.id);
    matters.push({
      id: `wo-overdue-${row.id}`,
      severity: row.priority === "critical" ? "critical" : "high",
      title: row.title?.trim() || row.id,
      location: facilityLabel(row.facilityId, facilityNameById),
      entityLabel: "Work Order",
      reason: `Overdue${due ? ` since ${dayKey(due)}` : ""} — clear or renegotiate the due date.`,
      actionLabel: "Open work order →",
      href: "/work-orders",
      entityId: row.id,
    });
  }
  return matters;
}

function fromOverdueMaintenance(
  maintenance: Maintenance[],
  asOf: string,
  facilityNameById: Map<string, string>,
  seenMntIds: Set<string>
): AttentionMatter[] {
  const matters: AttentionMatter[] = [];
  for (const row of maintenance) {
    if (!OPEN_MNT.has(row.status)) continue;
    if (!isBeforeDay(row.dueAt, asOf)) continue;
    seenMntIds.add(row.id);
    matters.push({
      id: `mnt-overdue-${row.id}`,
      severity: row.priority === "critical" ? "critical" : "high",
      title: row.title?.trim() || row.id,
      location: facilityLabel(row.facilityId, facilityNameById),
      entityLabel: "Maintenance",
      reason: `Overdue maintenance${row.dueAt ? ` (due ${dayKey(row.dueAt)})` : ""} — schedule or complete follow-up.`,
      actionLabel: "Review maintenance →",
      href: "/maintenance",
      entityId: row.id,
    });
  }
  return matters;
}

function fromPriorityMaintenance(
  maintenance: Maintenance[],
  facilityNameById: Map<string, string>,
  seenMntIds: Set<string>
): AttentionMatter[] {
  const matters: AttentionMatter[] = [];
  for (const row of maintenance) {
    if (seenMntIds.has(row.id)) continue;
    if (!OPEN_MNT.has(row.status)) continue;
    const priorityHit = row.priority === "critical" || row.priority === "high";
    const holdHit = row.status === "on_hold";
    const needsWo =
      Boolean(row.requiresWorkOrder) &&
      !row.workOrderId &&
      !(row.workOrderIds && row.workOrderIds.length > 0);
    if (!priorityHit && !holdHit && !needsWo) continue;

    seenMntIds.add(row.id);
    let reason = "Elevated maintenance requires prompt operational review.";
    if (holdHit) {
      reason = row.holdReason?.trim()
        ? `On hold — ${row.holdReason.trim()}`
        : "Maintenance is on hold — unblock or reschedule.";
    } else if (needsWo) {
      reason = "Work order still required — create or link follow-up work.";
    } else if (row.priority === "critical") {
      reason = "Critical priority maintenance in active flow.";
    } else {
      reason = "High priority maintenance awaiting progress.";
    }

    matters.push({
      id: `mnt-priority-${row.id}`,
      severity: row.priority === "critical" || holdHit ? "critical" : "high",
      title: row.title?.trim() || row.id,
      location: facilityLabel(row.facilityId, facilityNameById),
      entityLabel: "Maintenance",
      reason,
      actionLabel: needsWo ? "Create work order →" : "Review maintenance →",
      href: needsWo ? "/work-orders" : "/maintenance",
      entityId: row.id,
    });
  }
  return matters;
}

function fromApprovals(
  approvals: Approval[],
  facilityNameById: Map<string, string>
): AttentionMatter[] {
  return approvals
    .filter((row) => APPROVAL_ATTENTION_STATUSES.has(row.status))
    .map((row): AttentionMatter => {
      const rejected = row.status === "rejected" || row.status === "returned";
      let reason = "Client approval requires action.";
      let actionLabel = "Open approval →";
      if (row.status === "draft" || row.status === "generated" || row.status === "awaiting_submission") {
        reason = "Approval package generated — submit to the client.";
        actionLabel = "Submit approval →";
      } else if (
        row.status === "awaiting_decision" ||
        row.status === "submitted" ||
        row.status === "awaiting_response"
      ) {
        reason = "Awaiting client decision — track and follow up.";
        actionLabel = "Track approval →";
      } else if (row.status === "rejected") {
        reason = "Approval rejected — revise scope or re-submit.";
        actionLabel = "Resolve rejection →";
      } else if (row.status === "returned") {
        reason = "Returned for clarification — respond and resubmit.";
        actionLabel = "Clarify approval →";
      }

      return {
        id: `apr-${row.id}`,
        severity: rejected ? "critical" : "high",
        title: row.title?.trim() || row.id,
        location: facilityLabel(row.facilityId, facilityNameById),
        entityLabel: "Approval",
        reason,
        actionLabel,
        href: "/approvals",
        entityId: row.id,
      };
    });
}

function fromAssignedToMe(
  input: AttentionBuildInput,
  seenWoIds: Set<string>,
  seenIncIds: Set<string>,
  seenMntIds: Set<string>
): AttentionMatter[] {
  const userId = input.currentUserId?.trim();
  if (!userId) return [];

  const matters: AttentionMatter[] = [];
  const { asOf, facilityNameById } = input;

  for (const row of input.workOrders) {
    if (seenWoIds.has(row.id)) continue;
    if (row.assignedToUserId !== userId) continue;
    if (!OPEN_WO.has(row.status)) continue;

    const priorityHit = row.priority === "critical" || row.priority === "high";
    const holdHit = row.status === "on_hold";
    const dueSoon =
      Boolean(workOrderDue(row)) &&
      dayKey(workOrderDue(row)!) === dayKey(asOf);

    if (!priorityHit && !holdHit && !dueSoon) continue;

    seenWoIds.add(row.id);
    let reason = "Assigned to you — progress or reassign.";
    if (holdHit) {
      reason = row.holdReason?.trim()
        ? `On hold (assigned to you) — ${row.holdReason.trim()}`
        : "Assigned work order is on hold — unblock it.";
    } else if (dueSoon) {
      reason = "Assigned to you and due today.";
    } else if (row.priority === "critical") {
      reason = "Critical work order assigned to you.";
    } else {
      reason = "High priority work order assigned to you.";
    }

    matters.push({
      id: `wo-mine-${row.id}`,
      severity: row.priority === "critical" || holdHit ? "critical" : "high",
      title: row.title?.trim() || row.id,
      location: facilityLabel(row.facilityId, facilityNameById),
      entityLabel: "Work Order",
      reason,
      actionLabel: "Open work order →",
      href: "/work-orders",
      entityId: row.id,
    });
  }

  for (const row of input.incidents) {
    if (seenIncIds.has(row.id)) continue;
    if (row.assignedToUserId !== userId) continue;
    if (!ATTENTION_OPEN_INCIDENT.has(row.status)) continue;
    // Critical/high already covered by fromIncidents.
    if (ATTENTION_CRITICAL_SEVERITY.has(row.severity)) continue;
    // Personal queue: only early-lifecycle items still needing action.
    if (row.status !== "reported" && row.status !== "triaged") continue;

    seenIncIds.add(row.id);
    matters.push({
      id: `inc-mine-${row.id}`,
      severity: "high",
      title: row.title?.trim() || row.id,
      location: facilityLabel(
        row.facilityId,
        facilityNameById,
        row.locationDetail
      ),
      entityLabel: "Incident",
      reason: "Assigned to you — triage or update status.",
      actionLabel: "Review incident →",
      href: "/incidents",
      entityId: row.id,
    });
  }

  for (const row of input.maintenance) {
    if (seenMntIds.has(row.id)) continue;
    if (row.assignedToUserId !== userId) continue;
    if (!OPEN_MNT.has(row.status)) continue;
    if (row.priority === "critical" || row.priority === "high") continue;

    const dueToday =
      Boolean(row.dueAt) && dayKey(row.dueAt!) === dayKey(asOf);
    const actionable =
      row.status === "requested" ||
      row.status === "triaged" ||
      row.status === "on_hold" ||
      dueToday;
    if (!actionable) continue;

    seenMntIds.add(row.id);
    matters.push({
      id: `mnt-mine-${row.id}`,
      severity: row.status === "on_hold" ? "critical" : "high",
      title: row.title?.trim() || row.id,
      location: facilityLabel(row.facilityId, facilityNameById),
      entityLabel: "Maintenance",
      reason: dueToday
        ? "Assigned to you and due today."
        : row.status === "on_hold"
          ? "Assigned maintenance is on hold — unblock it."
          : "Assigned to you — advance or schedule the work.",
      actionLabel: "Review maintenance →",
      href: "/maintenance",
      entityId: row.id,
    });
  }

  return matters;
}

function fromApprovalRequiredWorkOrders(
  workOrders: WorkOrder[],
  approvals: Approval[],
  facilityNameById: Map<string, string>,
  seenWoIds: Set<string>
): AttentionMatter[] {
  const approvalByWo = new Set(
    approvals
      .filter((row) => row.workOrderId)
      .map((row) => row.workOrderId)
  );
  const matters: AttentionMatter[] = [];

  for (const row of workOrders) {
    if (seenWoIds.has(row.id)) continue;
    if (!OPEN_WO.has(row.status)) continue;
    if (!row.requiresApproval) continue;
    if (row.approvalId || approvalByWo.has(row.id)) continue;

    seenWoIds.add(row.id);
    matters.push({
      id: `wo-approval-${row.id}`,
      severity: "high",
      title: row.title?.trim() || row.id,
      location: facilityLabel(row.facilityId, facilityNameById),
      entityLabel: "Work Order",
      reason: "Client approval required — generate an approval package.",
      actionLabel: "Create approval →",
      href: "/approvals",
      entityId: row.id,
    });
  }

  return matters;
}

function sortMatters(matters: AttentionMatter[]): AttentionMatter[] {
  return [...matters].sort((a, b) => {
    const bySeverity = severityRank(a.severity) - severityRank(b.severity);
    if (bySeverity !== 0) return bySeverity;
    return a.title.localeCompare(b.title);
  });
}

function resolveViewAll(matters: AttentionMatter[]): {
  viewAllHref?: string;
  viewAllLabel?: string;
} {
  if (matters.length <= ATTENTION_VISIBLE_LIMIT) return {};

  const hrefCounts = new Map<string, number>();
  for (const matter of matters) {
    hrefCounts.set(matter.href, (hrefCounts.get(matter.href) ?? 0) + 1);
  }

  let bestHref = "/incidents";
  let bestCount = 0;
  for (const [href, count] of hrefCounts) {
    if (count > bestCount) {
      bestHref = href;
      bestCount = count;
    }
  }

  return {
    viewAllHref: bestHref,
    viewAllLabel: "View all attention items →",
  };
}

/**
 * Home attention model from the ripple matrix:
 * critical/high incidents, overdue WO/MNT, priority/hold maintenance,
 * approval queues, assigned-to-me pressure, WO awaiting approval package.
 *
 * Not a chronological activity feed — current-state actionable matters only.
 */
export function buildAttentionModel(
  input: AttentionBuildInput | Incident[],
  facilityNameByIdArg?: Map<string, string>
): AttentionModel {
  // Back-compat: previous signature (incidents, facilityNameById)
  const inputNormalized: AttentionBuildInput = Array.isArray(input)
    ? {
        asOf: new Date().toISOString(),
        incidents: input,
        workOrders: [],
        maintenance: [],
        approvals: [],
        facilityNameById: facilityNameByIdArg ?? new Map(),
      }
    : input;

  const seenWoIds = new Set<string>();
  const seenMntIds = new Set<string>();
  const incidentMatters = fromIncidents(
    inputNormalized.incidents,
    inputNormalized.facilityNameById
  );
  const seenIncIds = new Set(incidentMatters.map((m) => m.entityId));

  const matters = sortMatters([
    ...incidentMatters,
    ...fromOverdueWorkOrders(
      inputNormalized.workOrders,
      inputNormalized.asOf,
      inputNormalized.facilityNameById,
      seenWoIds
    ),
    ...fromOverdueMaintenance(
      inputNormalized.maintenance,
      inputNormalized.asOf,
      inputNormalized.facilityNameById,
      seenMntIds
    ),
    ...fromPriorityMaintenance(
      inputNormalized.maintenance,
      inputNormalized.facilityNameById,
      seenMntIds
    ),
    ...fromApprovals(
      inputNormalized.approvals,
      inputNormalized.facilityNameById
    ),
    ...fromApprovalRequiredWorkOrders(
      inputNormalized.workOrders,
      inputNormalized.approvals,
      inputNormalized.facilityNameById,
      seenWoIds
    ),
    ...fromAssignedToMe(
      inputNormalized,
      seenWoIds,
      seenIncIds,
      seenMntIds
    ),
  ]);

  const total = matters.length;
  const visible = matters.slice(0, ATTENTION_VISIBLE_LIMIT);
  const criticalCount = matters.filter((m) => m.severity === "critical").length;
  const viewAll = resolveViewAll(matters);

  return {
    total,
    criticalCount,
    visible,
    ...viewAll,
  };
}

/** Keep pulse critical count aligned with critical/high open incidents only. */
export function countCriticalMatters(incidents: Incident[]): number {
  return incidents.filter(
    (row) =>
      ATTENTION_OPEN_INCIDENT.has(row.status) &&
      ATTENTION_CRITICAL_SEVERITY.has(row.severity)
  ).length;
}

export function severityLabel(severity: AttentionMatter["severity"]): string {
  return labelize(severity);
}
