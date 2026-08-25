import type { ReportingSnapshot } from "@/services/reporting/types";
import type {
  DocumentBuildContext,
  QuarterlyReportDocument,
} from "../types";
import {
  buildCoverLetter,
  closureRate,
  formatPercent,
  listTitles,
  recommendationBullets,
  riskBullets,
} from "./shared";

export function buildQuarterlyReportDocument(
  snapshot: ReportingSnapshot,
  context: DocumentBuildContext
): QuarterlyReportDocument {
  const { kpis, health, assets } = snapshot;
  const closedPct = closureRate(snapshot);

  const majorAssets = assets
    .filter((a) => a.criticality === "critical" || a.criticality === "high")
    .slice(0, 25)
    .map((a) => ({
      id: a.id,
      name: a.name,
      facility: a.facility,
      condition: a.condition,
      status: a.status,
      criticality: a.criticality,
    }));

  const projectsCompleted = snapshot.workOrders
    .filter((w) => ["completed", "closed"].includes(w.status))
    .slice(0, 20)
    .map((w) => ({
      title: w.title,
      type: w.type,
      priority: w.priority,
      completedAt: w.completedAt?.slice(0, 10) ?? "—",
    }));

  const fields = {
    facilityName: context.facilityName ?? "Portfolio",
    reportingPeriod: context.period.label,
    quarter: context.period.quarter ?? "",
    year: context.period.year ?? "",
    generatedAt: context.generatedAt,
    operationalScore: health.score,
    assetAvailability: formatPercent(kpis.assetsOperationalPercent),
    workOrdersRaised: snapshot.workOrders.length,
    closureRate: `${closedPct}%`,
    criticalIncidents: kpis.criticalIncidents,
    maintenanceBacklog: kpis.maintenanceBacklog,
    majorRisks: riskBullets(snapshot).join(" | "),
    recommendations: recommendationBullets(snapshot).join(" | "),
  };

  return {
    kind: "quarterly",
    title: "Quarterly Report",
    subtitle: `${fields.facilityName} — ${context.period.label}`,
    context,
    coverLetter: buildCoverLetter({
      context,
      reportTitle: "Quarterly Report",
      highlights: [
        `Operational score ${health.score}`,
        `${majorAssets.length} major assets listed`,
        `${projectsCompleted.length} completed work items sampled`,
      ],
    }),
    fields,
    sections: [
      {
        id: "quarter_overview",
        title: "Quarter Overview",
        paragraphs: [
          `Quarterly status for ${fields.facilityName} covering ${context.period.label}.`,
          health.summary,
        ],
      },
      {
        id: "kpi_trends",
        title: "KPI Trends",
        metrics: [
          {
            key: "open_wo",
            label: "Open work orders",
            value: kpis.openWorkOrders,
          },
          {
            key: "closure",
            label: "Closure rate",
            value: fields.closureRate,
          },
          {
            key: "backlog",
            label: "Maintenance backlog",
            value: kpis.maintenanceBacklog,
          },
          {
            key: "critical",
            label: "Critical incidents",
            value: kpis.criticalIncidents,
          },
          {
            key: "availability",
            label: "Asset availability",
            value: fields.assetAvailability,
          },
          { key: "score", label: "Operational score", value: health.score },
        ],
        paragraphs: [
          "Trend visuals will attach in a future charting release; KPI values above reflect the current reporting snapshot.",
        ],
      },
      {
        id: "major_asset_register",
        title: "Major Asset Register",
        rows: majorAssets,
        bullets:
          majorAssets.length === 0
            ? ["No high/critical assets in scope."]
            : majorAssets
                .slice(0, 10)
                .map((a) => `${a.id} — ${a.name} (${a.condition})`),
      },
      {
        id: "projects_completed",
        title: "Projects Completed",
        rows: projectsCompleted,
        bullets: listTitles(projectsCompleted, 10),
      },
      {
        id: "major_risks",
        title: "Major Risks",
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
