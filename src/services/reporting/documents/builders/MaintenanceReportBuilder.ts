import type { ReportingSnapshot } from "@/services/reporting/types";
import type {
  DocumentBuildContext,
  MaintenanceReportDocument,
} from "../types";
import {
  buildCoverLetter,
  recommendationBullets,
  riskBullets,
} from "./shared";

export function buildMaintenanceReportDocument(
  snapshot: ReportingSnapshot,
  context: DocumentBuildContext
): MaintenanceReportDocument {
  const { kpis, maintenance, projections } = snapshot;

  const rows = maintenance.slice(0, 100).map((m) => ({
    title: m.title,
    type: m.type,
    priority: m.priority,
    status: m.status,
    reportedAt: m.reportedAt?.slice(0, 10) ?? "—",
    dueAt: m.dueAt?.slice(0, 10) ?? "—",
  }));

  const fields = {
    facilityName: context.facilityName ?? "Portfolio",
    reportingPeriod: context.period.label,
    generatedAt: context.generatedAt,
    maintenanceBacklog: kpis.maintenanceBacklog,
    overdueMaintenance: kpis.overdueMaintenance,
    maintenanceOnHold: kpis.maintenanceOnHold,
    totalRequests: maintenance.length,
    majorRisks: riskBullets(snapshot).join(" | "),
    recommendations: recommendationBullets(snapshot).join(" | "),
  };

  return {
    kind: "maintenance",
    title: "Maintenance Report",
    subtitle: `${fields.facilityName} — ${context.period.label}`,
    context,
    coverLetter: buildCoverLetter({
      context,
      reportTitle: "Maintenance Report",
      highlights: [
        `Backlog ${kpis.maintenanceBacklog}`,
        `${kpis.overdueMaintenance} overdue`,
      ],
    }),
    fields,
    sections: [
      {
        id: "summary",
        title: "Maintenance Summary",
        metrics: [
          {
            key: "backlog",
            label: "Backlog",
            value: kpis.maintenanceBacklog,
          },
          {
            key: "overdue",
            label: "Overdue",
            value: kpis.overdueMaintenance,
          },
          { key: "on_hold", label: "On hold", value: kpis.maintenanceOnHold },
          { key: "total", label: "Requests in snapshot", value: maintenance.length },
        ],
      },
      {
        id: "attention",
        title: "Attention Items",
        bullets: projections.maintenanceAttention
          .slice(0, 12)
          .map((i) => i.title),
      },
      {
        id: "register",
        title: "Maintenance Register",
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
