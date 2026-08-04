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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * PDF path — HTML print payload today; dedicated PDF engine later.
 */
export const PdfExporter: DocumentExporter = {
  format: "pdf",
  async export(templated: TemplatedDocument): Promise<ExportResult> {
    const letter = templated.document.coverLetter;
    const cover = letter
      ? `<section><h2>Cover Letter</h2><p><strong>${escapeHtml(letter.subject)}</strong></p><p>${escapeHtml(letter.salutation)}</p><pre>${escapeHtml(letter.body)}</pre><p>${escapeHtml(letter.closing)}<br/>${escapeHtml(letter.signatory ?? "")}</p></section>`
      : "";

    const sections = templated.document.sections
      .map((section) => {
        const metrics = (section.metrics ?? [])
          .map(
            (m) =>
              `<li><strong>${escapeHtml(m.label)}:</strong> ${escapeHtml(String(m.value))}</li>`
          )
          .join("");
        const bullets = (section.bullets ?? [])
          .map((b) => `<li>${escapeHtml(b)}</li>`)
          .join("");
        const paragraphs = (section.paragraphs ?? [])
          .map((p) => `<p>${escapeHtml(p)}</p>`)
          .join("");
        return `<section><h2>${escapeHtml(section.title)}</h2>${paragraphs}${metrics ? `<ul>${metrics}</ul>` : ""}${bullets ? `<ul>${bullets}</ul>` : ""}</section>`;
      })
      .join("\n");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(templated.title)}</title>
  <style>
    body { font-family: Georgia, serif; margin: 48px; color: #0f172a; line-height: 1.5; }
    h1 { font-size: 28px; margin-bottom: 4px; }
    h2 { font-size: 18px; margin-top: 28px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
    .meta { color: #64748b; font-size: 13px; margin-bottom: 24px; }
    pre { white-space: pre-wrap; font-family: inherit; }
  </style>
</head>
<body>
  <h1>${escapeHtml(templated.title)}</h1>
  <p class="meta">${escapeHtml(templated.document.subtitle ?? "")}<br/>Generated ${escapeHtml(templated.document.context.generatedAt)}</p>
  ${cover}
  <section><h2>Template Body</h2><pre>${escapeHtml(templated.renderedBody)}</pre></section>
  ${sections}
  <p class="meta">Template ${escapeHtml(templated.templateId)} · ${escapeHtml(templated.templateVersion)}. Native PDF rendering pending.</p>
</body>
</html>`;

    return {
      status: "ready",
      format: "pdf",
      filename: safeFilename(templated.title, "html"),
      mimeType: "text/html;charset=utf-8",
      content: html,
      encoding: "utf-8",
      message:
        "Native PDF engine pending — downloaded print-ready HTML representation.",
    };
  },
};
