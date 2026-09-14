import {
  ECC_CENTRE_OVERALL_STATUS_LABELS,
  ECC_DAILY_OPS_SECTION_LABELS,
} from "@/modules/ecc-operations/constants";
import type {
  EccCentre,
  EccDailyOpsRecord,
  EccDailyOpsSectionKey,
  EccIssue,
  EccRequest,
  EccSectionCondition,
} from "@/modules/ecc-operations/types";
import type {
  EccIntelligenceComparison,
  EccIntelligenceInsight,
  EccIntelligenceSnapshot,
} from "./types";

const SECTION_KEYS: EccDailyOpsSectionKey[] = [
  "centre",
  "call",
  "facility",
  "technical",
];

function isoDay(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  try {
    return new Date(value).toISOString().slice(0, 10);
  } catch {
    return value.slice(0, 10);
  }
}

function inRange(day: string, from: string, to: string): boolean {
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

function formatRangeLabel(from: string, to: string): string {
  const fmt = (iso: string) => {
    try {
      return new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  };
  if (from === to) return fmt(from);
  return `${fmt(from)} – ${fmt(to)}`;
}

function previousWindow(
  from: string,
  to: string
): { from: string; to: string } {
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  const spanDays =
    Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000)) + 1;
  const prevTo = new Date(start);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - (spanDays - 1));
  return {
    from: prevFrom.toISOString().slice(0, 10),
    to: prevTo.toISOString().slice(0, 10),
  };
}

function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) {
    if (current === 0) return 0;
    return null;
  }
  return Math.round(((current - previous) / previous) * 100);
}

function isOpenIssue(issue: EccIssue): boolean {
  return issue.status !== "resolved" && issue.status !== "closed";
}

function isOpenRequest(request: EccRequest): boolean {
  return (
    request.status !== "resolved" &&
    request.status !== "closed" &&
    request.status !== "cancelled"
  );
}

function sectionStatus(
  row: EccDailyOpsRecord,
  key: EccDailyOpsSectionKey
): EccSectionCondition {
  switch (key) {
    case "centre":
      return row.centreOperations.status;
    case "call":
      return row.callOperations.status;
    case "facility":
      return row.facility.status;
    case "technical":
      return row.technical.status;
  }
}

function sectionNeedsAttention(status: EccSectionCondition): boolean {
  return status === "issue" || status === "disrupted";
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${isoDay(fromIso)}T12:00:00`).getTime();
  const b = new Date(`${isoDay(toIso)}T12:00:00`).getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

export type EccIntelligenceInput = {
  centre: EccCentre;
  dailyOps: EccDailyOpsRecord[];
  issues: EccIssue[];
  requests: EccRequest[];
  rangeFrom: string;
  rangeTo: string;
  asOf?: string;
};

/**
 * Derive operational intelligence from ECC registers only.
 * Does not invent KPIs, call-centre telemetry, or external datasets.
 */
export function deriveEccIntelligence(
  input: EccIntelligenceInput
): EccIntelligenceSnapshot {
  const asOf = input.asOf ?? new Date().toISOString();
  const prev = previousWindow(input.rangeFrom, input.rangeTo);

  const currentOps = input.dailyOps.filter((row) =>
    inRange(row.reportingDate, input.rangeFrom, input.rangeTo)
  );
  const previousOps = input.dailyOps.filter((row) =>
    inRange(row.reportingDate, prev.from, prev.to)
  );

  const issuesCreatedCurrent = input.issues.filter((issue) =>
    inRange(isoDay(issue.occurredAt || issue.createdAt), input.rangeFrom, input.rangeTo)
  );
  const issuesCreatedPrevious = input.issues.filter((issue) =>
    inRange(isoDay(issue.occurredAt || issue.createdAt), prev.from, prev.to)
  );
  const requestsCreatedCurrent = input.requests.filter((request) =>
    inRange(isoDay(request.createdAt), input.rangeFrom, input.rangeTo)
  );
  const requestsCreatedPrevious = input.requests.filter((request) =>
    inRange(isoDay(request.createdAt), prev.from, prev.to)
  );

  const openIssues = input.issues.filter(isOpenIssue);
  const openRequests = input.requests.filter(isOpenRequest);
  const escalatedOpen = openIssues.filter((i) => i.status === "escalated");
  const highCriticalOpen = openIssues.filter(
    (i) => i.severity === "high" || i.severity === "critical"
  );

  const disruptedCurrent = currentOps.filter(
    (row) =>
      row.overallStatus === "disrupted" || row.overallStatus === "down"
  ).length;
  const disruptedPrevious = previousOps.filter(
    (row) =>
      row.overallStatus === "disrupted" || row.overallStatus === "down"
  ).length;

  const withIssuesCurrent = currentOps.filter(
    (row) => row.overallStatus === "operational_with_issues"
  ).length;
  const withIssuesPrevious = previousOps.filter(
    (row) => row.overallStatus === "operational_with_issues"
  ).length;

  const recurringSections = SECTION_KEYS.map((key) => {
    const count = currentOps.filter((row) =>
      sectionNeedsAttention(sectionStatus(row, key))
    ).length;
    return { key, count };
  })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);

  const classificationCounts = new Map<string, number>();
  for (const issue of issuesCreatedCurrent) {
    classificationCounts.set(
      issue.classification,
      (classificationCounts.get(issue.classification) ?? 0) + 1
    );
  }
  const topClassification = [...classificationCounts.entries()].sort(
    (a, b) => b[1] - a[1]
  )[0];

  const nowDay = isoDay(asOf);
  const stalledIssues = openIssues.filter(
    (issue) => daysBetween(issue.updatedAt, nowDay) >= 7
  );
  const stalledRequests = openRequests.filter(
    (request) => daysBetween(request.updatedAt, nowDay) >= 7
  );

  const hasComparableOps =
    previousOps.length >= 2 && currentOps.length >= 1;
  const hasComparableIntake =
    previousOps.length +
      issuesCreatedPrevious.length +
      requestsCreatedPrevious.length >=
      2;

  const comparisons: EccIntelligenceComparison[] = [
    {
      id: "daily-ops-submissions",
      label: "Daily Ops submissions",
      current: currentOps.length,
      previous: previousOps.length,
      deltaPct: deltaPct(currentOps.length, previousOps.length),
      insufficientData: previousOps.length === 0,
      note:
        previousOps.length === 0
          ? "No Daily Ops submissions in the previous period for comparison."
          : undefined,
    },
    {
      id: "disrupted-submissions",
      label: "Disrupted / down submissions",
      current: disruptedCurrent,
      previous: disruptedPrevious,
      deltaPct: deltaPct(disruptedCurrent, disruptedPrevious),
      insufficientData: !hasComparableOps,
      note: !hasComparableOps
        ? "Insufficient historical Daily Ops data to establish a reliable disruption trend."
        : undefined,
    },
    {
      id: "issues-created",
      label: "Issues created in period",
      current: issuesCreatedCurrent.length,
      previous: issuesCreatedPrevious.length,
      deltaPct: deltaPct(
        issuesCreatedCurrent.length,
        issuesCreatedPrevious.length
      ),
      insufficientData: !hasComparableIntake && issuesCreatedPrevious.length === 0,
      note:
        issuesCreatedPrevious.length === 0 && issuesCreatedCurrent.length > 0
          ? "No issues were dated in the previous period; change rate is not comparable."
          : undefined,
    },
    {
      id: "requests-created",
      label: "Requests created in period",
      current: requestsCreatedCurrent.length,
      previous: requestsCreatedPrevious.length,
      deltaPct: deltaPct(
        requestsCreatedCurrent.length,
        requestsCreatedPrevious.length
      ),
      insufficientData:
        !hasComparableIntake && requestsCreatedPrevious.length === 0,
      note:
        requestsCreatedPrevious.length === 0 &&
        requestsCreatedCurrent.length > 0
          ? "No requests were created in the previous period; change rate is not comparable."
          : undefined,
    },
  ];

  const attention: EccIntelligenceInsight[] = [];
  const keyInsights: EccIntelligenceInsight[] = [];
  const trends: EccIntelligenceInsight[] = [];
  const managementInsights: EccIntelligenceInsight[] = [];
  const recommendations: EccIntelligenceInsight[] = [];

  if (currentOps.length === 0) {
    attention.push({
      id: "no-submissions",
      kind: "attention",
      title: "No Daily Ops submissions in period",
      observation: `No Daily Ops records fall within ${formatRangeLabel(input.rangeFrom, input.rangeTo)}.`,
      interpretation:
        "This may indicate a reporting coverage gap for the selected window.",
      severity: "attention",
      evidence: [`Range ${input.rangeFrom} → ${input.rangeTo}`],
      href: "/ecc-operations/daily-ops",
    });
  }

  if (escalatedOpen.length > 0) {
    attention.push({
      id: "escalated-open",
      kind: "attention",
      title: "Escalated issues remain open",
      observation: `${escalatedOpen.length} escalated issue${escalatedOpen.length === 1 ? "" : "s"} ${escalatedOpen.length === 1 ? "is" : "are"} still open on the Issues register.`,
      interpretation:
        "Escalated items typically require explicit ownership and follow-through.",
      severity: "attention",
      evidence: escalatedOpen.slice(0, 3).map((i) => `${i.id}: ${i.title}`),
      href: "/ecc-operations/issues",
    });
  }

  if (highCriticalOpen.length > 0) {
    attention.push({
      id: "high-critical-open",
      kind: "attention",
      title: "High / critical open issues",
      observation: `${highCriticalOpen.length} open issue${highCriticalOpen.length === 1 ? "" : "s"} ${highCriticalOpen.length === 1 ? "is" : "are"} marked high or critical severity.`,
      severity: "attention",
      evidence: highCriticalOpen
        .slice(0, 3)
        .map((i) => `${i.severity}: ${i.title}`),
      href: "/ecc-operations/issues",
    });
  }

  if (stalledIssues.length > 0) {
    attention.push({
      id: "stalled-issues",
      kind: "attention",
      title: "Open issues without recent updates",
      observation: `${stalledIssues.length} open issue${stalledIssues.length === 1 ? "" : "s"} ${stalledIssues.length === 1 ? "has" : "have"} not been updated for 7 or more days.`,
      interpretation:
        "Stale open items can indicate backlog formation; this is based on last update timestamps only (no SLA target is defined in ECC).",
      severity: "watch",
      evidence: stalledIssues
        .slice(0, 3)
        .map((i) => `${i.id} · last update ${isoDay(i.updatedAt)}`),
      href: "/ecc-operations/issues",
    });
  }

  if (stalledRequests.length > 0) {
    attention.push({
      id: "stalled-requests",
      kind: "attention",
      title: "Open requests without recent updates",
      observation: `${stalledRequests.length} open request${stalledRequests.length === 1 ? "" : "s"} ${stalledRequests.length === 1 ? "has" : "have"} not been updated for 7 or more days.`,
      interpretation:
        "This may warrant an operational review of ownership and progress.",
      severity: "watch",
      evidence: stalledRequests
        .slice(0, 3)
        .map((r) => `${r.id} · last update ${isoDay(r.updatedAt)}`),
      href: "/ecc-operations/requests",
    });
  }

  if (recurringSections[0] && recurringSections[0].count >= 2) {
    const top = recurringSections[0];
    keyInsights.push({
      id: `recurring-${top.key}`,
      kind: "pattern",
      title: "Recurring section stress in Daily Ops",
      observation: `${ECC_DAILY_OPS_SECTION_LABELS[top.key]} was recorded as issue or disrupted in ${top.count} of ${currentOps.length} Daily Ops submission${currentOps.length === 1 ? "" : "s"} in this period.`,
      severity: "watch",
      evidence: recurringSections.slice(0, 3).map(
        (row) =>
          `${ECC_DAILY_OPS_SECTION_LABELS[row.key]}: ${row.count} submission(s)`
      ),
      href: "/ecc-operations/daily-ops",
    });
  }

  if (topClassification && topClassification[1] >= 2) {
    keyInsights.push({
      id: "issue-classification",
      kind: "pattern",
      title: "Issue classification concentration",
      observation: `${topClassification[1]} of ${issuesCreatedCurrent.length} issues dated in this period are classified as ${topClassification[0]}.`,
      severity: "info",
      evidence: [...classificationCounts.entries()].map(
        ([label, count]) => `${label}: ${count}`
      ),
      href: "/ecc-operations/issues",
    });
  }

  const submissionsCmp = comparisons[0]!;
  if (
    !submissionsCmp.insufficientData &&
    submissionsCmp.previous != null &&
    submissionsCmp.deltaPct != null
  ) {
    const direction =
      submissionsCmp.deltaPct > 0
        ? "increased"
        : submissionsCmp.deltaPct < 0
          ? "decreased"
          : "was unchanged";
    trends.push({
      id: "submission-change",
      kind: "change",
      title: "Daily Ops submission volume",
      observation: `Daily Ops submissions ${direction} from ${submissionsCmp.previous} in the previous period to ${submissionsCmp.current} in the selected period (${submissionsCmp.deltaPct >= 0 ? "+" : ""}${submissionsCmp.deltaPct}%).`,
      severity:
        Math.abs(submissionsCmp.deltaPct) >= 25 ? "watch" : "info",
      evidence: [
        `Current: ${submissionsCmp.current}`,
        `Previous: ${submissionsCmp.previous}`,
      ],
    });
  } else if (submissionsCmp.insufficientData) {
    trends.push({
      id: "submission-trend-insufficient",
      kind: "insufficient_data",
      title: "Insufficient historical data",
      observation:
        "There is not yet enough historical Daily Ops data in the previous period to establish a reliable submission trend.",
      severity: "info",
      evidence: [
        `Current period submissions: ${currentOps.length}`,
        `Previous period submissions: ${previousOps.length}`,
      ],
    });
  }

  if (
    hasComparableOps &&
    disruptedCurrent !== disruptedPrevious
  ) {
    trends.push({
      id: "disruption-change",
      kind: "change",
      title: "Disruption posture in Daily Ops",
      observation: `Submissions marked disrupted or down moved from ${disruptedPrevious} previously to ${disruptedCurrent} in the selected period.`,
      severity: disruptedCurrent > disruptedPrevious ? "watch" : "info",
      evidence: [
        `With-issues submissions (current): ${withIssuesCurrent}`,
        `With-issues submissions (previous): ${withIssuesPrevious}`,
      ],
    });
  }

  const issuesIntakeCmp = comparisons[2]!;
  if (
    !issuesIntakeCmp.insufficientData &&
    issuesIntakeCmp.previous != null &&
    issuesIntakeCmp.deltaPct != null &&
    Math.abs(issuesIntakeCmp.deltaPct) >= 20
  ) {
    keyInsights.push({
      id: "issue-intake-change",
      kind: "change",
      title: "Issue intake changed materially",
      observation: `Issues dated in the selected period changed by ${issuesIntakeCmp.deltaPct >= 0 ? "+" : ""}${issuesIntakeCmp.deltaPct}% versus the previous period (${issuesIntakeCmp.previous} → ${issuesIntakeCmp.current}).`,
      severity: "watch",
      evidence: [
        `Current intake: ${issuesIntakeCmp.current}`,
        `Previous intake: ${issuesIntakeCmp.previous}`,
      ],
      href: "/ecc-operations/issues",
    });
  }

  const requestsIntakeCmp = comparisons[3]!;
  if (
    !requestsIntakeCmp.insufficientData &&
    requestsIntakeCmp.previous != null &&
    requestsIntakeCmp.deltaPct != null &&
    Math.abs(requestsIntakeCmp.deltaPct) >= 20
  ) {
    keyInsights.push({
      id: "request-intake-change",
      kind: "change",
      title: "Request intake changed materially",
      observation: `Requests created in the selected period changed by ${requestsIntakeCmp.deltaPct >= 0 ? "+" : ""}${requestsIntakeCmp.deltaPct}% versus the previous period (${requestsIntakeCmp.previous} → ${requestsIntakeCmp.current}).`,
      severity: "watch",
      evidence: [
        `Current intake: ${requestsIntakeCmp.current}`,
        `Previous intake: ${requestsIntakeCmp.previous}`,
      ],
      href: "/ecc-operations/requests",
    });
  }

  // Live register pressure (point-in-time — disclosed in data notes).
  managementInsights.push({
    id: "register-pressure",
    kind: "summary",
    title: "Current register pressure",
    observation: `As of the latest snapshot, the centre has ${openIssues.length} open issue${openIssues.length === 1 ? "" : "s"} and ${openRequests.length} open request${openRequests.length === 1 ? "" : "s"} on the live registers.`,
    severity:
      escalatedOpen.length > 0 || highCriticalOpen.length > 0
        ? "attention"
        : openIssues.length + openRequests.length > 0
          ? "watch"
          : "info",
    evidence: [
      `Escalated open: ${escalatedOpen.length}`,
      `High/critical open: ${highCriticalOpen.length}`,
      `Issues created in period: ${issuesCreatedCurrent.length}`,
      `Requests created in period: ${requestsCreatedCurrent.length}`,
    ],
  });

  if (currentOps[0]) {
    const latest = [...currentOps].sort((a, b) =>
      b.recordedAt.localeCompare(a.recordedAt)
    )[0]!;
    managementInsights.push({
      id: "latest-posture",
      kind: "summary",
      title: "Latest recorded centre posture",
      observation: `The most recent Daily Ops submission in this period records overall status as ${ECC_CENTRE_OVERALL_STATUS_LABELS[latest.overallStatus]} (${latest.reportingDate}, ${latest.period}).`,
      severity:
        latest.overallStatus === "disrupted" || latest.overallStatus === "down"
          ? "attention"
          : latest.overallStatus === "operational_with_issues"
            ? "watch"
            : "info",
      evidence: [
        `Facility: ${latest.facility.status}`,
        `Technical: ${latest.technical.status}`,
        `Staffing: ${latest.centreOperations.staffingStatus}`,
      ],
      href: "/ecc-operations/daily-ops",
    });
  }

  // Recommendations — clearly labeled as recommendations.
  if (escalatedOpen.length > 0) {
    recommendations.push({
      id: "rec-escalated",
      kind: "recommendation",
      title: "Recommendation",
      observation: `${escalatedOpen.length} escalated issue(s) remain open.`,
      interpretation:
        "Review ownership and next actions for escalated issues on the Issues register.",
      severity: "attention",
      evidence: escalatedOpen.slice(0, 2).map((i) => i.id),
      href: "/ecc-operations/issues",
    });
  }
  if (stalledRequests.length >= 2) {
    recommendations.push({
      id: "rec-stalled-requests",
      kind: "recommendation",
      title: "Recommendation",
      observation: `${stalledRequests.length} open requests have not been updated for 7+ days.`,
      interpretation:
        "Review whether additional operational intervention is required for stalled requests.",
      severity: "watch",
      evidence: stalledRequests.slice(0, 2).map((r) => r.id),
      href: "/ecc-operations/requests",
    });
  }
  if (recurringSections[0] && recurringSections[0].count >= 3) {
    const top = recurringSections[0];
    recommendations.push({
      id: "rec-recurring-section",
      kind: "recommendation",
      title: "Recommendation",
      observation: `${ECC_DAILY_OPS_SECTION_LABELS[top.key]} repeatedly recorded issue/disrupted status in this period (${top.count} submissions).`,
      interpretation:
        "Investigate whether a recurring operational condition needs sustained attention.",
      severity: "watch",
      evidence: [`Section: ${ECC_DAILY_OPS_SECTION_LABELS[top.key]}`],
      href: "/ecc-operations/daily-ops",
    });
  }
  if (currentOps.length === 0) {
    recommendations.push({
      id: "rec-coverage",
      kind: "recommendation",
      title: "Recommendation",
      observation: "No Daily Ops submissions were found for the selected period.",
      interpretation:
        "Confirm reporting coverage for the centre and ensure morning/evening updates are being submitted where expected.",
      severity: "attention",
      evidence: [`Range ${input.rangeFrom} → ${input.rangeTo}`],
      href: "/ecc-operations/daily-ops",
    });
  }
  if (recommendations.length === 0) {
    recommendations.push({
      id: "rec-none",
      kind: "recommendation",
      title: "Recommendation",
      observation:
        "No elevated follow-up signals were derived from the selected period and current registers.",
      interpretation:
        "Continue routine monitoring of Daily Ops, Issues, and Requests.",
      severity: "info",
      evidence: [
        `Submissions in period: ${currentOps.length}`,
        `Open issues: ${openIssues.length}`,
        `Open requests: ${openRequests.length}`,
      ],
    });
  }

  // Deduplicate key insights that already appear in attention for the same id family.
  const summaryParts: string[] = [];
  summaryParts.push(
    `For ${formatRangeLabel(input.rangeFrom, input.rangeTo)}, ECC recorded ${currentOps.length} Daily Ops submission${currentOps.length === 1 ? "" : "s"}, ${issuesCreatedCurrent.length} issue${issuesCreatedCurrent.length === 1 ? "" : "s"} dated in period, and ${requestsCreatedCurrent.length} request${requestsCreatedCurrent.length === 1 ? "" : "s"} created in period.`
  );
  if (
    !submissionsCmp.insufficientData &&
    submissionsCmp.deltaPct != null &&
    submissionsCmp.previous != null
  ) {
    summaryParts.push(
      `Daily Ops submission volume ${
        submissionsCmp.deltaPct === 0
          ? "was unchanged"
          : submissionsCmp.deltaPct > 0
            ? `increased by ${submissionsCmp.deltaPct}%`
            : `decreased by ${Math.abs(submissionsCmp.deltaPct)}%`
      } versus the previous period.`
    );
  } else {
    summaryParts.push(
      "There is not yet enough previous-period Daily Ops history to state a reliable volume trend."
    );
  }
  if (attention.length > 0) {
    summaryParts.push(
      `${attention.length} attention signal${attention.length === 1 ? "" : "s"} ${attention.length === 1 ? "was" : "were"} identified from open registers and period activity.`
    );
  } else {
    summaryParts.push(
      "No elevated attention signals were identified from the available ECC registers for this window."
    );
  }

  return {
    centreId: input.centre.id,
    centreName: input.centre.name,
    asOf,
    rangeFrom: input.rangeFrom,
    rangeTo: input.rangeTo,
    previousRangeFrom: prev.from,
    previousRangeTo: prev.to,
    periodLabel: formatRangeLabel(input.rangeFrom, input.rangeTo),
    previousPeriodLabel: formatRangeLabel(prev.from, prev.to),
    summary: summaryParts.join(" "),
    keyInsights,
    attention,
    trends,
    managementInsights,
    recommendations,
    comparisons,
    dataNotes: [
      "Intelligence is derived only from ECC Daily Ops, Issues, and Requests registers.",
      "Open issue/request totals are live register counts at analysis time, not historical reconstructions.",
      "Period comparisons use an equal-length previous window immediately before the selected range.",
      "Call metrics are not treated as formal KPIs; only Daily Ops section status and recorded fields are used.",
      "No SLA targets or external emergency-service datasets are available in ECC.",
    ],
  };
}

/** Plain strings suitable for Word report recommendation bullets. */
export function intelligenceRecommendationLines(
  snapshot: EccIntelligenceSnapshot
): string[] {
  return snapshot.recommendations.map((item) => {
    const base = item.observation;
    if (item.interpretation) {
      return `${base} Recommendation: ${item.interpretation}`;
    }
    return base;
  });
}

/** Highlights / risks for executive summary sections. */
export function intelligenceExecutiveBullets(
  snapshot: EccIntelligenceSnapshot
): { highlights: string[]; risks: string[] } {
  const highlights = [
    ...snapshot.keyInsights.slice(0, 3).map((i) => i.observation),
    ...snapshot.managementInsights.slice(0, 2).map((i) => i.observation),
  ].slice(0, 5);
  const risks = snapshot.attention.slice(0, 5).map((i) => i.observation);
  if (highlights.length === 0) {
    highlights.push(snapshot.summary);
  }
  if (risks.length === 0) {
    risks.push(
      "No elevated attention signals were identified from the available ECC registers for this window."
    );
  }
  return { highlights, risks };
}
