import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { downloadBlob, reportFilename } from "@/modules/reports/export/filename";
import type {
  EccClientReportDocument,
  EccReportMetric,
  EccReportSectionId,
  EccReportTable,
} from "./types";
import { getEccReportSection } from "./constants";

function heading(text: string) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 280, after: 120 },
  });
}

function body(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, size: 22 })],
    spacing: { after: 120 },
  });
}

function label(text: string) {
  return new Paragraph({
    children: [
      new TextRun({
        text: text.toUpperCase(),
        size: 18,
        bold: true,
        color: "64748B",
      }),
    ],
    spacing: { before: 160, after: 80 },
  });
}

function bullet(text: string) {
  return new Paragraph({
    text,
    bullet: { level: 0 },
    spacing: { after: 60 },
  });
}

function metricLines(metrics: EccReportMetric[]) {
  return metrics.map(
    (metric) =>
      new Paragraph({
        children: [
          new TextRun({ text: `${metric.label}: `, bold: true, size: 22 }),
          new TextRun({
            text: metric.detail
              ? `${metric.value} (${metric.detail})`
              : metric.value,
            size: 22,
          }),
        ],
        spacing: { after: 60 },
      })
  );
}

function dataTable(table: EccReportTable) {
  if (!table.rows.length) {
    return [body(table.emptyMessage ?? "No records.")];
  }

  const headerRow = new TableRow({
    children: table.headers.map(
      (header) =>
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: header, bold: true, size: 18 })],
            }),
          ],
          shading: { type: "clear", fill: "F8FAFC" },
        })
    ),
  });

  const rows = table.rows.map(
    (row) =>
      new TableRow({
        children: row.cells.map(
          (cell) =>
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: cell, size: 18 })],
                }),
              ],
            })
        ),
      })
  );

  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...rows],
    }),
    new Paragraph({ text: "", spacing: { after: 160 } }),
  ];
}

function hasSection(report: EccClientReportDocument, id: EccReportSectionId) {
  return report.sections.includes(id);
}

function sectionTitle(
  report: EccClientReportDocument,
  id: EccReportSectionId
) {
  const index = report.sections.indexOf(id);
  const number = String(index + 1).padStart(2, "0");
  const title = getEccReportSection(id)?.title ?? id;
  return `Section ${number} — ${title}`;
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export async function downloadEccReportWord(
  report: EccClientReportDocument
): Promise<void> {
  const children: Array<Paragraph | Table> = [
    new Paragraph({
      children: [
        new TextRun({
          text: "SENTRACORE ECC OPERATIONS",
          size: 18,
          bold: true,
          color: "0F766E",
        }),
      ],
      spacing: { after: 80 },
    }),
    new Paragraph({
      text: report.title,
      heading: HeadingLevel.TITLE,
      spacing: { after: 80 },
    }),
    body(report.subtitle),
    body(`Prepared for: ${report.cover.preparedFor}`),
    body(`Prepared by: ${report.cover.preparedBy}`),
    body(`Reporting period: ${report.periodLabel}`),
    body(`Centre: ${report.centreName}`),
    body(`Facility reference: ${report.facilityLabel}`),
    body(`Generated: ${formatDateTime(report.generatedAt)}`),
    body(report.cover.confidentiality),
    new Paragraph({
      children: [],
      border: {
        bottom: { style: "single", size: 6, color: "E2E8F0", space: 8 },
      },
      spacing: { after: 200 },
    }),
  ];

  if (hasSection(report, "executive_summary")) {
    children.push(heading(sectionTitle(report, "executive_summary")));
    children.push(body(report.executiveSummary.overview));
    children.push(label("Recorded facts"));
    children.push(...report.executiveSummary.highlights.map(bullet));
    children.push(label("Recorded attention"));
    children.push(...report.executiveSummary.risks.map(bullet));
    children.push(label(report.analysis.label));
    children.push(body(report.analysis.summary));
    children.push(
      ...[...report.analysis.highlights, ...report.analysis.attention].map(bullet)
    );
  }

  if (hasSection(report, "key_metrics")) {
    children.push(heading(sectionTitle(report, "key_metrics")));
    children.push(...metricLines(report.keyMetrics));
  }

  if (hasSection(report, "daily_operations")) {
    children.push(heading(sectionTitle(report, "daily_operations")));
    children.push(body(report.dailyOperations.narrative));
    children.push(...dataTable(report.dailyOperations.table));
  }

  if (hasSection(report, "centre_performance")) {
    children.push(heading(sectionTitle(report, "centre_performance")));
    children.push(body(report.centrePerformance.narrative));
    children.push(...dataTable(report.centrePerformance.table));
  }

  if (hasSection(report, "call_activity")) {
    children.push(heading(sectionTitle(report, "call_activity")));
    children.push(body(report.callActivity.narrative));
    children.push(...dataTable(report.callActivity.table));
  }

  if (hasSection(report, "issues")) {
    children.push(heading(sectionTitle(report, "issues")));
    children.push(body(report.issues.narrative));
    if (report.issues.metrics.length) {
      children.push(label("Issue metrics"));
      children.push(...metricLines(report.issues.metrics));
    }
    children.push(...dataTable(report.issues.table));
  }

  if (hasSection(report, "requests")) {
    children.push(heading(sectionTitle(report, "requests")));
    children.push(body(report.requests.narrative));
    if (report.requests.metrics.length) {
      children.push(label("Request metrics"));
      children.push(...metricLines(report.requests.metrics));
    }
    children.push(...dataTable(report.requests.table));
  }

  if (hasSection(report, "recommendations")) {
    children.push(heading(sectionTitle(report, "recommendations")));
    children.push(body(report.recommendationsNote));
    children.push(...report.recommendations.map(bullet));
  }

  if (hasSection(report, "appendix")) {
    children.push(heading(sectionTitle(report, "appendix")));
    children.push(label("Data notes"));
    children.push(...report.appendix.dataNotes.map(bullet));
    for (const register of report.appendix.registers) {
      children.push(
        new Paragraph({
          text: register.title,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 },
        })
      );
      children.push(...dataTable(register.table));
    }
  }

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "End of report",
          italics: true,
          size: 18,
          color: "64748B",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 360 },
    })
  );

  const doc = new Document({
    sections: [{ children }],
  });
  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, reportFilename(report.title, "docx"));
}
