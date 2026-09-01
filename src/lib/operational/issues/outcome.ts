import type { Issue, IssueOutcome } from "./types";

/**
 * Derive Issue outcome from the composed Issue lens.
 * No second resolution engine. Mirrors Issue.status, which is itself derived
 * from the authoritative root (Request / Maintenance / Incident).
 */
export function deriveIssueOutcome(issue: Issue): IssueOutcome {
  if (issue.status === "cancelled") {
    return {
      kind: "cancelled",
      summary: "Issue cancelled — pursuit stopped.",
      contributingTreatmentIds: issue.treatments
        .filter((t) => t.isCancelled)
        .map((t) => t.id),
    };
  }

  if (issue.status === "resolved") {
    return {
      kind: "resolved",
      summary:
        issue.resolutionSummary ||
        "Issue resolved — treatment reached successful terminal condition.",
      resolvedAt: issue.resolvedAt,
      contributingTreatmentIds: issue.treatments
        .filter((t) => t.isSuccessfullyTerminal)
        .map((t) => t.id),
    };
  }

  if (
    issue.status === "being_treated" ||
    issue.treatmentState.hasActiveTreatment
  ) {
    return {
      kind: "in_progress",
      summary: issue.treatmentState.hasActiveTreatment
        ? "Treatment in progress."
        : "Issue is being treated.",
      contributingTreatmentIds: [],
    };
  }

  return {
    kind: "open",
    summary: "Issue reported — no successful treatment yet.",
    contributingTreatmentIds: [],
  };
}
