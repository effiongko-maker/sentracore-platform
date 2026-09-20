import type {
  ClientReportDocument,
  ReportPeriodSelection,
  ReportWizardState,
} from "./types";
import { buildPeriodLabel } from "./constants";

export function withPeriodLabel(
  period: Omit<ReportPeriodSelection, "label"> | ReportPeriodSelection
): ReportPeriodSelection {
  const { label: _ignored, ...rest } = period as ReportPeriodSelection;
  return {
    ...rest,
    label: buildPeriodLabel(rest),
  };
}

export function canProceedFromStep(state: ReportWizardState): boolean {
  switch (state.step) {
    case "type":
      return Boolean(state.reportType);
    case "facilities":
      return state.allFacilities || state.facilityIds.length > 0;
    case "period":
      if (state.period.kind === "week") return Boolean(state.period.weekEnding);
      if (state.period.kind === "quarter")
        return Boolean(state.period.quarter && state.period.year);
      if (state.period.kind === "year") return Boolean(state.period.year);
      return Boolean(state.period.month && state.period.year);
    case "sections":
      return state.sections.length > 0;
    case "generate":
      return Boolean(state.reportType) && state.sections.length > 0;
    default:
      return false;
  }
}

export function formatReportDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function formatReportDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Safe display for report UI — never surfaces raw JS empties. */
export function displayReportValue(
  value: unknown,
  fallback = "Not available"
): string {
  if (value == null) return fallback;
  const text = String(value).trim();
  if (
    !text ||
    text === "undefined" ||
    text === "null" ||
    text === "NaN" ||
    text === "[object Object]"
  ) {
    return fallback;
  }
  // Prefer contextual placeholders over generic N/A in the viewer chrome.
  if (
    fallback !== "Not available" &&
    (text === "N/A" || text === "n/a" || text === "NA")
  ) {
    return fallback;
  }
  return text;
}

/** Health line for a report. Never states a score built from unreadable sources. */
export function reportHealthLabel(report: ClientReportDocument): string {
  if (!report.dataAvailability.complete) return "Incomplete — some data unavailable";
  return `${report.healthScore}/100 · ${report.healthBand}`;
}

/** Disclosure shown by preview, Word and PDF alike; null when every source was read. */
export function reportAvailabilityNotice(
  report: ClientReportDocument
): string | null {
  if (report.dataAvailability.complete) return null;
  const labels = report.dataAvailability.unavailable
    .map((item) => item.label)
    .join(", ");
  return `Incomplete report — ${labels} data could not be read. Figures that depend on it are not stated.`;
}
