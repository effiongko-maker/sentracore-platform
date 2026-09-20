import type {
  ClientReportDocument,
  ReportKpiMetric,
  ReportTable,
} from "@/modules/reports/types";

/**
 * FAILURE IS NOT ZERO for generated reports.
 *
 * ReportingService records which authoritative sources could not be read
 * (`unavailableSources`). KPIs computed from a failed source are meaningless
 * zeros, so this pass removes every figure that depends on such a source and
 * discloses the gap. A healthy empty source is untouched (zero is data).
 * The result feeds preview, Word and PDF alike — one document, one disclosure.
 */

export type ReportSourceKey =
  | "users"
  | "facilities"
  | "maintenance"
  | "incidents"
  | "workOrders"
  | "assets";

export const REPORT_SOURCE_LABELS: Record<ReportSourceKey, string> = {
  users: "People",
  facilities: "Facility",
  maintenance: "Work",
  incidents: "Incident",
  workOrders: "Work Instruction",
  assets: "Asset",
};

export const UNAVAILABLE_VALUE = "Unavailable";
const UNAVAILABLE_TABLE = "Unavailable — this source could not be read.";

const KPI_SOURCES: Record<string, ReportSourceKey[]> = {
  facilities: ["facilities"],
  open_wo: ["workOrders"],
  backlog: ["maintenance"],
  critical: ["maintenance"],
  assets: ["assets"],
  workforce: ["users"],
  closure: ["workOrders"],
};

const BAR_SOURCES: Array<[string, ReportSourceKey]> = [
  ["Open work orders", "workOrders"],
  ["Overdue work orders", "workOrders"],
  ["WO ·", "workOrders"],
  ["Maintenance backlog", "maintenance"],
  ["Overdue maintenance", "maintenance"],
  ["Critical work", "maintenance"],
  ["Assets in poor condition", "assets"],
];

const REGISTER_SOURCES: Record<string, ReportSourceKey[]> = {
  "Overdue work orders": ["workOrders"],
  "Blocked / on-hold items": ["maintenance", "workOrders"],
  "Active facilities": ["facilities"],
  "Operational assets sample": ["assets"],
};

function maskMetrics(
  metrics: ReportKpiMetric[],
  down: boolean
): ReportKpiMetric[] {
  if (!down) return metrics;
  return metrics.map((metric) => ({
    ...metric,
    value: UNAVAILABLE_VALUE,
    detail: "Source data unavailable",
  }));
}

function maskTable(table: ReportTable, down: boolean): ReportTable {
  if (!down) return table;
  return { ...table, rows: [], emptyMessage: UNAVAILABLE_TABLE };
}

function sectionNote(label: string): string {
  return `${label} data was unavailable when this report was generated, so no figures are stated for this section.`;
}

export function maskUnavailableSources(
  doc: ClientReportDocument,
  unavailableKeys: ReadonlyArray<string>
): ClientReportDocument {
  const keys = unavailableKeys.filter((key): key is ReportSourceKey =>
    Object.prototype.hasOwnProperty.call(REPORT_SOURCE_LABELS, key)
  );
  const unavailable = keys.map((key) => ({
    key,
    label: REPORT_SOURCE_LABELS[key],
  }));
  const dataAvailability = { complete: keys.length === 0, unavailable };
  if (keys.length === 0) return { ...doc, dataAvailability };

  const down = (...sources: ReportSourceKey[]) =>
    sources.some((source) => keys.includes(source));
  const labels = unavailable.map((item) => item.label).join(", ");
  const disclosure = `Data from ${labels} could not be read when this report was generated. Figures that depend on it are not stated, and the report is incomplete.`;

  return {
    ...doc,
    dataAvailability,
    executiveSummary: {
      overview: `${doc.title} for ${doc.facilityLabel} (${doc.periodLabel}). ${disclosure}`,
      highlights: [],
      risks: [disclosure],
    },
    kpiSummary: doc.kpiSummary.map((metric) => {
      if (metric.id === "health") {
        return {
          ...metric,
          value: "Incomplete",
          detail: "Some sources unavailable",
        };
      }
      const deps = KPI_SOURCES[metric.id];
      return deps && down(...deps)
        ? { ...metric, value: UNAVAILABLE_VALUE, detail: "Source data unavailable" }
        : metric;
    }),
    operationalPerformance: {
      narrative: down("workOrders", "maintenance")
        ? sectionNote(
            unavailable
              .filter((item) => item.key === "workOrders" || item.key === "maintenance")
              .map((item) => item.label)
              .join(" and ")
          )
        : doc.operationalPerformance.narrative,
      bars: doc.operationalPerformance.bars.filter((bar) => {
        const match = BAR_SOURCES.find(([prefix]) => bar.label.startsWith(prefix));
        return !(match && down(match[1]));
      }),
    },
    workOrders: {
      narrative: down("workOrders")
        ? sectionNote("Work Instruction")
        : doc.workOrders.narrative,
      metrics: maskMetrics(doc.workOrders.metrics, down("workOrders")),
      table: maskTable(doc.workOrders.table, down("workOrders")),
    },
    maintenance: {
      narrative: down("maintenance")
        ? sectionNote("Work")
        : doc.maintenance.narrative,
      metrics: maskMetrics(doc.maintenance.metrics, down("maintenance")),
      table: maskTable(doc.maintenance.table, down("maintenance")),
    },
    incidents: {
      narrative: down("incidents")
        ? sectionNote("Incident")
        : doc.incidents.narrative,
      metrics: maskMetrics(doc.incidents.metrics, down("incidents")),
      table: maskTable(doc.incidents.table, down("incidents")),
    },
    assets: {
      narrative: down("assets") ? sectionNote("Asset") : doc.assets.narrative,
      metrics: maskMetrics(doc.assets.metrics, down("assets")),
      table: maskTable(doc.assets.table, down("assets")),
    },
    recommendations: [
      "Restore access to the unavailable sources and regenerate this report.",
    ],
    appendix: {
      dataNotes: [disclosure, ...doc.appendix.dataNotes],
      registers: doc.appendix.registers.map((register) => {
        const deps = REGISTER_SOURCES[register.title];
        return deps && down(...deps)
          ? { ...register, table: maskTable(register.table, true) }
          : register;
      }),
    },
  };
}
