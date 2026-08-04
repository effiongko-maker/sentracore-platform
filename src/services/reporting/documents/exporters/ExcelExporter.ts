import type { ExportResult, TemplatedDocument } from "../types";
import type { DocumentExporter } from "./DocumentExporter";

function safeFilename(title: string, ext: string): string {
  const base = title
    .replace(/[^a-zA-Z0-9-_ ]+/g, "")
    .trim()
    .replace(/\s+/g, "_");
  const stamp = new Date().toISOString().slice(0, 10);
  return `${base || "SentraCore_Report"}_${stamp}.${ext}`;
}

function csvEscape(value: string | number): string {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/**
 * Excel path — CSV today; workbook generation later.
 */
export const ExcelExporter: DocumentExporter = {
  format: "excel",
  async export(templated: TemplatedDocument): Promise<ExportResult> {
    const lines: string[] = [];
    lines.push(["Field", "Value"].map(csvEscape).join(","));
    for (const [key, value] of Object.entries(templated.placeholders)) {
      lines.push([key, value].map(csvEscape).join(","));
    }

    for (const section of templated.document.sections) {
      if (!section.rows?.length) continue;
      lines.push("");
      lines.push(csvEscape(section.title));
      const keys = Object.keys(section.rows[0]);
      lines.push(keys.map(csvEscape).join(","));
      for (const row of section.rows) {
        lines.push(keys.map((k) => csvEscape(row[k] ?? "")).join(","));
      }
    }

    return {
      status: "ready",
      format: "excel",
      filename: safeFilename(templated.title, "csv"),
      mimeType: "text/csv;charset=utf-8",
      content: lines.join("\n"),
      encoding: "utf-8",
      message:
        "Excel workbook generation pending — downloaded CSV of placeholders and registers.",
    };
  },
};
