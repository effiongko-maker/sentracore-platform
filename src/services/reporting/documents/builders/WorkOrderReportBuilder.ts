import type { ReportingSnapshot } from "@/services/reporting/types";
import type {
  DocumentBuildContext,
  WorkOrderReportDocument,
} from "../types";
import {
  buildCoverLetter,
  closureRateLabel,
  recommendationBullets,
} from "./shared";

export function buildWorkOrderReportDocument(
  snapshot: ReportingSnapshot,
  context: DocumentBuildContext
): WorkOrderReportDocument {
  const { kpis, workOrders, projections } = snapshot;
  const open = workOrders.filter((w) =>
    ["draft", "open", "assigned", "in_progress", "on_hold"].includes(w.status)
  );
  const closed = workOrders.filter((w) =>
    ["completed", "closed", "cancelled"].includes(w.status)
  );

  const rows = workOrders.slice(0, 100).map((w) => ({
    title: w.title,
    type: w.type,
    priority: w.priority,
    status: w.status,
    // Migrated historical rows have no known raised date (createdAt is the import time).
    createdAt: w.recordOrigin === "migrated_historical" ? "—" : (w.createdAt?.slice(0, 10) ?? "—"),
    dueAt: w.dueAt?.slice(0, 10) ?? "—",
  }));

  const fields = {
    facilityName: context.facilityName ?? "Portfolio",
    reportingPeriod: context.period.label,
    generatedAt: context.generatedAt,
    workOrdersRaised: workOrders.length,
    openWorkOrders: kpis.openWorkOrders,
    overdueWorkOrders: kpis.overdueWorkOrders,
    closureRate: closureRateLabel(snapshot),
    workOrdersDueToday: kpis.workOrdersDueToday,
    workOrdersOnHold: kpis.workOrdersOnHold,
    recommendations: recommendationBullets(snapshot).join(" | "),
  };

  return {
    kind: "work_order",
    title: "Work Order Report",
    subtitle: `${fields.facilityName} — ${context.period.label}`,
    context,
    coverLetter: buildCoverLetter({
      context,
      reportTitle: "Work Order Report",
      highlights: [
        `${workOrders.length} work orders in scope`,
        `Closure rate ${closureRateLabel(snapshot)}`,
      ],
    }),
    fields,
    sections: [
      {
        id: "summary",
        title: "Work Order Summary",
        metrics: [
          { key: "raised", label: "Raised", value: workOrders.length },
          { key: "open", label: "Open", value: open.length },
          { key: "closed", label: "Closed", value: closed.length },
          { key: "overdue", label: "Overdue", value: kpis.overdueWorkOrders },
          { key: "closure", label: "Closure rate", value: fields.closureRate },
        ],
      },
      {
        id: "latest_open",
        title: "Latest Open Work Orders",
        bullets: projections.latestOpenWorkOrders
          .slice(0, 12)
          .map((i) => i.title),
      },
      {
        id: "register",
        title: "Work Order Register",
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
