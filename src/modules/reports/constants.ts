import type {
  ReportPeriodKind,
  ReportPeriodSelection,
  ReportSectionDefinition,
  ReportSectionId,
  ReportTypeDefinition,
  ReportTypeId,
  ReportWizardStep,
  ReportWizardState,
} from "./types";

export const REPORT_WIZARD_STEPS: Array<{
  id: ReportWizardStep;
  label: string;
  number: number;
}> = [
  { id: "type", label: "Report", number: 1 },
  { id: "facilities", label: "Scope", number: 2 },
  { id: "period", label: "Period", number: 3 },
  { id: "sections", label: "Content", number: 4 },
  { id: "generate", label: "Generate", number: 5 },
];

export const REPORT_SECTIONS: ReportSectionDefinition[] = [
  {
    id: "executive_summary",
    title: "Executive Summary",
    description: "Narrative overview of performance and posture.",
  },
  {
    id: "kpi_summary",
    title: "KPI Summary",
    description: "Key performance indicators for the selected scope.",
  },
  {
    id: "operational_performance",
    title: "Operational Performance",
    description: "Workload balance and operational pressure indicators.",
  },
  {
    id: "work_orders",
    title: "Work Orders",
    description: "Open, overdue, and recent work order activity.",
  },
  {
    id: "maintenance",
    title: "Work",
    description: "Backlog, overdue work, and attention items.",
  },
  {
    id: "incidents",
    title: "Legacy Incidents (Historical)",
    description: "Historical incident records for reference and audit.",
  },
  {
    id: "assets",
    title: "Assets",
    description: "Inventory health and condition summary.",
  },
  {
    id: "recommendations",
    title: "Recommendations",
    description: "Suggested actions for the next reporting period.",
  },
  {
    id: "appendix",
    title: "Appendix",
    description: "Supporting registers and data notes.",
  },
];

const ALL_SECTIONS: ReportSectionId[] = REPORT_SECTIONS.map((s) => s.id);

export const REPORT_TYPES: ReportTypeDefinition[] = [
  {
    id: "monthly_operations",
    title: "Monthly Operations",
    description:
      "A complete view of facility performance, maintenance activity, assets, and work completed over the month.",
    includes: [
      "Executive Summary",
      "KPI Trends",
      "Asset Health",
      "Maintenance",
      "Work Orders",
      "Recommendations",
    ],
    audience: ["Client", "Facility Manager"],
    outputs: ["Word", "PDF", "Excel"],
    defaultPeriodKind: "month",
    defaultSections: ALL_SECTIONS,
  },
  {
    id: "weekly_operations",
    title: "Weekly Operations",
    description:
      "A focused operational brief for site reviews, account updates, and immediate priorities.",
    includes: [
      "Executive Summary",
      "KPI Snapshot",
      "Work Orders",
      "Incidents",
      "Operational Pressure",
      "Recommendations",
    ],
    audience: ["Operations", "Account Manager"],
    outputs: ["Word", "PDF", "Excel"],
    defaultPeriodKind: "week",
    defaultSections: [
      "executive_summary",
      "kpi_summary",
      "operational_performance",
      "work_orders",
      "maintenance",
      "recommendations",
    ],
  },
  {
    id: "quarterly_review",
    title: "Quarterly Review",
    description:
      "A strategic review of performance, operational trends, and emerging areas of attention.",
    includes: [
      "Executive Summary",
      "KPI Trends",
      "Operational Performance",
      "Asset Health",
      "Incidents",
      "Recommendations",
    ],
    audience: ["Client", "Management"],
    outputs: ["Word", "PDF", "Excel"],
    defaultPeriodKind: "quarter",
    defaultSections: ALL_SECTIONS,
  },
  {
    id: "incident_report",
    title: "Legacy Incident Report",
    description:
      "A clear record of incidents, severity, contributing factors, and recommended follow-up.",
    includes: [
      "Incident Register",
      "Severity Analysis",
      "Root Causes",
      "Corrective Actions",
      "Recommendations",
    ],
    audience: ["Management", "HSE", "Client"],
    outputs: ["Word", "PDF", "Excel"],
    defaultPeriodKind: "month",
    defaultSections: [
      "executive_summary",
      "kpi_summary",
      "incidents",
      "recommendations",
      "appendix",
    ],
  },
  {
    id: "maintenance_report",
    title: "Maintenance Report",
    description:
      "A practical view of maintenance activity, backlog, overdue work, and asset condition.",
    includes: [
      "Backlog Summary",
      "Overdue Items",
      "Asset Condition",
      "Attention Register",
      "Recommendations",
    ],
    audience: ["Operations", "Facility Manager"],
    outputs: ["Word", "PDF", "Excel"],
    defaultPeriodKind: "month",
    defaultSections: [
      "executive_summary",
      "kpi_summary",
      "maintenance",
      "assets",
      "recommendations",
      "appendix",
    ],
  },
  {
    id: "executive_summary",
    title: "Executive Summary",
    description:
      "A concise management view of performance, risks, key decisions, and what requires attention.",
    includes: [
      "Portfolio KPIs",
      "Operational Health",
      "Key Risks",
      "Executive Highlights",
      "Recommendations",
    ],
    audience: ["Executives", "Client"],
    outputs: ["Word", "PDF"],
    defaultPeriodKind: "month",
    defaultSections: [
      "executive_summary",
      "kpi_summary",
      "recommendations",
    ],
  },
];

export function getReportType(
  id: ReportTypeId
): ReportTypeDefinition | undefined {
  return REPORT_TYPES.find((item) => item.id === id);
}

export function getReportSection(
  id: ReportSectionId
): ReportSectionDefinition | undefined {
  return REPORT_SECTIONS.find((item) => item.id === id);
}

export function defaultYear() {
  return new Date().getFullYear();
}

export function defaultMonth() {
  return new Date().getMonth() + 1;
}

export function defaultQuarter() {
  return Math.floor(new Date().getMonth() / 3) + 1;
}

/** Nearest Sunday on or after today (week ending). */
export function defaultWeekEnding(): string {
  const d = new Date();
  const day = d.getDay();
  const daysUntilSunday = (7 - day) % 7;
  d.setDate(d.getDate() + daysUntilSunday);
  return d.toISOString().slice(0, 10);
}

export function buildPeriodLabel(period: Omit<ReportPeriodSelection, "label">): string {
  if (period.kind === "week" && period.weekEnding) {
    const end = new Date(`${period.weekEnding}T12:00:00`);
    return `Week ending ${end.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })}`;
  }
  if (period.kind === "quarter" && period.quarter) {
    return `Q${period.quarter} ${period.year}`;
  }
  if (period.kind === "year") {
    return `FY ${period.year}`;
  }
  const month = period.month ?? 1;
  return new Date(period.year, month - 1, 1).toLocaleString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

export function buildDefaultPeriod(
  kind: ReportPeriodKind
): ReportPeriodSelection {
  const base = {
    kind,
    year: defaultYear(),
    month: defaultMonth(),
    quarter: defaultQuarter(),
    weekEnding: defaultWeekEnding(),
  };
  return { ...base, label: buildPeriodLabel(base) };
}

export function createInitialWizardState(): ReportWizardState {
  return {
    step: "type",
    reportType: null,
    facilityIds: [],
    allFacilities: true,
    period: buildDefaultPeriod("month"),
    sections: [],
    sectionsBaseline: [],
  };
}

export function defaultSectionsForType(typeId: ReportTypeId): ReportSectionId[] {
  return [...(getReportType(typeId)?.defaultSections ?? [])];
}

/** Ensure older persisted sessions still expose a baseline for reset. */
export function withSectionsBaseline(
  wizard: ReportWizardState
): ReportWizardState {
  if (Array.isArray(wizard.sectionsBaseline) && wizard.sectionsBaseline.length > 0) {
    return wizard;
  }
  const baseline = wizard.reportType
    ? defaultSectionsForType(wizard.reportType)
    : [...wizard.sections];
  return { ...wizard, sectionsBaseline: baseline };
}
