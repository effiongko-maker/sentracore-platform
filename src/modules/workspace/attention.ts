import type { Incident } from "@/modules/incidents/types";
import { labelize } from "@/modules/workspace/utils";
import type { AttentionMatter, AttentionModel } from "@/modules/workspace/types";

/** Same rule as organisational pulse criticalIncidents. */
export const ATTENTION_OPEN_INCIDENT = new Set([
  "reported",
  "triaged",
  "investigating",
  "contained",
]);

export const ATTENTION_CRITICAL_SEVERITY = new Set(["critical", "high"]);

const ATTENTION_VISIBLE_LIMIT = 3;

function severityRank(severity: string): number {
  if (severity === "critical") return 0;
  if (severity === "high") return 1;
  return 2;
}

function buildReason(incident: Incident): string {
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

  // high
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

function buildAction(incident: Incident): Pick<AttentionMatter, "actionLabel" | "href"> {
  if (incident.requiresWorkOrder && !incident.workOrderId) {
    return {
      actionLabel: "Assign work →",
      href: "/work-orders",
    };
  }
  if (incident.workOrderId) {
    return {
      actionLabel: "Open work order →",
      href: "/work-orders",
    };
  }
  return {
    actionLabel: "Review incident →",
    href: "/incidents",
  };
}

/**
 * Shared attention model: headline count and list must use this builder.
 */
export function buildAttentionModel(
  incidents: Incident[],
  facilityNameById: Map<string, string>
): AttentionModel {
  const matters = incidents
    .filter(
      (row) =>
        ATTENTION_OPEN_INCIDENT.has(row.status) &&
        ATTENTION_CRITICAL_SEVERITY.has(row.severity)
    )
    .sort((a, b) => {
      const bySeverity = severityRank(a.severity) - severityRank(b.severity);
      if (bySeverity !== 0) return bySeverity;
      const left = a.reportedAt || a.createdAt || "";
      const right = b.reportedAt || b.createdAt || "";
      return right.localeCompare(left);
    })
    .map((incident): AttentionMatter => {
      const location =
        facilityNameById.get(incident.facilityId) ||
        incident.locationDetail ||
        incident.facilityId ||
        "Unknown location";
      const action = buildAction(incident);
      return {
        id: incident.id,
        severity: incident.severity === "critical" ? "critical" : "high",
        title: incident.title?.trim() || incident.id,
        location,
        entityLabel: "Incident",
        reason: buildReason(incident),
        actionLabel: action.actionLabel,
        href: action.href,
        entityId: incident.id,
      };
    });

  const total = matters.length;
  const visible = matters.slice(0, ATTENTION_VISIBLE_LIMIT);

  return {
    total,
    visible,
    viewAllHref:
      total > ATTENTION_VISIBLE_LIMIT ? "/incidents" : undefined,
    viewAllLabel:
      total > ATTENTION_VISIBLE_LIMIT
        ? "View all attention items →"
        : undefined,
  };
}

/** Keep pulse critical count aligned with attention model. */
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
