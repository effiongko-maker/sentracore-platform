import type { DocumentKind } from "@/services/reporting/documents";
import type { ReportLibraryItem } from "./types";

const ALL_OUTPUTS = ["word", "pdf", "excel"] as const;

export const REPORT_LIBRARY: ReportLibraryItem[] = [
  {
    kind: "executive_summary",
    title: "Executive Summary",
    description: "Concise portfolio brief for leadership and client packs.",
    highlights: [
      "Portfolio KPIs",
      "Cross-module health",
      "Risk summary",
      "Recommendations",
    ],
    modules: ["KPIs", "Work Orders", "Maintenance", "Incidents", "Assets"],
    audience: ["Executives", "Client"],
    outputs: [...ALL_OUTPUTS],
    icon: "executive",
    available: true,
  },
  {
    kind: "monthly_facility",
    title: "Monthly Facility Report",
    description: "Full monthly facility pack for client submission.",
    highlights: [
      "Executive summary",
      "Contract performance",
      "Asset health",
      "Issues & risks",
      "Recommendations",
    ],
    modules: ["Work Orders", "Maintenance", "Assets", "KPIs"],
    audience: ["Client", "Facility Manager"],
    outputs: [...ALL_OUTPUTS],
    icon: "monthly",
    available: true,
  },
  {
    kind: "quarterly",
    title: "Quarterly Report",
    description: "Quarterly performance and major asset overview.",
    highlights: [
      "Quarter overview",
      "KPI trends",
      "Major assets",
      "Projects completed",
      "Recommendations",
    ],
    modules: ["Assets", "Work Orders", "KPIs", "Incidents"],
    audience: ["Client", "Management"],
    outputs: [...ALL_OUTPUTS],
    icon: "quarterly",
    available: true,
  },
  {
    kind: "annual",
    title: "Annual Status Report",
    description: "Year-end status, achievements, and lessons learned.",
    highlights: [
      "Annual KPIs",
      "Achievements",
      "Asset health",
      "Operational challenges",
      "Lessons learned",
    ],
    modules: ["KPIs", "Assets", "Facilities", "Workforce"],
    audience: ["Client", "Board", "Management"],
    outputs: [...ALL_OUTPUTS],
    icon: "annual",
    available: true,
  },
  {
    kind: "maintenance",
    title: "Maintenance Report",
    description: "Backlog and maintenance register for operational review.",
    highlights: [
      "Backlog summary",
      "Overdue items",
      "Attention list",
      "Maintenance register",
    ],
    modules: ["Maintenance", "KPIs"],
    audience: ["Operations", "Facility Manager"],
    outputs: [...ALL_OUTPUTS],
    icon: "maintenance",
    available: true,
  },
  {
    kind: "work_order",
    title: "Work Order Report",
    description: "Work volume, closure rate, and open work register.",
    highlights: [
      "Raised / open / closed",
      "Closure rate",
      "Latest open work",
      "Work order register",
    ],
    modules: ["Work Orders", "KPIs"],
    audience: ["Operations", "Client"],
    outputs: [...ALL_OUTPUTS],
    icon: "work_order",
    available: true,
  },
  {
    kind: "incident",
    title: "Incident Report",
    description: "Critical incidents and severity posture for escalation packs.",
    highlights: [
      "Critical incidents",
      "Unassigned items",
      "Incident register",
      "Recommendations",
    ],
    modules: ["Incidents", "KPIs"],
    audience: ["Management", "HSE", "Client"],
    outputs: [...ALL_OUTPUTS],
    icon: "incident",
    available: true,
  },
  {
    kind: "asset",
    title: "Asset Report",
    description: "Asset inventory, availability, and condition register.",
    highlights: [
      "Asset counts",
      "Operational status",
      "Condition summary",
      "Asset register",
    ],
    modules: ["Assets", "KPIs"],
    audience: ["Asset Manager", "Client"],
    outputs: [...ALL_OUTPUTS],
    icon: "asset",
    available: true,
  },
];

export const OUTPUT_FORMATS = [
  { value: "word" as const, label: "Word" },
  { value: "pdf" as const, label: "PDF" },
  { value: "excel" as const, label: "Excel" },
];

export function defaultYear() {
  return new Date().getFullYear();
}

export function defaultMonth() {
  return new Date().getMonth() + 1;
}

export function defaultQuarter() {
  return Math.floor(new Date().getMonth() / 3) + 1;
}

export function periodKindForDocument(
  kind: DocumentKind
): "month" | "quarter" | "year" {
  if (kind === "monthly_facility") return "month";
  if (kind === "quarterly") return "quarter";
  if (kind === "annual") return "year";
  return "month";
}

export function getLibraryItem(kind: DocumentKind): ReportLibraryItem | undefined {
  return REPORT_LIBRARY.find((item) => item.kind === kind);
}
