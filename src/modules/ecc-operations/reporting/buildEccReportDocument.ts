import {
  ECC_CENTRE_OVERALL_STATUS_LABELS,
  ECC_DAILY_OPS_PERIOD_LABELS,
  ECC_ISSUE_STATUS_LABELS,
  ECC_PRIORITY_LABELS,
  ECC_REQUEST_STATUS_LABELS,
  ECC_SECTION_CONDITION_LABELS,
  ECC_SEVERITY_LABELS,
  ECC_STAFFING_STATUS_LABELS,
} from "@/modules/ecc-operations/constants";
import {
  deriveEccIntelligence,
  intelligenceExecutiveBullets,
  intelligenceRecommendationLines,
} from "@/modules/ecc-operations/intelligence/deriveEccIntelligence";
import type {
  EccDailyOpsRecord,
  EccIssue,
  EccReportingSnapshot,
  EccRequest,
} from "@/modules/ecc-operations/types";
import { formatEccReportRangeLabel, getEccReportType } from "./constants";
import type {
  EccClientReportDocument,
  EccReportConfig,
  EccReportMetric,
  EccReportTable,
} from "./types";

function inRange(date: string, from: string, to: string): boolean {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function emptyTable(headers: string[], emptyMessage: string): EccReportTable {
  return { headers, rows: [], emptyMessage };
}

function isoDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  try {
    return new Date(value).toISOString().slice(0, 10);
  } catch {
    return value.slice(0, 10);
  }
}

export type EccReportBuildInput = {
  snapshot: EccReportingSnapshot;
  config: EccReportConfig;
  issues: EccIssue[];
  requests: EccRequest[];
  /** Full Daily Ops list preferred for period accuracy and Intelligence. */
  dailyOps?: EccDailyOpsRecord[];
};

/**
 * Shared report engine: config + live ECC data → preview/Word document model.
 * Executive summary and recommendations incorporate ECC Intelligence when
 * Daily Ops data is available.
 */
export function buildEccReportDocument(
  input: EccReportBuildInput
): EccClientReportDocument {
  const { snapshot, config, issues, requests, dailyOps } = input;
  const type = getEccReportType(config.reportType);
  const periodLabel = formatEccReportRangeLabel(
    config.rangeFrom,
    config.rangeTo
  );

  const intelligence = deriveEccIntelligence({
    centre: snapshot.centre,
    dailyOps: dailyOps ?? [],
    issues,
    requests,
    rangeFrom: config.rangeFrom,
    rangeTo: config.rangeTo,
    asOf: snapshot.asOf,
  });
  const intelBullets = intelligenceExecutiveBullets(intelligence);
  const intelRecommendations = intelligenceRecommendationLines(intelligence);

  const historyFromFullOps = (dailyOps ?? [])
    .filter((row) =>
      inRange(row.reportingDate, config.rangeFrom, config.rangeTo)
    )
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));

  // Prefer full dailyOps when provided (even if empty for the period).
  const resolvedHistory =
    dailyOps != null
      ? historyFromFullOps.map((row) => ({
          id: row.id,
          reportingDate: row.reportingDate,
          period: ECC_DAILY_OPS_PERIOD_LABELS[row.period],
          overallStatus: ECC_CENTRE_OVERALL_STATUS_LABELS[row.overallStatus],
          facilityStatus: ECC_SECTION_CONDITION_LABELS[row.facility.status],
          technicalStatus: ECC_SECTION_CONDITION_LABELS[row.technical.status],
          staffingStatus:
            ECC_STAFFING_STATUS_LABELS[row.centreOperations.staffingStatus],
          submittedBy: row.recordedByName,
        }))
      : snapshot.centreStatusHistory
          .filter((row) =>
            inRange(row.reportingDate, config.rangeFrom, config.rangeTo)
          )
          .map((row) => ({
            id: row.id,
            reportingDate: row.reportingDate,
            period: row.period,
            overallStatus: row.overallStatus,
            facilityStatus: row.facilityStatus,
            technicalStatus: row.technicalStatus,
            staffingStatus: row.staffingStatus,
            submittedBy: row.submittedBy,
          }));

  const callRows = snapshot.callPeriods.filter((row) =>
    inRange(row.reportingDate, config.rangeFrom, config.rangeTo)
  );

  const issuesInPeriod = issues.filter((issue) => {
    const day = isoDate(issue.occurredAt || issue.createdAt);
    return inRange(day, config.rangeFrom, config.rangeTo);
  });
  const openIssues = issues.filter(
    (issue) => issue.status !== "resolved" && issue.status !== "closed"
  );
  const requestsInPeriod = requests.filter((request) => {
    const day = isoDate(request.createdAt);
    return inRange(day, config.rangeFrom, config.rangeTo);
  });
  const openRequests = requests.filter(
    (request) =>
      request.status !== "resolved" &&
      request.status !== "closed" &&
      request.status !== "cancelled"
  );

  const highlights = [...intelBullets.highlights];
  const risks = [...intelBullets.risks];

  const keyMetrics: EccReportMetric[] = [
    {
      id: "submissions",
      label: "Submissions in period",
      value: String(resolvedHistory.length),
      detail: periodLabel,
    },
    {
      id: "open-issues",
      label: "Open issues",
      value: String(snapshot.openIssues),
      detail: `${snapshot.escalatedIssues} escalated`,
    },
    {
      id: "open-requests",
      label: "Open requests",
      value: String(snapshot.openRequests),
      detail: `${snapshot.highUrgentOpenRequests} high/urgent`,
    },
    {
      id: "resolved-issues",
      label: "Resolved issues (register)",
      value: String(snapshot.resolvedIssues),
    },
  ];

  const dailyOpsTable: EccReportTable =
    resolvedHistory.length === 0
      ? emptyTable(
          [
            "Date",
            "Period",
            "Overall",
            "Facility",
            "Technical",
            "Staffing",
            "Submitted by",
          ],
          "No Daily Ops submissions in this period."
        )
      : {
          headers: [
            "Date",
            "Period",
            "Overall",
            "Facility",
            "Technical",
            "Staffing",
            "Submitted by",
          ],
          rows: resolvedHistory.map((row) => ({
            id: row.id,
            cells: [
              row.reportingDate,
              row.period,
              row.overallStatus,
              row.facilityStatus,
              row.technicalStatus,
              row.staffingStatus,
              row.submittedBy,
            ],
          })),
        };

  const performanceTable: EccReportTable = {
    headers: ["Area", "Status", "Open issues", "Open requests"],
    rows: snapshot.centrePerformance.map((block) => ({
      id: block.id,
      cells: [
        block.label,
        block.statusLabel,
        String(block.openIssues),
        String(block.openRequests),
      ],
    })),
    emptyMessage: "No centre performance blocks available.",
  };

  const callTable: EccReportTable =
    callRows.length === 0
      ? emptyTable(
          ["Date", "Period", "Received", "Handled", "Waiting", "Missed", "Notes"],
          "No call activity was recorded in Daily Ops for this period."
        )
      : {
          headers: [
            "Date",
            "Period",
            "Received",
            "Handled",
            "Waiting",
            "Missed",
            "Notes",
          ],
          rows: callRows.map((row) => ({
            id: row.id,
            cells: [
              row.reportingDate,
              row.period,
              row.received ?? "—",
              row.handled ?? "—",
              row.waiting ?? "—",
              row.missed ?? "—",
              row.notes?.trim() || "—",
            ],
          })),
        };

  const issueSource = issuesInPeriod.length > 0 ? issuesInPeriod : openIssues;
  const issuesTable: EccReportTable =
    issueSource.length === 0
      ? emptyTable(
          ["ID", "Title", "Status", "Severity", "Classification", "Owner"],
          "No issues available for this report."
        )
      : {
          headers: [
            "ID",
            "Title",
            "Status",
            "Severity",
            "Classification",
            "Owner",
          ],
          rows: issueSource.slice(0, 40).map((issue) => ({
            id: issue.id,
            cells: [
              issue.id,
              issue.title,
              ECC_ISSUE_STATUS_LABELS[issue.status],
              ECC_SEVERITY_LABELS[issue.severity],
              issue.classification,
              issue.currentOwnerName || "—",
            ],
          })),
        };

  const requestSource =
    requestsInPeriod.length > 0 ? requestsInPeriod : openRequests;
  const requestsTable: EccReportTable =
    requestSource.length === 0
      ? emptyTable(
          ["ID", "Title", "Status", "Priority", "Responsibility", "Owner"],
          "No requests available for this report."
        )
      : {
          headers: [
            "ID",
            "Title",
            "Status",
            "Priority",
            "Responsibility",
            "Owner",
          ],
          rows: requestSource.slice(0, 40).map((request) => ({
            id: request.id,
            cells: [
              request.id,
              request.title,
              ECC_REQUEST_STATUS_LABELS[request.status],
              ECC_PRIORITY_LABELS[request.priority],
              request.responsibility,
              request.currentOwnerName || "—",
            ],
          })),
        };

  const stamp = new Date().toISOString();
  const title = config.title.trim() || type?.title || "ECC Report";

  return {
    id: `ECC-RPT-${stamp.slice(0, 10).replace(/-/g, "")}`,
    reportType: config.reportType,
    title,
    subtitle: `${snapshot.centre.name} · ${periodLabel}`,
    generatedAt: stamp,
    periodLabel,
    centreName: snapshot.centre.name,
    facilityLabel: snapshot.centre.facilityId || "Linked facility",
    asOf: snapshot.asOf,
    sections: [...config.sections],
    cover: {
      preparedFor: snapshot.centre.name,
      preparedBy: config.preparedBy.trim() || "ECC Operations",
      confidentiality: "Internal operational report — SentraCore ECC Operations",
    },
    executiveSummary: {
      overview: intelligence.summary,
      highlights,
      risks,
    },
    keyMetrics,
    dailyOperations: {
      narrative: `${resolvedHistory.length} Daily Ops submission${resolvedHistory.length === 1 ? "" : "s"} fall within ${periodLabel}. Morning ${snapshot.morningCount}, evening ${snapshot.eveningCount}, ad hoc ${snapshot.adHocCount} (all-time centre counts).`,
      table: dailyOpsTable,
    },
    centrePerformance: {
      narrative:
        "Current centre performance by operational area, including linked open issues and requests.",
      table: performanceTable,
    },
    callActivity: {
      narrative:
        callRows.length > 0
          ? `${callRows.length} Daily Ops period${callRows.length === 1 ? "" : "s"} include recorded call metrics in this window.`
          : "Call metrics appear only when recorded on Daily Ops submissions. No recorded call activity was found for this period.",
      table: callTable,
    },
    issues: {
      narrative: `${snapshot.openIssues} open · ${snapshot.resolvedIssues} resolved · ${snapshot.escalatedIssues} escalated on the live Issues register. Table shows ${issuesInPeriod.length > 0 ? "issues dated in the reporting period" : "current open issues"}.`,
      metrics: snapshot.issueMetrics.map((metric) => ({
        id: metric.id,
        label: metric.label,
        value: String(metric.value),
        detail: metric.detail,
      })),
      table: issuesTable,
    },
    requests: {
      narrative: `${snapshot.openRequests} open · ${snapshot.resolvedRequests} resolved on the live Requests register. Table shows ${requestsInPeriod.length > 0 ? "requests created in the reporting period" : "current open requests"}.`,
      metrics: snapshot.requestMetrics.map((metric) => ({
        id: metric.id,
        label: metric.label,
        value: String(metric.value),
        detail: metric.detail,
      })),
      table: requestsTable,
    },
    recommendations: intelRecommendations,
    appendix: {
      dataNotes: [
        "Figures are derived from ECC Daily Ops, Issues, and Requests registers.",
        "Executive summary and recommendations incorporate ECC Intelligence derived from the same registers.",
        "Issue and request register totals reflect current live state unless the table is period-filtered.",
        "Call activity is included only where recorded on Daily Ops submissions.",
        ...intelligence.dataNotes,
        `Snapshot as of ${snapshot.asOf}.`,
      ],
      registers: [
        { title: "Daily Operations (period)", table: dailyOpsTable },
        { title: "Issues", table: issuesTable },
        { title: "Requests", table: requestsTable },
      ],
    },
  };
}
