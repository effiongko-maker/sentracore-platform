import { INCIDENT_POLICY } from "./incidentPolicy";
import type { Issue, IssueAction, IssueActionId } from "./types";

function treatmentHref(
  kind: string,
  id: string
): string | undefined {
  if (kind === "maintenance") return `/maintenance?id=${encodeURIComponent(id)}`;
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

/**
 * Prefer Maintenance treatment for Treat when both kinds are active
 * (ordinary default). Incident-only roots use Incident.
 */
function pickTreatTarget(issue: Issue) {
  const active = issue.treatments.filter(
    (t) => !t.isSuccessfullyTerminal && !t.isCancelled
  );
  const activeMnt = active.find((t) => t.kind === "maintenance");
  if (activeMnt) return activeMnt;
  const activeInc = active.find((t) => t.kind === "incident_handling");
  if (activeInc) return activeInc;
  return issue.treatments.find((t) => t.kind === "maintenance")
    ?? issue.treatments[0];
}

/**
 * Derive available Issue actions from what the application can actually do.
 * Treat → Maintenance / Incident. Create work → WO only when formal execution needed.
 * Job Order action is not offered (future).
 */
export function deriveIssueActions(issue: Issue): IssueAction[] {
  const actions: IssueAction[] = [];
  const terminal =
    issue.status === "resolved" || issue.status === "cancelled";

  const treatTarget = pickTreatTarget(issue);
  const anyTreatment = issue.treatments[0];
  const anyWorkOrder = issue.workOrders[0];
  const incident = issue.treatments.find((t) => t.kind === "incident_handling");
  const maintenance = issue.treatments.find((t) => t.kind === "maintenance");

  actions.push({
    id: "view",
    label: "View",
    available: true,
    description: "Inspect this Issue lens.",
  });

  // TREAT → Maintenance / Incident (not Work Order)
  if (terminal) {
    actions.push({
      id: "treat",
      label: "Treat",
      available: false,
      reasonUnavailable: "Issue is already terminal.",
      description: "Continue or start treatment (Maintenance or Incident handling).",
    });
  } else if (treatTarget) {
    const href = treatmentHref(treatTarget.kind, treatTarget.id);
    actions.push({
      id: "treat",
      label: "Treat",
      available: Boolean(href),
      href,
      description:
        treatTarget.kind === "maintenance"
          ? "Continue Maintenance treatment/work."
          : "Continue Incident investigation/handling (significant events).",
      reasonUnavailable: href ? undefined : "No route for treatment kind.",
    });
  } else if (issue.relatedRequestId) {
    actions.push({
      id: "treat",
      label: "Treat",
      available: true,
      href: requestHref(issue.relatedRequestId),
      description: INCIDENT_POLICY.treatGuidance,
    });
  } else if (issue.rootMaintenanceId) {
    actions.push({
      id: "treat",
      label: "Treat",
      available: true,
      href: treatmentHref("maintenance", issue.rootMaintenanceId),
      description: "Continue Maintenance treatment for this FM-logged Issue.",
    });
  } else if (issue.rootIncidentId) {
    actions.push({
      id: "treat",
      label: "Treat",
      available: true,
      href: treatmentHref("incident_handling", issue.rootIncidentId),
      description: "Continue Incident handling for this significant-event Issue.",
    });
  } else {
    actions.push({
      id: "treat",
      label: "Treat",
      available: false,
      future: true,
      reasonUnavailable:
        "Log Issue UI not built yet — compose adapters exist for Maintenance/Incident roots.",
      description: "Start treatment for an FM-logged Issue.",
    });
  }

  // RESOLVE
  if (issue.relatedRequestId && !terminal) {
    actions.push({
      id: "resolve",
      label: "Resolve",
      available: true,
      href: requestHref(issue.relatedRequestId),
      description:
        "Declare resolved via Request (manual) or complete all treatments for auto-resolve.",
    });
  } else if (issue.rootMaintenanceId && !terminal) {
    actions.push({
      id: "resolve",
      label: "Resolve",
      available: true,
      href: treatmentHref("maintenance", issue.rootMaintenanceId),
      description:
        "Complete Maintenance treatment (root SoT). Work Order not required unless formal execution was created.",
    });
  } else if (issue.rootIncidentId && !terminal) {
    actions.push({
      id: "resolve",
      label: "Resolve",
      available: true,
      href: treatmentHref("incident_handling", issue.rootIncidentId),
      description: "Resolve Incident handling (root SoT for significant-event Issues).",
    });
  } else {
    actions.push({
      id: "resolve",
      label: "Resolve",
      available: false,
      reasonUnavailable: terminal
        ? "Issue already terminal."
        : "No authoritative root to resolve.",
      future: !terminal,
    });
  }

  // CANCEL
  if (issue.relatedRequestId && !terminal) {
    actions.push({
      id: "cancel",
      label: "Cancel",
      available: true,
      href: requestHref(issue.relatedRequestId),
      description: "Stop pursuing via Request Queue cancel.",
    });
  } else if (issue.rootMaintenanceId && !terminal) {
    actions.push({
      id: "cancel",
      label: "Cancel",
      available: true,
      href: treatmentHref("maintenance", issue.rootMaintenanceId),
      description: "Cancel via Maintenance deactivate/cancel.",
    });
  } else if (issue.rootIncidentId && !terminal) {
    actions.push({
      id: "cancel",
      label: "Cancel",
      available: true,
      href: treatmentHref("incident_handling", issue.rootIncidentId),
      description: "Cancel via Incident deactivate/cancel.",
    });
  } else {
    actions.push({
      id: "cancel",
      label: "Cancel",
      available: false,
      reasonUnavailable: terminal
        ? "Issue already terminal."
        : "No authoritative root to cancel.",
      future: !terminal,
    });
  }

  // INVESTIGATE — significant events only (guidance); capability preserved
  if (incident) {
    actions.push({
      id: "investigate",
      label: "Investigate",
      available: true,
      href: treatmentHref("incident_handling", incident.id),
      description: INCIDENT_POLICY.investigateGuidance,
    });
  } else if (issue.relatedRequestId && !terminal) {
    actions.push({
      id: "investigate",
      label: "Investigate",
      available: true,
      href: requestHref(issue.relatedRequestId),
      description: INCIDENT_POLICY.investigateGuidance,
    });
  } else {
    actions.push({
      id: "investigate",
      label: "Investigate",
      available: false,
      reasonUnavailable:
        "No Incident linked. Ordinary problems should use Maintenance Treat — not Incident.",
    });
  }

  // CREATE WORK — optional WO; not every treatment needs one; no Job Order
  if (anyWorkOrder) {
    actions.push({
      id: "create_work",
      label: "View work",
      available: true,
      href: workOrderHref(anyWorkOrder.id),
      description:
        "Open related Work Order (formal execution). Job Orders are a future path.",
    });
  } else if (maintenance && !terminal) {
    actions.push({
      id: "create_work",
      label: "Create work",
      available: true,
      href: treatmentHref("maintenance", maintenance.id),
      description: INCIDENT_POLICY.createWorkGuidance,
    });
  } else if (incident && !terminal) {
    actions.push({
      id: "create_work",
      label: "Create work",
      available: true,
      href: treatmentHref("incident_handling", incident.id),
      description: INCIDENT_POLICY.createWorkGuidance,
    });
  } else {
    actions.push({
      id: "create_work",
      label: "Create work",
      available: false,
      reasonUnavailable:
        "Optional: add Maintenance treatment first if formal Work Order execution is needed. Not required for every Issue.",
    });
  }

  // VIEW TREATMENT
  if (anyTreatment) {
    const href = treatmentHref(anyTreatment.kind, anyTreatment.id);
    actions.push({
      id: "view_treatment",
      label: "View treatment",
      available: Boolean(href),
      href,
      description: "Open the linked Maintenance or Incident treatment record.",
    });
  } else {
    actions.push({
      id: "view_treatment",
      label: "View treatment",
      available: false,
      reasonUnavailable: "No treatments linked yet.",
    });
  }

  // VIEW RELATED WORK
  if (anyWorkOrder) {
    actions.push({
      id: "view_related_work",
      label: "View related work",
      available: true,
      href: workOrderHref(anyWorkOrder.id),
      description: "Open formal Work Order execution.",
    });
  } else {
    actions.push({
      id: "view_related_work",
      label: "View related work",
      available: false,
      reasonUnavailable:
        "No Work Orders linked. Simple Issues may resolve on Maintenance alone.",
    });
  }

  // LOG ISSUE — UI future; composition adapters exist
  actions.push({
    id: "log_issue",
    label: "Log Issue",
    available: false,
    future: true,
    reasonUnavailable:
      "Log Issue UI not built. Composition ready: ordinary → Maintenance root; significant → Incident root (no fake Request).",
    description:
      "Facility Manager reports an Issue directly (compose via Maintenance or Incident root).",
  });

  return actions;
}

export function getIssueAction(
  actions: IssueAction[],
  id: IssueActionId
): IssueAction | undefined {
  return actions.find((a) => a.id === id);
}
