import type {
  EccReportConfig,
  EccReportSectionDefinition,
  EccReportSectionId,
  EccReportTypeDefinition,
  EccReportTypeId,
  EccReportWizardState,
  EccReportWizardStep,
} from "./types";

export const ECC_REPORT_WIZARD_STEPS: Array<{
  id: EccReportWizardStep;
  label: string;
  number: number;
}> = [
  { id: "type", label: "Report", number: 1 },
  { id: "centre", label: "Scope", number: 2 },
  { id: "period", label: "Period", number: 3 },
  { id: "sections", label: "Content", number: 4 },
  { id: "generate", label: "Generate", number: 5 },
];

/** Sections backed by live ECC Daily Ops / Issues / Requests data. */
export const ECC_REPORT_SECTIONS: EccReportSectionDefinition[] = [
  {
    id: "executive_summary",
    title: "Executive Summary",
    description: "Overview of centre posture, highlights, and attention areas.",
  },
  {
    id: "key_metrics",
    title: "Key Metrics",
    description: "Submission counts, open issues, requests, and escalations.",
  },
  {
    id: "daily_operations",
    title: "Daily Operations",
    description: "Daily Ops submissions and status history for the period.",
  },
  {
    id: "centre_performance",
    title: "Centre Performance",
    description: "Centre, facility, technical, and staffing performance blocks.",
  },
  {
    id: "call_activity",
    title: "Call Activity",
    description: "Recorded call metrics from Daily Ops submissions.",
  },
  {
    id: "issues",
    title: "Issues",
    description: "Open and recent ECC issues relevant to the reporting window.",
  },
  {
    id: "requests",
    title: "Requests",
    description: "Open and recent ECC requests relevant to the reporting window.",
  },
  {
    id: "recommendations",
    title: "Recommendations",
    description: "Suggested follow-up derived from current operational signals.",
  },
  {
    id: "appendix",
    title: "Appendix",
    description: "Supporting notes and detailed registers.",
  },
];

const ALL_SECTIONS: EccReportSectionId[] = ECC_REPORT_SECTIONS.map((s) => s.id);

export const ECC_REPORT_TYPES: EccReportTypeDefinition[] = [
  {
    id: "daily",
    title: "Daily Report",
    description:
      "Point-in-time operational brief for the current reporting day.",
    includes: [
      "Executive Summary",
      "Key Metrics",
      "Daily Operations",
      "Issues",
      "Requests",
    ],
    audience: ["ECC Managers", "Operations"],
    outputs: ["Word"],
    defaultPeriodDays: 1,
    defaultSections: [
      "executive_summary",
      "key_metrics",
      "daily_operations",
      "issues",
      "requests",
      "recommendations",
    ],
  },
  {
    id: "weekly",
    title: "Weekly Report",
    description:
      "Operational summary for the selected week — submissions, issues, and requests.",
    includes: [
      "Executive Summary",
      "Key Metrics",
      "Daily Operations",
      "Centre Performance",
      "Issues",
      "Requests",
      "Recommendations",
    ],
    audience: ["ECC Managers", "Account Managers"],
    outputs: ["Word"],
    defaultPeriodDays: 7,
    defaultSections: [
      "executive_summary",
      "key_metrics",
      "daily_operations",
      "centre_performance",
      "issues",
      "requests",
      "recommendations",
    ],
  },
  {
    id: "monthly",
    title: "Monthly Report",
    description:
      "Detailed operational report for the selected month, including call activity.",
    includes: [
      "Executive Summary",
      "Key Metrics",
      "Daily Operations",
      "Call Activity",
      "Issues",
      "Requests",
      "Appendix",
    ],
    audience: ["Client", "ECC Managers"],
    outputs: ["Word"],
    defaultPeriodDays: 31,
    defaultSections: ALL_SECTIONS,
  },
  {
    id: "management",
    title: "Management Report",
    description:
      "Executive-focused pack: posture, KPIs, attention areas, and recommendations.",
    includes: [
      "Executive Summary",
      "Key Metrics",
      "Centre Performance",
      "Issues",
      "Requests",
      "Recommendations",
    ],
    audience: ["Executives", "Stakeholders"],
    outputs: ["Word"],
    defaultPeriodDays: 31,
    defaultSections: [
      "executive_summary",
      "key_metrics",
      "centre_performance",
      "issues",
      "requests",
      "recommendations",
    ],
  },
  {
    id: "activity",
    title: "Activity Report",
    description:
      "Focus on Daily Ops submissions and recorded call activity for the period.",
    includes: ["Key Metrics", "Daily Operations", "Call Activity", "Appendix"],
    audience: ["Operations"],
    outputs: ["Word"],
    defaultPeriodDays: 14,
    defaultSections: [
      "key_metrics",
      "daily_operations",
      "call_activity",
      "appendix",
    ],
  },
  {
    id: "incident",
    title: "Incident Report",
    description:
      "Issues-led report covering open and escalated ECC issues with recommendations.",
    includes: [
      "Executive Summary",
      "Key Metrics",
      "Issues",
      "Recommendations",
      "Appendix",
    ],
    audience: ["ECC Managers", "Incident leads"],
    outputs: ["Word"],
    defaultPeriodDays: 31,
    defaultSections: [
      "executive_summary",
      "key_metrics",
      "issues",
      "recommendations",
      "appendix",
    ],
  },
  {
    id: "custom",
    title: "Custom Report",
    description:
      "Choose the reporting period and exactly which ECC sections to include.",
    includes: ["Your selected sections", "Period you define", "Word download"],
    audience: ["Any audience"],
    outputs: ["Word"],
    defaultPeriodDays: 31,
    defaultSections: ALL_SECTIONS,
    emptySectionsByDefault: true,
  },
];

export function getEccReportType(
  id: EccReportTypeId
): EccReportTypeDefinition | undefined {
  return ECC_REPORT_TYPES.find((item) => item.id === id);
}

export function getEccReportSection(
  id: EccReportSectionId
): EccReportSectionDefinition | undefined {
  return ECC_REPORT_SECTIONS.find((item) => item.id === id);
}

export function formatEccReportRangeLabel(from: string, to: string): string {
  const fmt = (iso: string) => {
    try {
      return new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  };
  if (from === to) return fmt(from);
  return `${fmt(from)} – ${fmt(to)}`;
}

export function defaultRangeForReportType(
  typeId: EccReportTypeId,
  asOfDay: string
): { from: string; to: string } {
  const to = asOfDay;
  const end = new Date(`${asOfDay}T12:00:00`);
  const type = getEccReportType(typeId);
  const days = type?.defaultPeriodDays ?? 31;

  if (typeId === "daily") {
    return { from: to, to };
  }

  if (typeId === "monthly" || typeId === "management" || typeId === "custom") {
    const start = new Date(end);
    start.setDate(1);
    return { from: start.toISOString().slice(0, 10), to };
  }

  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  return { from: start.toISOString().slice(0, 10), to };
}

export function createEccReportConfig(
  typeId: EccReportTypeId,
  asOfDay: string,
  preparedBy = ""
): EccReportConfig {
  const type = getEccReportType(typeId)!;
  const range = defaultRangeForReportType(typeId, asOfDay);
  const sections = type.emptySectionsByDefault
    ? []
    : [...type.defaultSections];
  return {
    reportType: typeId,
    title: type.title,
    rangeFrom: range.from,
    rangeTo: range.to,
    preparedBy,
    sections,
    sectionsBaseline: [...type.defaultSections],
  };
}

export function createInitialEccWizardState(): EccReportWizardState {
  return {
    step: "type",
    reportType: null,
    title: "",
    rangeFrom: "",
    rangeTo: "",
    preparedBy: "",
    sections: [],
    sectionsBaseline: [],
  };
}

export function wizardStateFromConfig(
  config: EccReportConfig,
  step: EccReportWizardStep = "type"
): EccReportWizardState {
  return {
    step,
    reportType: config.reportType,
    title: config.title,
    rangeFrom: config.rangeFrom,
    rangeTo: config.rangeTo,
    preparedBy: config.preparedBy,
    sections: [...config.sections],
    sectionsBaseline: [...config.sectionsBaseline],
  };
}

export function configFromWizard(
  wizard: EccReportWizardState
): EccReportConfig | null {
  if (!wizard.reportType) return null;
  return {
    reportType: wizard.reportType,
    title: wizard.title,
    rangeFrom: wizard.rangeFrom,
    rangeTo: wizard.rangeTo,
    preparedBy: wizard.preparedBy,
    sections: [...wizard.sections],
    sectionsBaseline: [...wizard.sectionsBaseline],
  };
}

export function applyEccReportType(
  typeId: EccReportTypeId,
  asOfDay: string,
  preparedBy = ""
): EccReportWizardState {
  const config = createEccReportConfig(typeId, asOfDay, preparedBy);
  return wizardStateFromConfig(config, "type");
}

export function canProceedEccWizardStep(wizard: EccReportWizardState): boolean {
  switch (wizard.step) {
    case "type":
      return Boolean(wizard.reportType);
    case "centre":
      return Boolean(wizard.reportType);
    case "period":
      return Boolean(
        wizard.title.trim() &&
          wizard.rangeFrom &&
          wizard.rangeTo &&
          wizard.rangeFrom <= wizard.rangeTo
      );
    case "sections":
      return wizard.sections.length > 0;
    case "generate":
      return canProceedEccWizardStep({ ...wizard, step: "sections" });
    default:
      return false;
  }
}

export function resolveEccReportTypeFromPrompt(
  prompt: string
): EccReportTypeId {
  const text = prompt.toLowerCase();
  if (/\bdaily\b/.test(text)) return "daily";
  if (/\bweekly\b|\bweek\b/.test(text)) return "weekly";
  if (/\bmonthly\b|\bmonth\b/.test(text)) return "monthly";
  if (/\bmanagement\b|\bexecutive\b|\bstakeholder\b/.test(text)) {
    return "management";
  }
  if (/\bactivity\b|\bcall\b/.test(text)) return "activity";
  if (/\bincident\b|\bissue\b|\bescalat/.test(text)) return "incident";
  if (/\bcustom\b/.test(text)) return "custom";
  return "weekly";
}
