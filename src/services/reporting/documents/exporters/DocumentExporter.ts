import type { DocumentOutputFormat } from "../types";

/**
 * Exporters receive completed templated documents only.
 * They never see ReportingSnapshot.
 */
export interface DocumentExporter {
  readonly format: DocumentOutputFormat;
  export(
    templated: import("../types").TemplatedDocument
  ): Promise<import("../types").ExportResult>;
}
