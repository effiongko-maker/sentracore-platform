import type { ReportingSnapshot } from "@/services/reporting/types";
import type {
  DocumentBuildContext,
  MonthlyFacilityReportDocument,
} from "../types";
import {
  buildCoverLetter,
  closureRate,
  formatPercent,
  listTitles,
  recommendationBullets,
  riskBullets,
} from "./shared";

export function buildMonthlyFacilityReportDocument(
  snapshot: ReportingSnapshot,
  context: DocumentBuildContext
): MonthlyFacilityReportDocument {
  const { kpis, health, projections } = snapshot;
  const raised = snapshot.workOrders.length;
  const closedPct = closureRate(snapshot);

  const fields = {
    facilityName: context.facilityName ?? "Portfolio",
    reportingPeriod: context.period.label,
    month: context.period.month ?? "",
    year: context.period.year ?? "",
    generatedAt: context.generatedAt,
    department: context.department ?? "",
    workOrdersRaised: raised,
    openWorkOrders: kpis.openWorkOrders,
    closureRate: `${closedPct}%`,
    assetAvailability: formatPercent(kpis.assetsOperationalPercent),
    criticalWork: kpis.criticalWork,
    maintenanceBacklog: kpis.maintenanceBacklog,
    operationalScore: health.score,
    healthSummary: health.summary,
    majorRisks: riskBullets(snapshot).join(" | "),
    recommendations: recommendationBullets(snapshot).join(" | "),
  };

  return {
    kind: "monthly_facility",
    title: "Monthly Facility Report",
    subtitle: `${fields.facilityName} — ${context.period.label}`,
    context,
    coverLetter: buildCoverLetter({
      context,
      reportTitle: "Monthly Facility Report",
      highlights: [
        `${raised} work orders in scope`,
        `Closure rate ${closedPct}%`,
        `Asset availability ${fields.assetAvailability}`,
      ],
    }),
    fields,
    sections: [
      {
        id: "executive_summary",
        title: "Executive Summary",
        paragraphs: [
          `This monthly report covers ${fields.facilityName} for ${context.period.label}.`,
          health.summary,
        ],
        metrics: [
          { key: "score", label: "Operational score", value: health.score },
          {
            key: "availability",
            label: "Asset availability",
            value: fields.assetAvailability,
          },
          { key: "closure", label: "Closure rate", value: fields.closureRate },
        ],
      },
      {
        id: "contract_performance",
        title: "Contract Performance Dashboard",
        metrics: [
          { key: "wo_raised", label: "Work orders raised", value: raised },
          {
            key: "wo_open",
            label: "Open work orders",
            value: kpis.openWorkOrders,
          },
          {
            key: "wo_overdue",
            label: "Overdue work orders",
            value: kpis.overdueWorkOrders,
          },
          {
            key: "backlog",
            label: "Maintenance backlog",
            value: kpis.maintenanceBacklog,
          },
          {
            key: "critical",
            label: "Critical work",
            value: kpis.criticalWork,
          },
          {
            key: "workforce",
            label: "Active workforce",
            value: kpis.activeWorkforce,
          },
        ],
      },
      {
        id: "key_activities",
        title: "Key Activities",
        bullets: [
          ...listTitles(projections.latestOpenWorkOrders, 5),
          ...listTitles(projections.latestActiveMaintenance, 5),
        ],
      },
      {
        id: "asset_health",
        title: "Asset Health",
        metrics: [
          { key: "total", label: "Total assets", value: kpis.totalAssets },
          { key: "active", label: "Active assets", value: kpis.activeAssets },
          {
            key: "availability",
            label: "Operational %",
            value: fields.assetAvailability,
          },
          {
            key: "poor",
            label: "Poor condition",
            value: kpis.assetsInPoorCondition,
          },
        ],
      },
      {
        id: "issues_risks",
        title: "Issues & Risks",
        bullets: riskBullets(snapshot),
      },
      {
        id: "recommendations",
        title: "Recommendations",
        bullets: recommendationBullets(snapshot),
      },
    ],
  };
}
