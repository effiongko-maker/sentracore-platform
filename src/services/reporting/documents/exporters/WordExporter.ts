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

function coverBlock(templated: TemplatedDocument): string {
  const letter = templated.document.coverLetter;
  if (!letter) return "";
  return [
    "COVER LETTER",
    letter.subject,
    "",
    letter.salutation,
    "",
    letter.body,
    "",
    letter.closing,
    letter.signatory ?? "",
    "",
    "—",
    "",
  ].join("\n");
}

/**
 * Word export path — text/template payload today; binary .docx merge later.
 * Same TemplateAdapter placeholders will drive client-branded .docx files.
 */
export const WordExporter: DocumentExporter = {
  format: "word",
  async export(templated: TemplatedDocument): Promise<ExportResult> {
    const body = [
      coverBlock(templated),
      templated.renderedBody,
      "",
      `Template: ${templated.templateId} (${templated.templateVersion})`,
      "Note: Binary Word (.docx) template merge is scheduled for a future release.",
      "This file contains the fully populated placeholder content.",
    ].join("\n");

    return {
      status: "ready",
      format: "word",
      filename: safeFilename(templated.title, "txt"),
      mimeType: "text/plain;charset=utf-8",
      content: body,
      encoding: "utf-8",
      message:
        "Word template merge pending — downloaded populated text representation.",
    };
  },
};
