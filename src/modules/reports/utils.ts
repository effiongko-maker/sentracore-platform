import type { DocumentPeriod } from "@/services/reporting/documents";
import type { ReportGenerationParams } from "./types";

export function buildPeriodFromParams(
  params: ReportGenerationParams
): DocumentPeriod {
  const { periodKind, month, quarter, year } = params;

  if (periodKind === "quarter" && quarter) {
    return {
      kind: "quarter",
      quarter,
      year,
      label: `Q${quarter} ${year}`,
    };
  }

  if (periodKind === "year") {
    return {
      kind: "year",
      year,
      label: `FY ${year}`,
    };
  }

  const m = month ?? 1;
  const name = new Date(year, m - 1, 1).toLocaleString("en-GB", {
    month: "long",
    year: "numeric",
  });
  return {
    kind: "month",
    month: m,
    year,
    label: name,
  };
}

export function downloadExportFile(input: {
  filename: string;
  mimeType: string;
  content: string;
}) {
  const blob = new Blob([input.content], { type: input.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = input.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function formatGeneratedAt(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
