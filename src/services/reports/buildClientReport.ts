import {
  isActiveEntityStatus,
  isOperationalAssetStatus,
} from "@/services/reporting/normalize";
import {
  computeReportingHealth,
  computeReportingKpis,
} from "@/services/reporting/kpis";
import { computeReportingProjections } from "@/services/reporting/projections";
import type { ReportingSnapshot } from "@/services/reporting/types";
import { getReportType } from "@/modules/reports/constants";
import type {
  ClientReportDocument,
  ReportChartBar,
  ReportKpiMetric,
  ReportSectionId,
  ReportTable,
  ReportTypeId,
  ReportWizardState,
} from "@/modules/reports/types";

function rowMatchesFacility(
  row: { facilityId?: string; facility?: string },
  selected: Set<string>
): boolean {
  if (row.facilityId && selected.has(row.facilityId)) return true;
  if (row.facility && selected.has(row.facility)) return true;
  return false;
}

function scopeSnapshot(
  snapshot: ReportingSnapshot,
  facilityIds: string[],
  allFacilities: boolean
): ReportingSnapshot {
  if (allFacilities || facilityIds.length === 0) {
    return snapshot;
  }

  const selected = new Set(facilityIds);
  const facilities = snapshot.facilities.filter((f) => selected.has(f.id));
  const assets = snapshot.assets.filter((a) =>
    rowMatchesFacility(a, selected)
  );
  const incidents = snapshot.incidents.filter((i) =>
    rowMatchesFacility(i, selected)
  );
  const maintenance = snapshot.maintenance.filter((m) =>
    rowMatchesFacility(m, selected)
  );
  const workOrders = snapshot.workOrders.filter((w) =>
    rowMatchesFacility(w, selected)
  );

  const kpis = computeReportingKpis({
    asOf: snapshot.asOf,
    facilities,
    assets,
    incidents,
    maintenance,
    workOrders,
    users: snapshot.users,
  });
  const projections = computeReportingProjections({
    asOf: snapshot.asOf,
    incidents,
    maintenance,
    workOrders,
  });
  const health = computeReportingHealth(kpis);

  return {
    ...snapshot,
    facilityId: facilityIds.length === 1 ? facilityIds[0] : undefined,
    facilities,
    assets,
    incidents,
    maintenance,
    workOrders,
    kpis,
    projections,
    health,
  };
}

function resolveFacilityLabel(
  scoped: ReportingSnapshot,
  allFacilities: boolean,
  facilityIds: string[]
): { label: string; names: string[] } {
  if (allFacilities || facilityIds.length === 0) {
    if (scoped.facilities.length === 1) {
      return {
        label: scoped.facilities[0].name,
        names: [scoped.facilities[0].name],
      };
    }
    return {
      label: "Portfolio",
      names: scoped.facilities.map((f) => f.name).filter(Boolean),
    };
  }
  const names = scoped.facilities
    .filter((f) => facilityIds.includes(f.id))
    .map((f) => f.name);
  if (names.length === 1) return { label: names[0], names };
  if (names.length <= 3) return { label: names.join(", "), names };
  return {
    label: `${names.length} facilities`,
    names,
  };
}

function assetFacilityName(
  scoped: ReportingSnapshot,
  asset: ReportingSnapshot["assets"][number]
): string {
  const byId = scoped.facilities.find((f) => f.id === asset.facility)?.name;
  if (byId) return byId;
  return asset.facility || "—";
}

function closureRate(scoped: ReportingSnapshot): number {
  const total = scoped.workOrders.length;
  if (!total) return 0;
  const closed = scoped.workOrders.filter((w) =>
    ["completed", "closed", "cancelled"].includes(
      String(w.status || "").toLowerCase()
    )
  ).length;
  return Math.round((closed / total) * 100);
}

function riskBullets(scoped: ReportingSnapshot): string[] {
  const { kpis, projections, health } = scoped;
  const bullets: string[] = [];

  if (health.band === "critical") {
    bullets.push(
      `Operational health is critical (score ${health.score}/100).`
    );
  } else if (health.band === "watch") {
    bullets.push(`Operational health is on watch (score ${health.score}/100).`);
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
      `${kpis.assetsInPoorCondition} asset(s) are recorded in poor condition.`
    );
  }

  for (const item of projections.blockedItems.slice(0, 3)) {
    bullets.push(`${item.title}${item.meta ? ` — ${item.meta}` : ""}`);
  }

  return bullets.length
    ? bullets
    : ["No major risks identified in the current reporting snapshot."];
}

function recommendationBullets(scoped: ReportingSnapshot): string[] {
  const { kpis, health } = scoped;
  const out: string[] = [];

  if (kpis.criticalIncidentsUnassigned > 0) {
    out.push("Assign owners to all unassigned critical incidents.");
  }
  if (kpis.overdueWorkOrders > 0) {
    out.push("Clear overdue work orders and reconfirm SLA commitment dates.");
  }
  if (kpis.maintenanceBacklog > 5) {
    out.push(
      "Prioritise maintenance backlog reduction for high-criticality assets."
    );
  }
  if (kpis.assetsInPoorCondition > 0) {
    out.push("Schedule condition assessments for poor-condition assets.");
  }
  if (health.band !== "healthy") {
    out.push(
      "Review operational health drivers with the facility management team."
    );
  }
  if (kpis.incidentsNeedingWorkOrder > 0) {
    out.push(
      "Raise work orders for incidents still requiring corrective action."
    );
  }

  return out.length
    ? out
    : [
        "Maintain current operating cadence and continue monitoring KPIs next period.",
      ];
}

function highlightBullets(
  scoped: ReportingSnapshot,
  reportType: ReportTypeId
): string[] {
  const { kpis } = scoped;

  if (reportType === "incident_report") {
    return [
      `${kpis.criticalIncidents} critical open incident(s).`,
      `${kpis.criticalIncidentsUnassigned} unassigned critical incident(s).`,
      `${kpis.incidentsNeedingWorkOrder} incident(s) still require a work order.`,
    ];
  }
  if (reportType === "maintenance_report") {
    return [
      `${kpis.maintenanceBacklog} item(s) in the maintenance backlog.`,
      `${kpis.overdueMaintenance} overdue maintenance item(s).`,
      `${kpis.assetsInPoorCondition} asset(s) in poor condition.`,
    ];
  }

  return [
    `Operational health score: ${scoped.health.score}/100 (${scoped.health.band}).`,
    `${kpis.openWorkOrders} open work order(s); ${kpis.overdueWorkOrders} overdue.`,
    `${kpis.maintenanceBacklog} maintenance backlog item(s); ${kpis.overdueMaintenance} overdue.`,
    `${kpis.criticalIncidents} critical open incident(s).`,
  ];
}

function overviewNarrative(
  scoped: ReportingSnapshot,
  typeTitle: string,
  facility: string,
  periodLabel: string
): string {
  const band =
    scoped.health.band === "healthy"
      ? "stable"
      : scoped.health.band === "watch"
        ? "under watch"
        : "under elevated pressure";

  return (
    `This ${typeTitle.toLowerCase()} presents the operating position for ${facility} ` +
    `covering ${periodLabel}. Based on the latest Reporting Snapshot, overall health is ${band} ` +
    `with a score of ${scoped.health.score} out of 100. ` +
    `The sections that follow summarise key performance indicators, operational workload, ` +
    `and recommended actions for client review.`
  );
}

function metric(
  id: string,
  label: string,
  value: string | number,
  detail?: string
): ReportKpiMetric {
  return { id, label, value: String(value), detail };
}

function listTable(
  headers: string[],
  rows: Array<{ id: string; cells: string[] }>,
  emptyMessage: string
): ReportTable {
  return { headers, rows, emptyMessage };
}

function projectionRows(
  items: ReportingSnapshot["projections"]["latestOpenWorkOrders"]
): ReportTable["rows"] {
  return items.slice(0, 12).map((item) => ({
    id: item.entityId,
    cells: [
      item.title,
      item.status ?? "—",
      item.priority ?? "—",
      item.meta ?? "—",
    ],
  }));
}

function operationalBars(scoped: ReportingSnapshot): ReportChartBar[] {
  const { kpis } = scoped;
  const values = [
    {
      label: "Open work orders",
      value: kpis.openWorkOrders,
      tone: "neutral" as const,
    },
    {
      label: "Overdue work orders",
      value: kpis.overdueWorkOrders,
      tone: "danger" as const,
    },
    {
      label: "Maintenance backlog",
      value: kpis.maintenanceBacklog,
      tone: "warning" as const,
    },
    {
      label: "Overdue maintenance",
      value: kpis.overdueMaintenance,
      tone: "danger" as const,
    },
    {
      label: "Critical incidents",
      value: kpis.criticalIncidents,
      tone: "danger" as const,
    },
    {
      label: "Assets in poor condition",
      value: kpis.assetsInPoorCondition,
      tone: "warning" as const,
    },
  ];
  const max = Math.max(1, ...values.map((v) => v.value));
  return values.map((v) => ({ ...v, max }));
}

function statusCounts(
  items: Array<{ status?: string }>
): Array<{ label: string; value: number }> {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = String(item.status || "Unknown").trim() || "Unknown";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, value]) => ({ label, value }));
}

export function buildClientReport(input: {
  snapshot: ReportingSnapshot;
  wizard: ReportWizardState;
}): ClientReportDocument {
  const { wizard } = input;
  if (!wizard.reportType) {
    throw new Error("Report type is required to build a client report.");
  }

  const reportType = wizard.reportType;
  const typeDef = getReportType(reportType);
  if (!typeDef) {
    throw new Error(`Unknown report type: ${reportType}`);
  }

  const scoped = scopeSnapshot(
    input.snapshot,
    wizard.facilityIds,
    wizard.allFacilities
  );
  const { label: facilityLabelText, names: facilityNames } = resolveFacilityLabel(
    scoped,
    wizard.allFacilities,
    wizard.facilityIds
  );
  const { kpis, projections } = scoped;
  const rate = closureRate(scoped);
  const openIncidents = scoped.incidents.filter(
    (i) =>
      !["closed", "resolved", "cancelled"].includes(
        String(i.status || "").toLowerCase()
      )
  );

  const sections: ReportSectionId[] = [...wizard.sections];
  const woStatus = statusCounts(scoped.workOrders);
  const woStatusMax = Math.max(1, ...woStatus.map((s) => s.value), 1);

  return {
    id: `RPT-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
    reportType,
    title: typeDef.title,
    subtitle: `${facilityLabelText} · ${wizard.period.label}`,
    generatedAt: new Date().toISOString(),
    generatedBy: "SentraCore Facilities Team",
    periodLabel: wizard.period.label,
    facilityLabel: facilityLabelText,
    facilityNames,
    asOf: scoped.asOf,
    healthBand: scoped.health.band,
    healthScore: scoped.health.score,
    sections,
    cover: {
      preparedFor: facilityLabelText,
      preparedBy: "SentraCore Facilities Team",
      confidentiality: "Confidential — for client use only",
    },
    executiveSummary: {
      overview: overviewNarrative(
        scoped,
        typeDef.title,
        facilityLabelText,
        wizard.period.label
      ),
      highlights: highlightBullets(scoped, reportType),
      risks: riskBullets(scoped),
    },
    kpiSummary: [
      metric(
        "health",
        "Health score",
        `${scoped.health.score}/100`,
        scoped.health.band
      ),
      metric(
        "facilities",
        "Facilities in scope",
        kpis.totalFacilities,
        `${kpis.activeFacilities} active`
      ),
      metric(
        "open_wo",
        "Open work orders",
        kpis.openWorkOrders,
        `${kpis.overdueWorkOrders} overdue`
      ),
      metric(
        "backlog",
        "Maintenance backlog",
        kpis.maintenanceBacklog,
        `${kpis.overdueMaintenance} overdue`
      ),
      metric(
        "critical",
        "Critical incidents",
        kpis.criticalIncidents,
        `${kpis.criticalIncidentsUnassigned} unassigned`
      ),
      metric(
        "assets",
        "Assets operational",
        kpis.assetsOperationalPercent != null
          ? `${kpis.assetsOperationalPercent}%`
          : "—",
        `${kpis.activeAssets} of ${kpis.totalAssets}`
      ),
      metric(
        "workforce",
        "Active workforce",
        kpis.activeWorkforce,
        `${kpis.totalUsers} total users`
      ),
      metric(
        "closure",
        "Work order closure rate",
        `${rate}%`,
        "Closed / cancelled of recorded WOs"
      ),
    ],
    operationalPerformance: {
      narrative:
        `Workload indicators for ${facilityLabelText} show ${kpis.openWorkOrders} open work order(s) ` +
        `and a maintenance backlog of ${kpis.maintenanceBacklog}. ` +
        (kpis.overdueWorkOrders + kpis.overdueMaintenance > 0
          ? `Overdue pressure currently totals ${
              kpis.overdueWorkOrders + kpis.overdueMaintenance
            } item(s).`
          : "No overdue work orders or maintenance items are currently recorded."),
      bars: [
        ...operationalBars(scoped),
        ...woStatus.map((s) => ({
          label: `WO · ${s.label}`,
          value: s.value,
          max: woStatusMax,
          tone: "neutral" as const,
        })),
      ].slice(0, 10),
    },
    workOrders: {
      narrative:
        `${kpis.openWorkOrders} work order(s) remain open, with ${kpis.workOrdersDueToday} due today ` +
        `and ${kpis.workOrdersOnHold} on hold. Closure rate across recorded work orders is ${rate}%.`,
      metrics: [
        metric("open", "Open", kpis.openWorkOrders),
        metric("overdue", "Overdue", kpis.overdueWorkOrders),
        metric("due_today", "Due today", kpis.workOrdersDueToday),
        metric("on_hold", "On hold", kpis.workOrdersOnHold),
        metric("created_today", "Created today", kpis.workOrdersCreatedToday),
        metric("closure", "Closure rate", `${rate}%`),
      ],
      table: listTable(
        ["Work order", "Status", "Priority", "Notes"],
        projectionRows(projections.latestOpenWorkOrders),
        "No open work orders in the current snapshot."
      ),
    },
    maintenance: {
      narrative:
        `The maintenance backlog stands at ${kpis.maintenanceBacklog} item(s), ` +
        `including ${kpis.overdueMaintenance} overdue and ${kpis.maintenanceOnHold} on hold.`,
      metrics: [
        metric("backlog", "Backlog", kpis.maintenanceBacklog),
        metric("overdue", "Overdue", kpis.overdueMaintenance),
        metric("on_hold", "On hold", kpis.maintenanceOnHold),
        metric(
          "attention",
          "Attention items",
          projections.maintenanceAttention.length
        ),
      ],
      table: listTable(
        ["Maintenance item", "Status", "Priority", "Notes"],
        projectionRows(projections.maintenanceAttention),
        "No maintenance attention items in the current snapshot."
      ),
    },
    incidents: {
      narrative:
        `${kpis.criticalIncidents} critical incident(s) are open. ` +
        `${kpis.criticalIncidentsUnassigned} remain unassigned and ` +
        `${kpis.incidentsNeedingWorkOrder} still require a work order.`,
      metrics: [
        metric("critical", "Critical open", kpis.criticalIncidents),
        metric(
          "unassigned",
          "Unassigned critical",
          kpis.criticalIncidentsUnassigned
        ),
        metric("needs_wo", "Needs work order", kpis.incidentsNeedingWorkOrder),
        metric("open_total", "Open incidents (all)", openIncidents.length),
      ],
      table: listTable(
        ["Incident", "Status", "Severity", "Notes"],
        projectionRows(projections.criticalIncidents),
        "No critical incidents in the current snapshot."
      ),
    },
    assets: {
      narrative:
        `${kpis.totalAssets} asset(s) are in scope, of which ${kpis.activeAssets} are operational` +
        (kpis.assetsOperationalPercent != null
          ? ` (${kpis.assetsOperationalPercent}%).`
          : ".") +
        ` ${kpis.assetsInPoorCondition} asset(s) are recorded in poor condition.`,
      metrics: [
        metric("total", "Total assets", kpis.totalAssets),
        metric("active", "Operational", kpis.activeAssets),
        metric(
          "pct",
          "Operational %",
          kpis.assetsOperationalPercent != null
            ? `${kpis.assetsOperationalPercent}%`
            : "—"
        ),
        metric("poor", "Poor condition", kpis.assetsInPoorCondition),
      ],
      table: listTable(
        ["Asset", "Status", "Condition", "Facility"],
        scoped.assets.slice(0, 12).map((asset) => ({
          id: asset.id,
          cells: [
            asset.name || asset.id,
            asset.status || "—",
            asset.condition || "—",
            assetFacilityName(scoped, asset),
          ],
        })),
        "No assets in the current snapshot."
      ),
    },
    recommendations: recommendationBullets(scoped),
    appendix: {
      dataNotes: [
        "Figures are derived exclusively from the current Reporting Snapshot.",
        `Snapshot as of ${new Date(scoped.asOf).toLocaleString("en-GB")}.`,
        "Period selection labels the report for client delivery; entity registers reflect the latest available snapshot state.",
        scoped._snapshotMeta
          ? `Snapshot source: ${scoped._snapshotMeta.source}; version ${scoped._snapshotMeta.snapshotVersion}.`
          : "Snapshot metadata was not supplied by the data source.",
        `Facilities in scope: ${
          facilityNames.length ? facilityNames.join("; ") : facilityLabelText
        }.`,
      ],
      registers: [
        {
          title: "Overdue work orders",
          table: listTable(
            ["Item", "Status", "Priority", "Notes"],
            projectionRows(projections.overdueWorkOrders),
            "None recorded."
          ),
        },
        {
          title: "Blocked / on-hold items",
          table: listTable(
            ["Item", "Status", "Priority", "Notes"],
            projectionRows(projections.blockedItems),
            "None recorded."
          ),
        },
        {
          title: "Active facilities",
          table: listTable(
            ["Facility", "Status", "Code", "Location"],
            scoped.facilities
              .filter((f) => isActiveEntityStatus(f.status))
              .slice(0, 20)
              .map((f) => ({
                id: f.id,
                cells: [f.name, f.status || "—", f.code || "—", f.location || "—"],
              })),
            "No active facilities in scope."
          ),
        },
        {
          title: "Operational assets sample",
          table: listTable(
            ["Asset", "Status", "Condition", "Facility"],
            scoped.assets
              .filter((a) => isOperationalAssetStatus(a.status))
              .slice(0, 15)
              .map((asset) => ({
                id: asset.id,
                cells: [
                  asset.name || asset.id,
                  asset.status || "—",
                  asset.condition || "—",
                  assetFacilityName(scoped, asset),
                ],
              })),
            "No operational assets in scope."
          ),
        },
      ],
    },
  };
}
