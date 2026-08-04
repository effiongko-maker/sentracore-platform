import type { ReportingSnapshot } from "@/services/reporting/types";
import type {
  CoverLetterContent,
  DocumentBuildContext,
  DocumentPeriod,
} from "../types";

export function facilityLabel(
  snapshot: ReportingSnapshot,
  facilityId?: string
): string {
  if (!facilityId) {
    if (snapshot.facilities.length === 1) return snapshot.facilities[0].name;
    return "Portfolio";
  }
  return (
    snapshot.facilities.find((f) => f.id === facilityId)?.name ?? facilityId
  );
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value}%`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return String(value);
}

export function periodLabel(period: DocumentPeriod): string {
  if (period.label) return period.label;
  if (period.kind === "month" && period.month && period.year) {
    const name = new Date(period.year, period.month - 1, 1).toLocaleString(
      "en-GB",
      { month: "long", year: "numeric" }
    );
    return name;
  }
  if (period.kind === "quarter" && period.quarter && period.year) {
    return `Q${period.quarter} ${period.year}`;
  }
  if (period.kind === "year" && period.year) {
    return `FY ${period.year}`;
  }
  return "Current period";
}

export function buildCoverLetter(input: {
  context: DocumentBuildContext;
  reportTitle: string;
  highlights: string[];
}): CoverLetterContent {
  const facility = input.context.facilityName ?? "the estate";
  const period = input.context.period.label;
  const lines = input.highlights.filter(Boolean).slice(0, 4);

  return {
    subject: `${input.reportTitle} — ${facility} (${period})`,
    salutation: "Dear Client,",
    body: [
      `Please find enclosed the ${input.reportTitle.toLowerCase()} for ${facility} covering ${period}.`,
      lines.length
        ? `Key points in this period:\n${lines.map((l) => `• ${l}`).join("\n")}`
        : "This report summarises operational performance, asset health, and recommended actions.",
      "We remain available to discuss any items requiring further attention.",
    ].join("\n\n"),
    closing: "Yours sincerely,",
    signatory: input.context.generatedBy ?? "SentraCore Facilities Team",
  };
}

export function riskBullets(snapshot: ReportingSnapshot): string[] {
  const bullets: string[] = [];
  const { kpis, projections, health } = snapshot;

  if (health.band === "critical") {
    bullets.push(`Operational health is critical (score ${health.score}).`);
  } else if (health.band === "watch") {
    bullets.push(`Operational health is on watch (score ${health.score}).`);
  }

  if (kpis.criticalIncidents > 0) {
    bullets.push(
      `${kpis.criticalIncidents} critical incident(s) require ongoing attention.`
    );
  }
  if (kpis.overdueWorkOrders > 0) {
    bullets.push(`${kpis.overdueWorkOrders} work order(s) are overdue.`);
  }
  if (kpis.overdueMaintenance > 0) {
    bullets.push(`${kpis.overdueMaintenance} maintenance item(s) are overdue.`);
  }
  if (kpis.assetsInPoorCondition > 0) {
    bullets.push(
      `${kpis.assetsInPoorCondition} asset(s) are in poor condition.`
    );
  }

  for (const item of projections.blockedItems.slice(0, 3)) {
    bullets.push(`${item.title}${item.meta ? ` — ${item.meta}` : ""}`);
  }

  return bullets.length
    ? bullets
    : ["No major risks identified in the current reporting snapshot."];
}

export function recommendationBullets(snapshot: ReportingSnapshot): string[] {
  const { kpis, health } = snapshot;
  const out: string[] = [];

  if (kpis.criticalIncidentsUnassigned > 0) {
    out.push("Assign owners to all unassigned critical incidents.");
  }
  if (kpis.overdueWorkOrders > 0) {
    out.push("Clear overdue work orders and reconfirm SLA dates.");
  }
  if (kpis.maintenanceBacklog > 5) {
    out.push("Prioritise maintenance backlog reduction for high-criticality assets.");
  }
  if (kpis.assetsInPoorCondition > 0) {
    out.push("Schedule condition assessments for poor-condition assets.");
  }
  if (health.band !== "healthy") {
    out.push("Review operational health drivers with the facility management team.");
  }
  if (kpis.incidentsNeedingWorkOrder > 0) {
    out.push("Raise work orders for incidents still requiring corrective action.");
  }

  return out.length
    ? out
    : [
        "Maintain current operating cadence and continue monitoring KPIs next period.",
      ];
}

export function listTitles(
  items: Array<{ title: string }>,
  limit = 8
): string[] {
  if (!items.length) return ["None recorded in this snapshot."];
  return items.slice(0, limit).map((item) => item.title);
}

export function closureRate(snapshot: ReportingSnapshot): number {
  const total = snapshot.workOrders.length;
  if (!total) return 0;
  const closed = snapshot.workOrders.filter((w) =>
    ["completed", "closed", "cancelled"].includes(w.status)
  ).length;
  return Math.round((closed / total) * 100);
}
