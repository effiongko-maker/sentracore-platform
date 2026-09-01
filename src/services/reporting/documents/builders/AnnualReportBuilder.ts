import type { ReportingSnapshot } from "@/services/reporting/types";
import type {
  AnnualStatusReportDocument,
  DocumentBuildContext,
} from "../types";
import {
  buildCoverLetter,
  closureRate,
  formatPercent,
  recommendationBullets,
  riskBullets,
} from "./shared";

export function buildAnnualReportDocument(
  snapshot: ReportingSnapshot,
  context: DocumentBuildContext
): AnnualStatusReportDocument {
  const { kpis, health } = snapshot;
  const closedPct = closureRate(snapshot);

  const achievements: string[] = [];
  if (kpis.activeFacilities > 0) {
    achievements.push(
      `${kpis.activeFacilities} active facilities under management.`
    );
  }
  if (closedPct >= 70) {
    achievements.push(`Work order closure rate reached ${closedPct}%.`);
  }
  if (kpis.assetsOperationalPercent != null && kpis.assetsOperationalPercent >= 85) {
    achievements.push(
      `Asset operational availability at ${kpis.assetsOperationalPercent}%.`
    );
  }
  if (achievements.length === 0) {
    achievements.push(
      "Continued delivery of core facility management services across the estate."
    );
  }

  const challenges = riskBullets(snapshot);
  const lessons = [
    health.band === "healthy"
      ? "Stable operations confirm the value of proactive maintenance and clear ownership."
      : "Elevated risk signals reinforce the need for earlier escalation and backlog control.",
    kpis.criticalWork > 0
      ? "Critical work remains a leading indicator for resource prioritisation."
      : "Low critical-work volume supports current response playbooks.",
    "Consistent KPI monitoring through ReportingSnapshot enables comparable year-on-year reporting.",
  ];

  const fields = {
    facilityName: context.facilityName ?? "Portfolio",
    reportingPeriod: context.period.label,
    year: context.period.year ?? "",
    generatedAt: context.generatedAt,
    totalFacilities: kpis.totalFacilities,
    totalAssets: kpis.totalAssets,
    assetAvailability: formatPercent(kpis.assetsOperationalPercent),
    openWorkOrders: kpis.openWorkOrders,
    closureRate: `${closedPct}%`,
    maintenanceBacklog: kpis.maintenanceBacklog,
    criticalWork: kpis.criticalWork,
    workforce: kpis.activeWorkforce,
    operationalScore: health.score,
    majorRisks: challenges.join(" | "),
    recommendations: recommendationBullets(snapshot).join(" | "),
    achievements: achievements.join(" | "),
    lessonsLearned: lessons.join(" | "),
  };

  return {
    kind: "annual",
    title: "Annual Status Report",
    subtitle: `${fields.facilityName} — ${context.period.label}`,
    context,
    coverLetter: buildCoverLetter({
      context,
      reportTitle: "Annual Status Report",
      highlights: achievements.slice(0, 3),
    }),
    fields,
    sections: [
      {
        id: "annual_kpis",
        title: "Annual KPIs",
        metrics: [
          { key: "facilities", label: "Facilities", value: kpis.totalFacilities },
          { key: "assets", label: "Assets", value: kpis.totalAssets },
          {
            key: "availability",
            label: "Asset availability",
            value: fields.assetAvailability,
          },
          { key: "closure", label: "Closure rate", value: fields.closureRate },
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
          { key: "workforce", label: "Workforce", value: kpis.activeWorkforce },
          { key: "score", label: "Operational score", value: health.score },
        ],
      },
      {
        id: "achievements",
        title: "Achievements",
        bullets: achievements,
      },
      {
        id: "asset_health",
        title: "Asset Health",
        metrics: [
          { key: "active", label: "Active assets", value: kpis.activeAssets },
          {
            key: "poor",
            label: "Poor condition",
            value: kpis.assetsInPoorCondition,
          },
          {
            key: "availability",
            label: "Operational %",
            value: fields.assetAvailability,
          },
        ],
      },
      {
        id: "operational_challenges",
        title: "Operational Challenges",
        bullets: challenges,
      },
      {
        id: "lessons_learned",
        title: "Lessons Learned",
        bullets: lessons,
      },
      {
        id: "recommendations",
        title: "Recommendations",
        bullets: recommendationBullets(snapshot),
      },
    ],
  };
}
