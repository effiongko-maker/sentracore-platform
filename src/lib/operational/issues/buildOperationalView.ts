import { deriveIssueActions } from "./actions";
import { deriveIssueExecutions } from "./execution";
import { deriveIssueOutcome } from "./outcome";
import type { Issue, IssueOperationalView } from "./types";

/**
 * Build the thin operational Issue view (actions + outcome).
 * Pure composition — no I/O, no writes.
 */
export function buildIssueOperationalView(
  issue: Issue
): IssueOperationalView {
  return {
    issue,
    outcome: deriveIssueOutcome(issue),
    executions: deriveIssueExecutions(issue),
    actions: deriveIssueActions(issue),
    limitations: [],
  };
}
