import { deriveIssueActions } from "./actions";
import { deriveIssueExecutions } from "./execution";
import { deriveIssueOutcome } from "./outcome";
import type { Issue, IssueOperationalView } from "./types";

/**
 * Build the thin operational Issue view (lens + actions + outcome).
 * Pure composition — no I/O, no writes.
 */
export function buildIssueOperationalView(
  issue: Issue
): IssueOperationalView {
  const limitations: string[] = [];

  if (issue.source === "facility_manager") {
    limitations.push(
      "FM Log Issue UI not built yet — this lens is composed from Maintenance or Incident root (no fake Request)."
    );
  }

  if (!issue.workOrders.length) {
    limitations.push(
      "No Work Order — Maintenance alone may resolve simple Issues. Job Orders are a future EVC/HQ + Procurement path."
    );
  }

  return {
    issue,
    outcome: deriveIssueOutcome(issue),
    executions: deriveIssueExecutions(issue),
    actions: deriveIssueActions(issue),
    limitations,
  };
}
