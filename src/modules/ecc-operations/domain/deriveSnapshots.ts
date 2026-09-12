import {
  ECC_OPEN_ISSUE_STATUSES,
  ECC_OPEN_REQUEST_STATUSES,
  ECC_REPORTING_DIMENSIONS,
  ECC_CENTRE_OVERALL_STATUS_LABELS,
  ECC_SECTION_CONDITION_LABELS,
  ECC_DAILY_OPS_PERIOD_LABELS,
  ECC_STAFFING_STATUS_LABELS,
} from "@/modules/ecc-operations/constants";
import {
  nowIso,
  sectionNeedsAttention,
} from "@/modules/ecc-operations/domain/rules";
import type {
  EccActivityItem,
  EccAttentionItem,
  EccCentre,
  EccDailyOpsRecord,
  EccIssue,
  EccOverviewSnapshot,
  EccReportingDimension,
  EccReportingSnapshot,
  EccRequest,
} from "@/modules/ecc-operations/types";
import { DEFAULT_ECC_CENTRE } from "@/modules/ecc-operations/types";

export type EccDeriveState = {
  centre: EccCentre;
  dailyOps: EccDailyOpsRecord[];
  issues: EccIssue[];
  requests: EccRequest[];
};

function summarizeCallActivity(latest: EccDailyOpsRecord | null): string {
  if (!latest) return "No daily ops recorded yet";
  const call = latest.callOperations;
  const parts: string[] = [];
  if (call.callsHandled) parts.push(`${call.callsHandled} handled`);
  if (call.callsReceived) parts.push(`${call.callsReceived} received`);
  if (call.waiting) parts.push(`${call.waiting} waiting`);
  if (call.missed) parts.push(`${call.missed} missed`);
  if (call.escalated) parts.push(`${call.escalated} escalated`);
  if (parts.length > 0) return parts.join(" · ");
  if (call.notes.trim()) return "Narrative recorded";
  if (Object.keys(call.additionalMetrics).length > 0) {
    return `${Object.keys(call.additionalMetrics).length} custom metric(s)`;
  }
  return "No call metrics yet";
}

export function deriveOverview(
  state: EccDeriveState,
  centreId = DEFAULT_ECC_CENTRE.id
): EccOverviewSnapshot {

    const centre =
      state.centre.id === centreId ? state.centre : DEFAULT_ECC_CENTRE;
    const dailyOps = state.dailyOps
      .filter((row) => row.centreId === centreId)
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
    const latest = dailyOps[0] ?? null;
    const issues = state.issues.filter((row) => row.centreId === centreId);
    const requests = state.requests.filter((row) => row.centreId === centreId);

    const openIssues = issues.filter((row) =>
      ECC_OPEN_ISSUE_STATUSES.includes(row.status)
    );
    const escalatedIssues = issues.filter((row) => row.status === "escalated");
    const openRequests = requests.filter((row) =>
      ECC_OPEN_REQUEST_STATUSES.includes(row.status)
    );

    const highUrgentOpenCount =
      openIssues.filter(
        (row) => row.severity === "high" || row.severity === "critical"
      ).length +
      openRequests.filter(
        (row) => row.priority === "high" || row.priority === "urgent"
      ).length;

    const waitingOnOthersCount =
      openIssues.filter(
        (row) =>
          row.status !== "escalated" && Boolean(row.currentOwnerName?.trim())
      ).length +
      openRequests.filter(
        (row) =>
          (row.status === "with_relationship_manager" ||
            row.status === "with_downstream" ||
            row.status === "in_follow_up") &&
          Boolean(row.currentOwnerName?.trim())
      ).length;

    const recentResolutions = [
      ...issues
        .filter((row) => row.status === "resolved" || row.status === "closed")
        .map((row) => ({
          id: row.id,
          kind: "issue" as const,
          title: row.title,
          at: row.updatedAt,
          href: `/ecc-operations/issues?id=${encodeURIComponent(row.id)}`,
        })),
      ...requests
        .filter((row) => row.status === "resolved" || row.status === "closed")
        .map((row) => ({
          id: row.id,
          kind: "request" as const,
          title: row.title,
          at: row.updatedAt,
          href: `/ecc-operations/requests?id=${encodeURIComponent(row.id)}`,
        })),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 6);

    const recentLinkedIds = new Set(
      dailyOps.slice(0, 5).flatMap((row) => row.linkedIssueIds)
    );
    const issuesFromRecentOps = issues
      .filter((row) => recentLinkedIds.has(row.id))
      .map((row) => ({
        id: row.id,
        title: row.title,
        href: `/ecc-operations/issues?id=${encodeURIComponent(row.id)}`,
      }));

    const attentionItems: EccAttentionItem[] = [];

    if (
      latest &&
      (latest.overallStatus === "operational_with_issues" ||
        latest.overallStatus === "disrupted" ||
        latest.overallStatus === "down" ||
        sectionNeedsAttention(latest.centreOperations.status) ||
        sectionNeedsAttention(latest.facility.status) ||
        sectionNeedsAttention(latest.technical.status) ||
        sectionNeedsAttention(latest.callOperations.status))
    ) {
      attentionItems.push({
        id: latest.id,
        kind: "status",
        title: "Latest daily ops needs attention",
        detail: `${ECC_DAILY_OPS_PERIOD_LABELS[latest.period]} · ${ECC_CENTRE_OVERALL_STATUS_LABELS[latest.overallStatus]}`,
        href: "/ecc-operations/daily-ops",
      });
    }

    for (const row of issuesFromRecentOps.slice(0, 4)) {
      attentionItems.push({
        id: row.id,
        kind: "daily_ops_issue",
        title: row.title,
        detail: "Raised from daily operations",
        href: row.href,
      });
    }

    for (const row of escalatedIssues) {
      attentionItems.push({
        id: row.id,
        kind: "escalation",
        title: row.title,
        detail: `Escalated · ${row.classification}`,
        href: `/ecc-operations/issues?id=${encodeURIComponent(row.id)}`,
      });
    }
    for (const row of openIssues.filter(
      (i) =>
        (i.severity === "high" || i.severity === "critical") &&
        i.status !== "escalated"
    )) {
      attentionItems.push({
        id: `urgent-${row.id}`,
        kind: "issue",
        title: row.title,
        detail: `${row.severity} severity · ${row.status}`,
        href: `/ecc-operations/issues?id=${encodeURIComponent(row.id)}`,
      });
    }
    for (const row of openRequests.filter(
      (r) => r.priority === "high" || r.priority === "urgent"
    )) {
      attentionItems.push({
        id: `urgent-req-${row.id}`,
        kind: "request",
        title: row.title,
        detail: `${row.priority} priority · ${row.status}`,
        href: `/ecc-operations/requests?id=${encodeURIComponent(row.id)}`,
      });
    }
    for (const row of openIssues
      .filter((i) => i.status !== "escalated" && !recentLinkedIds.has(i.id))
      .slice(0, 3)) {
      attentionItems.push({
        id: row.id,
        kind: "issue",
        title: row.title,
        detail: `${row.severity} · ${row.status}`,
        href: `/ecc-operations/issues?id=${encodeURIComponent(row.id)}`,
      });
    }
    for (const row of openRequests
      .filter((r) => r.priority !== "high" && r.priority !== "urgent")
      .slice(0, 3)) {
      attentionItems.push({
        id: row.id,
        kind: "request",
        title: row.title,
        detail: `${row.responsibility} · ${row.status}`,
        href: `/ecc-operations/requests?id=${encodeURIComponent(row.id)}`,
      });
    }

    const recentActivity: EccActivityItem[] = [];
    for (const row of dailyOps.slice(0, 5)) {
      recentActivity.push({
        id: row.id,
        kind: "daily_ops",
        at: row.recordedAt,
        title: `Daily ops · ${ECC_DAILY_OPS_PERIOD_LABELS[row.period]}`,
        detail: `${row.recordedByName} · ${ECC_CENTRE_OVERALL_STATUS_LABELS[row.overallStatus]}`,
        href: "/ecc-operations/daily-ops",
      });
    }
    for (const row of [...issues]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 5)) {
      recentActivity.push({
        id: row.id,
        kind: "issue",
        at: row.updatedAt,
        title: row.title,
        detail: row.classification,
        href: `/ecc-operations/issues?id=${encodeURIComponent(row.id)}`,
      });
    }
    for (const row of [...requests]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 5)) {
      recentActivity.push({
        id: row.id,
        kind: "request",
        at: row.updatedAt,
        title: row.title,
        detail: row.responsibility,
        href: `/ecc-operations/requests?id=${encodeURIComponent(row.id)}`,
      });
    }
    recentActivity.sort((a, b) => b.at.localeCompare(a.at));

    return {
      centre,
      asOf: nowIso(),
      latestDailyOps: latest,
      overallStatus: latest?.overallStatus ?? "unknown",
      facilityStatus: latest?.facility.status ?? "unknown",
      technicalStatus: latest?.technical.status ?? "unknown",
      centreSectionStatus: latest?.centreOperations.status ?? "unknown",
      staffingStatus: latest?.centreOperations.staffingStatus ?? "unknown",
      staffingReadiness: latest?.centreOperations.staffingReadiness ?? "",
      callActivitySummary: summarizeCallActivity(latest),
      issuesFromRecentOps,
      openIssueCount: openIssues.length,
      openRequestCount: openRequests.length,
      escalatedIssueCount: escalatedIssues.length,
      highUrgentOpenCount,
      waitingOnOthersCount,
      recentResolutions,
      attentionItems: attentionItems.slice(0, 10),
      recentActivity: recentActivity.slice(0, 12),
    };
}

export function deriveReportingSnapshot(
  state: EccDeriveState,
  centreId = DEFAULT_ECC_CENTRE.id
): EccReportingSnapshot {

    const centre =
      state.centre.id === centreId ? state.centre : DEFAULT_ECC_CENTRE;
    const dailyOps = [...state.dailyOps.filter((row) => row.centreId === centreId)].sort(
      (a, b) => b.recordedAt.localeCompare(a.recordedAt)
    );
    const issues = state.issues.filter((row) => row.centreId === centreId);
    const requests = state.requests.filter((row) => row.centreId === centreId);
    const latest = dailyOps[0] ?? null;

    const openIssueRows = issues.filter((row) =>
      ECC_OPEN_ISSUE_STATUSES.includes(row.status)
    );
    const resolvedIssueRows = issues.filter(
      (row) => row.status === "resolved" || row.status === "closed"
    );
    const escalatedIssueRows = issues.filter(
      (row) => row.status === "escalated"
    );
    const openRequestRows = requests.filter((row) =>
      ECC_OPEN_REQUEST_STATUSES.includes(row.status)
    );
    const resolvedRequestRows = requests.filter(
      (row) => row.status === "resolved" || row.status === "closed"
    );

    const morningCount = dailyOps.filter((row) => row.period === "morning").length;
    const eveningCount = dailyOps.filter((row) => row.period === "evening").length;
    const adHocCount = dailyOps.filter((row) => row.period === "ad_hoc").length;

    const sectionIssueCounts = {
      centre: dailyOps.filter((row) =>
        sectionNeedsAttention(row.centreOperations.status)
      ).length,
      facility: dailyOps.filter((row) =>
        sectionNeedsAttention(row.facility.status)
      ).length,
      technical: dailyOps.filter((row) =>
        sectionNeedsAttention(row.technical.status)
      ).length,
      call: dailyOps.filter((row) =>
        sectionNeedsAttention(row.callOperations.status)
      ).length,
    };

    const recurringSectionIssues = (
      [
        ["Centre operations", sectionIssueCounts.centre, "/ecc-operations/daily-ops"],
        ["Facility", sectionIssueCounts.facility, "/ecc-operations/daily-ops"],
        ["Technical", sectionIssueCounts.technical, "/ecc-operations/daily-ops"],
        ["Call operations", sectionIssueCounts.call, "/ecc-operations/daily-ops"],
      ] as const
    )
      .filter(([, count]) => count > 0)
      .map(([section, issueOrDisruptedCount, href]) => ({
        section,
        issueOrDisruptedCount,
        href,
      }));

    const centreStatusHistory = dailyOps.slice(0, 12).map((row) => ({
      id: row.id,
      at: row.recordedAt,
      period: ECC_DAILY_OPS_PERIOD_LABELS[row.period],
      periodKey: row.period,
      reportingDate: row.reportingDate,
      overallStatus: ECC_CENTRE_OVERALL_STATUS_LABELS[row.overallStatus],
      overallStatusKey: row.overallStatus,
      centreOpsStatus:
        ECC_SECTION_CONDITION_LABELS[row.centreOperations.status],
      centreOpsStatusKey: row.centreOperations.status,
      facilityStatus: ECC_SECTION_CONDITION_LABELS[row.facility.status],
      facilityStatusKey: row.facility.status,
      technicalStatus: ECC_SECTION_CONDITION_LABELS[row.technical.status],
      technicalStatusKey: row.technical.status,
      staffingStatus:
        ECC_STAFFING_STATUS_LABELS[row.centreOperations.staffingStatus],
      staffingStatusKey: row.centreOperations.staffingStatus,
      submittedBy: row.recordedByName,
      href: "/ecc-operations/daily-ops",
    }));

    const openIssueCountForSection = (section: "centre" | "facility" | "technical" | "call") =>
      openIssueRows.filter((row) => row.sourceDailyOpsSection === section)
        .length;
    const openRequestCountForSection = (
      section: "centre" | "facility" | "technical" | "call"
    ) =>
      openRequestRows.filter((row) => row.sourceDailyOpsSection === section)
        .length;

    const centrePerformance = [
      {
        id: "centre" as const,
        label: "Centre operations",
        statusLabel: latest
          ? ECC_CENTRE_OVERALL_STATUS_LABELS[latest.overallStatus]
          : "Not stated",
        statusKey: latest?.overallStatus ?? "unknown",
        openIssues: openIssueCountForSection("centre"),
        openRequests: openRequestCountForSection("centre"),
      },
      {
        id: "facility" as const,
        label: "Facility",
        statusLabel: latest
          ? ECC_SECTION_CONDITION_LABELS[latest.facility.status]
          : "Not stated",
        statusKey: latest?.facility.status ?? "unknown",
        openIssues: openIssueCountForSection("facility"),
        openRequests: openRequestCountForSection("facility"),
      },
      {
        id: "technical" as const,
        label: "Technical",
        statusLabel: latest
          ? ECC_SECTION_CONDITION_LABELS[latest.technical.status]
          : "Not stated",
        statusKey: latest?.technical.status ?? "unknown",
        openIssues: openIssueCountForSection("technical"),
        openRequests: openRequestCountForSection("technical"),
      },
      {
        id: "staffing" as const,
        label: "Staffing / readiness",
        statusLabel: latest
          ? ECC_STAFFING_STATUS_LABELS[latest.centreOperations.staffingStatus]
          : "Not stated",
        statusKey: latest?.centreOperations.staffingStatus ?? "unknown",
        openIssues: 0,
        openRequests: 0,
      },
    ];

    const callPeriodsRaw = dailyOps.slice(0, 14).map((row) => {
      const call = row.callOperations;
      const hasActivity = Boolean(
        call.callsReceived ||
          call.callsHandled ||
          call.waiting ||
          call.missed ||
          call.escalated ||
          call.notes.trim() ||
          Object.keys(call.additionalMetrics).length
      );
      return {
        id: row.id,
        at: row.recordedAt,
        period: ECC_DAILY_OPS_PERIOD_LABELS[row.period],
        reportingDate: row.reportingDate,
        received: call.callsReceived,
        handled: call.callsHandled,
        waiting: call.waiting,
        missed: call.missed,
        escalated: call.escalated,
        notes: call.notes || undefined,
        additionalCount: Object.keys(call.additionalMetrics).length,
        href: "/ecc-operations/daily-ops",
        hasActivity,
      };
    });
    const callActivityRecordedCount = callPeriodsRaw.filter(
      (row) => row.hasActivity
    ).length;
    const callPeriods = callPeriodsRaw.map((row) => ({
      id: row.id,
      at: row.at,
      period: row.period,
      reportingDate: row.reportingDate,
      received: row.received,
      handled: row.handled,
      waiting: row.waiting,
      missed: row.missed,
      escalated: row.escalated,
      notes: row.notes,
      additionalCount: row.additionalCount,
      href: row.href,
    }));

    const highCriticalOpenIssues = openIssueRows.filter(
      (row) => row.severity === "high" || row.severity === "critical"
    ).length;
    const operationalOpenIssues = openIssueRows.filter(
      (row) => row.classification === "operational"
    ).length;
    const technicalOpenIssues = openIssueRows.filter(
      (row) => row.classification === "technical"
    ).length;
    const waitingIssues = openIssueRows.filter(
      (row) =>
        row.status !== "escalated" && Boolean(row.currentOwnerName?.trim())
    ).length;

    const withRmOrDownstream = openRequestRows.filter(
      (row) =>
        row.status === "with_relationship_manager" ||
        row.status === "with_downstream"
    ).length;
    const companyResponsibilityOpen = openRequestRows.filter(
      (row) => row.responsibility === "company"
    ).length;
    const clientResponsibilityOpen = openRequestRows.filter(
      (row) => row.responsibility === "client"
    ).length;
    const highUrgentOpenRequests = openRequestRows.filter(
      (row) => row.priority === "high" || row.priority === "urgent"
    ).length;
    const waitingRequests = openRequestRows.filter((row) =>
      Boolean(row.currentOwnerName?.trim())
    ).length;

    const byDate = new Map<string, number>();
    const trendBucket = new Map<
      string,
      { total: number; operational: number; withIssues: number; disrupted: number }
    >();
    for (const row of dailyOps) {
      byDate.set(row.reportingDate, (byDate.get(row.reportingDate) ?? 0) + 1);
      const bucket = trendBucket.get(row.reportingDate) ?? {
        total: 0,
        operational: 0,
        withIssues: 0,
        disrupted: 0,
      };
      bucket.total += 1;
      if (row.overallStatus === "operational") bucket.operational += 1;
      else if (row.overallStatus === "operational_with_issues")
        bucket.withIssues += 1;
      else bucket.disrupted += 1;
      trendBucket.set(row.reportingDate, bucket);
    }
    const dailyOpsByDate = [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
      .map(([key, value]) => ({ key, label: key, value }));

    const dailyOpsTrendSeries = [...trendBucket.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
      .map(([key, value]) => ({
        key,
        label: key,
        total: value.total,
        operational: value.operational,
        withIssues: value.withIssues,
        disrupted: value.disrupted,
      }));

    const dimensions: EccReportingDimension[] = ECC_REPORTING_DIMENSIONS.map(
      (dim) => {
        switch (dim.id) {
          case "daily-ops":
            return {
              ...dim,
              currentValue: String(dailyOps.length),
              href: "/ecc-operations/daily-ops",
            };
          case "call-activity":
            return {
              ...dim,
              currentValue: `${callActivityRecordedCount} periods with recorded activity`,
              status: "pending_definition" as const,
              href: "/ecc-operations/daily-ops",
            };
          case "escalations":
            return {
              ...dim,
              currentValue: String(escalatedIssueRows.length),
              href: "/ecc-operations/issues",
            };
          case "requests":
            return {
              ...dim,
              currentValue: `${openRequestRows.length} open / ${resolvedRequestRows.length} resolved`,
              href: "/ecc-operations/requests",
            };
          case "issue-resolution":
            return {
              ...dim,
              currentValue: `${openIssueRows.length} open / ${resolvedIssueRows.length} resolved`,
              href: "/ecc-operations/issues",
            };
          case "facility-condition":
            return {
              ...dim,
              currentValue: latest
                ? ECC_SECTION_CONDITION_LABELS[latest.facility.status]
                : "—",
              href: "/ecc-operations/daily-ops",
            };
          case "technical-condition":
            return {
              ...dim,
              currentValue: latest
                ? ECC_SECTION_CONDITION_LABELS[latest.technical.status]
                : "—",
              href: "/ecc-operations/daily-ops",
            };
          case "corrective-actions": {
            const actionCount =
              issues.reduce(
                (sum, row) =>
                  sum +
                  row.history.filter((entry) => entry.kind === "action").length,
                0
              ) +
              requests.reduce(
                (sum, row) =>
                  sum +
                  row.history.filter((entry) => entry.kind === "action").length,
                0
              );
            return {
              ...dim,
              currentValue: String(actionCount),
              href: "/ecc-operations/issues",
            };
          }
          default:
            return { ...dim };
        }
      }
    );

    return {
      centre,
      asOf: nowIso(),
      dimensions,
      latestOverallStatus: latest
        ? ECC_CENTRE_OVERALL_STATUS_LABELS[latest.overallStatus]
        : "Not stated",
      latestOverallStatusKey: latest?.overallStatus ?? null,
      latestCentreOpsStatus: latest
        ? ECC_SECTION_CONDITION_LABELS[latest.centreOperations.status]
        : "Not stated",
      latestCentreOpsStatusKey: latest?.centreOperations.status ?? null,
      latestFacilityStatus: latest
        ? ECC_SECTION_CONDITION_LABELS[latest.facility.status]
        : "Not stated",
      latestFacilityStatusKey: latest?.facility.status ?? null,
      latestTechnicalStatus: latest
        ? ECC_SECTION_CONDITION_LABELS[latest.technical.status]
        : "Not stated",
      latestTechnicalStatusKey: latest?.technical.status ?? null,
      latestStaffingStatus: latest
        ? ECC_STAFFING_STATUS_LABELS[latest.centreOperations.staffingStatus]
        : "Not stated",
      latestStaffingStatusKey: latest?.centreOperations.staffingStatus ?? null,
      latestStaffingReadiness: latest?.centreOperations.staffingReadiness ?? "",
      latestDailyOpsId: latest?.id ?? null,
      latestRecordedAt: latest?.recordedAt ?? null,
      morningCount,
      eveningCount,
      adHocCount,
      dailyOpsCount: dailyOps.length,
      recurringSectionIssues,
      centrePerformance,
      centreStatusHistory,
      callPeriods,
      callActivityRecordedCount,
      openIssues: openIssueRows.length,
      resolvedIssues: resolvedIssueRows.length,
      escalatedIssues: escalatedIssueRows.length,
      highCriticalOpenIssues,
      operationalOpenIssues,
      technicalOpenIssues,
      waitingIssues,
      issueMetrics: [
        {
          id: "open",
          label: "Open",
          value: openIssueRows.length,
          href: "/ecc-operations/issues",
        },
        {
          id: "resolved",
          label: "Resolved / closed",
          value: resolvedIssueRows.length,
          href: "/ecc-operations/issues",
        },
        {
          id: "escalated",
          label: "Escalated",
          value: escalatedIssueRows.length,
          href: "/ecc-operations/issues",
        },
        {
          id: "high",
          label: "High / critical open",
          value: highCriticalOpenIssues,
          href: "/ecc-operations/issues",
        },
        {
          id: "ops",
          label: "Operational open",
          value: operationalOpenIssues,
          href: "/ecc-operations/issues",
        },
        {
          id: "tech",
          label: "Technical open",
          value: technicalOpenIssues,
          href: "/ecc-operations/issues",
        },
        {
          id: "waiting",
          label: "Waiting (owned)",
          value: waitingIssues,
          detail: "Open issues with a current owner",
          href: "/ecc-operations/issues",
        },
      ],
      openRequests: openRequestRows.length,
      resolvedRequests: resolvedRequestRows.length,
      withRmOrDownstream,
      companyResponsibilityOpen,
      clientResponsibilityOpen,
      highUrgentOpenRequests,
      waitingRequests,
      requestMetrics: [
        {
          id: "open",
          label: "Open",
          value: openRequestRows.length,
          href: "/ecc-operations/requests",
        },
        {
          id: "resolved",
          label: "Resolved / closed",
          value: resolvedRequestRows.length,
          href: "/ecc-operations/requests",
        },
        {
          id: "rm",
          label: "With RM / downstream",
          value: withRmOrDownstream,
          href: "/ecc-operations/requests",
        },
        {
          id: "company",
          label: "Company responsibility",
          value: companyResponsibilityOpen,
          href: "/ecc-operations/requests",
        },
        {
          id: "client",
          label: "Client responsibility",
          value: clientResponsibilityOpen,
          href: "/ecc-operations/requests",
        },
        {
          id: "urgent",
          label: "High / urgent open",
          value: highUrgentOpenRequests,
          href: "/ecc-operations/requests",
        },
        {
          id: "waiting",
          label: "Waiting (owned)",
          value: waitingRequests,
          href: "/ecc-operations/requests",
        },
      ],
      dailyOpsByDate,
      dailyOpsTrendSeries,
      issuesOpenVsResolved: [
        { key: "open", label: "Open", value: openIssueRows.length },
        { key: "resolved", label: "Resolved", value: resolvedIssueRows.length },
      ],
      issuesByClassification: [
        {
          key: "operational",
          label: "Operational",
          value: operationalOpenIssues,
        },
        { key: "technical", label: "Technical", value: technicalOpenIssues },
      ],
      requestsByResponsibility: [
        {
          key: "company",
          label: "Company",
          value: companyResponsibilityOpen,
        },
        { key: "client", label: "Client", value: clientResponsibilityOpen },
      ],
      submissionsByPeriod: [
        { key: "morning", label: "Morning", value: morningCount },
        { key: "evening", label: "Evening", value: eveningCount },
        { key: "ad_hoc", label: "Ad hoc", value: adHocCount },
      ],
    };
}
