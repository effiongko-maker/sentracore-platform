import type { ReportingSnapshot } from "@/services/reporting/types";
import type {
  DocumentBuildContext,
  IncidentReportDocument,
} from "../types";
import {
  buildCoverLetter,
  recommendationBullets,
  riskBullets,
} from "./shared";

export function buildIncidentReportDocument(
  snapshot: ReportingSnapshot,
  context: DocumentBuildContext
): IncidentReportDocument {
  const { kpis, incidents, projections } = snapshot;

  const rows = incidents.slice(0, 100).map((i) => ({
    title: i.title,
    type: i.type,
    severity: i.severity,
    status: i.status,
    reportedAt: i.reportedAt?.slice(0, 10) ?? "—",
  }));

  const fields = {
    facilityName: context.facilityName ?? "Portfolio",
    reportingPeriod: context.period.label,
    generatedAt: context.generatedAt,
    criticalIncidents: kpis.criticalIncidents,
    criticalIncidentsUnassigned: kpis.criticalIncidentsUnassigned,
    incidentsNeedingWorkOrder: kpis.incidentsNeedingWorkOrder,
    totalIncidents: incidents.length,
    majorRisks: riskBullets(snapshot).join(" | "),
    recommendations: recommendationBullets(snapshot).join(" | "),
  };

  return {
    kind: "incident",
    title: "Incident Report",
    subtitle: `${fields.facilityName} — ${context.period.label}`,
    context,
    coverLetter: buildCoverLetter({
      context,
      reportTitle: "Incident Report",
      highlights: [
        `${kpis.criticalIncidents} critical incidents`,
        `${incidents.length} incidents in scope`,
      ],
    }),
    fields,
    sections: [
      {
        id: "summary",
        title: "Incident Summary",
        metrics: [
          {
            key: "critical",
            label: "Critical",
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
          { key: "total", label: "Total in snapshot", value: incidents.length },
        ],
      },
      {
        id: "critical_list",
        title: "Critical Incidents",
        bullets: projections.criticalIncidents.slice(0, 12).map((i) => i.title),
      },
      {
        id: "register",
        title: "Incident Register",
        rows,
      },
      {
        id: "recommendations",
        title: "Recommendations",
        bullets: recommendationBullets(snapshot),
      },
    ],
  };
}
