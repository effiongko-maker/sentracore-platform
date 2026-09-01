import { INCIDENT_POLICY } from "./incidentPolicy";
import { workHref } from "@/lib/operational/work";
import type { Issue, IssueAction, IssueActionId } from "./types";

function treatmentHref(
  kind: string,
  id: string
): string | undefined {
  if (kind === "work" || kind === "maintenance") return workHref(id);
  if (kind === "incident_handling")
    return `/incidents?id=${encodeURIComponent(id)}`;
  return undefined;
}

function workOrderHref(id: string): string {
  return `/work-orders?id=${encodeURIComponent(id)}`;
}

function requestHref(requestId: string): string {
  return `/requests?id=${encodeURIComponent(requestId)}`;
}

function isWorkTreatmentKind(kind: string): boolean {
  return kind === "work" || kind === "maintenance";
}

/**
 * @deprecated Phase 15 — not an operator taxonomy. Prefer Work when present;
 * Incident-only Issues remain reachable for legacy records.
 */
export function isSignificantIssue(issue: Issue): boolean {
  if (issue.rootIncidentId && !issue.rootMaintenanceId) return true;
  if (issue.rootMaintenanceId && !issue.rootIncidentId) return false;

  const hasInc = issue.treatments.some((t) => t.kind === "incident_handling");
  const hasWork = issue.treatments.some((t) => isWorkTreatmentKind(t.kind));
  if (hasInc && !hasWork) return true;
  if (hasWork && !hasInc) return false;

  return false;
}

function pickActiveTreatment(issue: Issue) {
  const active = issue.treatments.filter(
    (t) => !t.isSuccessfullyTerminal && !t.isCancelled
  );
  const preferWork = active.find((t) => isWorkTreatmentKind(t.kind));
  if (preferWork) return preferWork;
  const anyWork = issue.treatments.find((t) => isWorkTreatmentKind(t.kind));
  if (anyWork) return anyWork;
  return active[0] ?? issue.treatments[0];
}

/**
 * Treat → Work (Maintenance route as temporary Work UI).
 * Legacy Incident-only Issues still deep-link to /incidents for compatibility.
 */
function resolveTreatHref(issue: Issue): string | undefined {
  const target = pickActiveTreatment(issue);

  if (target && isWorkTreatmentKind(target.kind)) {
    return treatmentHref("work", target.id);
  }
  if (target?.kind === "incident_handling") {
    return treatmentHref("incident_handling", target.id);
  }
  if (issue.rootMaintenanceId) {
    return workHref(issue.rootMaintenanceId);
  }
  if (issue.rootIncidentId) {
    return treatmentHref("incident_handling", issue.rootIncidentId);
  }
  if (issue.relatedRequestId) {
    return requestHref(issue.relatedRequestId);
  }
  return undefined;
}

/**
 * Operator-facing Issue actions — Treat starts/continues Work.
 * Resolve is not offered. No Maintenance-vs-Incident classification.
 */
export function deriveIssueActions(issue: Issue): IssueAction[] {
  const actions: IssueAction[] = [];
  const terminal =
    issue.status === "resolved" || issue.status === "cancelled";

  const anyTreatment = issue.treatments[0];
  const anyWorkOrder = issue.workOrders[0];
  const work = issue.treatments.find((t) => isWorkTreatmentKind(t.kind));
  const incident = issue.treatments.find((t) => t.kind === "incident_handling");

  actions.push({
    id: "view",
    label: "View",
    available: true,
    description: "Review this Issue.",
  });

  if (terminal) {
    if (anyTreatment) {
      const href = treatmentHref(anyTreatment.kind, anyTreatment.id);
      actions.push({
        id: "view_treatment",
        label: "View treatment",
        available: Boolean(href),
        href,
        description: "Open the work activity for this Issue.",
      });
    }
    return actions;
  }

  const treatHref = resolveTreatHref(issue);
  actions.push({
    id: "treat",
    label: "Treat",
    available: Boolean(treatHref),
    href: treatHref,
    description: INCIDENT_POLICY.treatGuidance,
    reasonUnavailable: treatHref
      ? undefined
      : "No work path available for this Issue.",
  });

  if (anyTreatment) {
    const href = treatmentHref(anyTreatment.kind, anyTreatment.id);
    actions.push({
      id: "view_treatment",
      label: "View treatment",
      available: Boolean(href),
      href,
      description: "Open the linked work activity.",
    });
  }

  if (anyWorkOrder) {
    actions.push({
      id: "create_work",
      label: "View work",
      available: true,
      href: workOrderHref(anyWorkOrder.id),
      description: "Open the related Work Order.",
    });
  } else if (work) {
    actions.push({
      id: "create_work",
      label: "Create work",
      available: true,
      href: treatmentHref("work", work.id),
      description: INCIDENT_POLICY.createWorkGuidance,
    });
  } else if (incident) {
    actions.push({
      id: "create_work",
      label: "Create work",
      available: true,
      href: treatmentHref("incident_handling", incident.id),
      description: INCIDENT_POLICY.createWorkGuidance,
    });
  }

  if (issue.relatedRequestId) {
    actions.push({
      id: "cancel",
      label: "Cancel",
      available: true,
      href: requestHref(issue.relatedRequestId),
      description: "Cancel this Issue via its staff request.",
    });
  } else if (issue.rootMaintenanceId) {
    actions.push({
      id: "cancel",
      label: "Cancel",
      available: true,
      href: workHref(issue.rootMaintenanceId),
      description: "Cancel this Issue.",
    });
  } else if (issue.rootIncidentId) {
    actions.push({
      id: "cancel",
      label: "Cancel",
      available: true,
      href: treatmentHref("incident_handling", issue.rootIncidentId),
      description: "Cancel this Issue.",
    });
  }

  actions.push({
    id: "log_issue",
    label: "Log Issue",
    available: true,
    href: "/issues",
    description: "Log something that needs attention.",
  });

  return actions;
}

export function getIssueAction(
  actions: IssueAction[],
  id: IssueActionId
): IssueAction | undefined {
  return actions.find((a) => a.id === id);
}
