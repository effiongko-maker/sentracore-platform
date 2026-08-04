import type { ReportingSnapshot } from "@/services/reporting/types";
import type {
  DocumentBuildContext,
  ExecutiveSummaryDocument,
} from "../types";
import {
  buildCoverLetter,
  formatNumber,
  formatPercent,
  recommendationBullets,
  riskBullets,
} from "./shared";

export function buildExecutiveSummaryDocument(
  snapshot: ReportingSnapshot,
  context: DocumentBuildContext
): ExecutiveSummaryDocument {
  const { kpis, health } = snapshot;

  const fields = {
    facilityName: context.facilityName ?? "Portfolio",
    reportingPeriod: context.period.label,
    generatedAt: context.generatedAt,
    operationalScore: health.score,
    healthBand: health.band,
    healthSummary: health.summary,
    totalFacilities: kpis.totalFacilities,
    activeFacilities: kpis.activeFacilities,
    totalAssets: kpis.totalAssets,
    assetAvailability: formatPercent(kpis.assetsOperationalPercent),
    openWorkOrders: kpis.openWorkOrders,
    overdueWorkOrders: kpis.overdueWorkOrders,
    maintenanceBacklog: kpis.maintenanceBacklog,
    criticalIncidents: kpis.criticalIncidents,
    workforce: kpis.activeWorkforce,
    majorRisks: riskBullets(snapshot).join(" | "),
    recommendations: recommendationBullets(snapshot).join(" | "),
  };

  return {
    kind: "executive_summary",
    title: "Executive Summary",
    subtitle: `Portfolio overview — ${context.period.label}`,
    context,
    coverLetter: buildCoverLetter({
      context,
      reportTitle: "Executive Summary",
      highlights: [
        `Operational score ${health.score} (${health.band})`,
        `${kpis.openWorkOrders} open work orders`,
        `${kpis.criticalIncidents} critical incidents`,
      ],
    }),
    fields,
    sections: [
      {
        id: "portfolio_kpis",
        title: "Portfolio KPIs",
        metrics: [
          { key: "facilities", label: "Facilities", value: kpis.totalFacilities },
          { key: "assets", label: "Assets", value: kpis.totalAssets },
          {
            key: "open_wo",
            label: "Open Work Orders",
            value: kpis.openWorkOrders,
          },
          {
            key: "backlog",
            label: "Maintenance Backlog",
            value: kpis.maintenanceBacklog,
          },
          {
            key: "critical",
            label: "Critical Incidents",
            value: kpis.criticalIncidents,
          },
          {
            key: "workforce",
            label: "Workforce",
            value: kpis.activeWorkforce,
          },
        ],
      },
      {
        id: "cross_module_health",
        title: "Cross-module health",
        paragraphs: [health.summary],
        metrics: [
          { key: "score", label: "Operational score", value: health.score },
          { key: "band", label: "Health band", value: health.band },
        ],
      },
      {
        id: "risk_summary",
        title: "Risk summary",
        bullets: riskBullets(snapshot),
      },
      {
        id: "backlog",
        title: "Backlog",
        metrics: [
          {
            key: "maintenance_backlog",
            label: "Maintenance backlog",
            value: formatNumber(kpis.maintenanceBacklog),
          },
          {
            key: "overdue_maintenance",
            label: "Overdue maintenance",
            value: formatNumber(kpis.overdueMaintenance),
          },
          {
            key: "overdue_wo",
            label: "Overdue work orders",
            value: formatNumber(kpis.overdueWorkOrders),
          },
          {
            key: "wo_on_hold",
            label: "Work orders on hold",
            value: formatNumber(kpis.workOrdersOnHold),
          },
        ],
      },
      {
        id: "incident_overview",
        title: "Incident overview",
        metrics: [
          {
            key: "critical",
            label: "Critical incidents",
            value: kpis.criticalIncidents,
          },
          {
            key: "unassigned",
            label: "Critical unassigned",
            value: kpis.criticalIncidentsUnassigned,
          },
          {
            key: "needs_wo",
            label: "Needing work order",
            value: kpis.incidentsNeedingWorkOrder,
          },
        ],
        bullets: snapshot.projections.criticalIncidents
          .slice(0, 8)
          .map((i) => i.title),
      },
      {
        id: "recommendations",
        title: "Recommendations",
        bullets: recommendationBullets(snapshot),
      },
    ],
  };
}
