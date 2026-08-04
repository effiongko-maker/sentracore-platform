import type { DocumentOutputFormat, ExportResult, TemplatedDocument } from "../types";
import type { DocumentExporter } from "./DocumentExporter";
import { ExcelExporter } from "./ExcelExporter";
import { PdfExporter } from "./PdfExporter";
import { WordExporter } from "./WordExporter";

export type { DocumentExporter } from "./DocumentExporter";
export { WordExporter } from "./WordExporter";
export { PdfExporter } from "./PdfExporter";
export { ExcelExporter } from "./ExcelExporter";

const exporters: Record<DocumentOutputFormat, DocumentExporter> = {
  word: WordExporter,
  pdf: PdfExporter,
  excel: ExcelExporter,
};

export function getDocumentExporter(
  format: DocumentOutputFormat
): DocumentExporter {
  return exporters[format];
}

export async function exportTemplatedDocument(
  templated: TemplatedDocument,
  format: DocumentOutputFormat
): Promise<ExportResult> {
  return getDocumentExporter(format).export(templated);
}
