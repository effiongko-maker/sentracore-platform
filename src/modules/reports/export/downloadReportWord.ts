import {
  AlignmentType,
  BorderStyle,
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
import type {
  ClientReportDocument,
  ReportKpiMetric,
  ReportSectionId,
  ReportTable,
} from "../types";
import { formatReportDateTime } from "../utils";
import { downloadBlob, reportFilename } from "./filename";

function heading(text: string, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    text,
    heading: level,
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

function metricLines(metrics: ReportKpiMetric[]) {
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

function dataTable(table: ReportTable) {
  if (!table.rows.length) {
    return [body(table.emptyMessage ?? "No records.")];
  }

  const headerRow = new TableRow({
    children: table.headers.map(
      (header) =>
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: header, bold: true, size: 18 }),
              ],
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

function hasSection(report: ClientReportDocument, id: ReportSectionId) {
  return report.sections.includes(id);
}

function sectionTitle(report: ClientReportDocument, id: ReportSectionId, fallback: string) {
  const index = report.sections.indexOf(id);
  const number = String(index + 1).padStart(2, "0");
  return `Section ${number} — ${fallback}`;
}

export async function downloadReportWord(
  report: ClientReportDocument
): Promise<void> {
  const children: Array<Paragraph | Table> = [
    new Paragraph({
      children: [
        new TextRun({
          text: "CLIENT REPORT",
          size: 18,
          bold: true,
          color: "1D4ED8",
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
    body(`Generated: ${formatReportDateTime(report.generatedAt)}`),
    body(`Health score: ${report.healthScore}/100 · ${report.healthBand}`),
    body(report.cover.confidentiality),
  ];

  if (hasSection(report, "executive_summary")) {
    children.push(
      heading(sectionTitle(report, "executive_summary", "Executive Summary"))
    );
    children.push(body(report.executiveSummary.overview));
    children.push(label("Highlights"));
    children.push(...report.executiveSummary.highlights.map(bullet));
    children.push(label("Risks"));
    children.push(...report.executiveSummary.risks.map(bullet));
  }

  if (hasSection(report, "kpi_summary")) {
    children.push(heading(sectionTitle(report, "kpi_summary", "KPI Summary")));
    children.push(
      body(
        `Key performance indicators for ${report.facilityLabel} during ${report.periodLabel}.`
      )
    );
    children.push(...metricLines(report.kpiSummary));
  }

  if (hasSection(report, "operational_performance")) {
    children.push(
      heading(
        sectionTitle(report, "operational_performance", "Operational Performance")
      )
    );
    children.push(body(report.operationalPerformance.narrative));
    children.push(label("Indicators"));
    for (const bar of report.operationalPerformance.bars) {
      children.push(body(`${bar.label}: ${bar.value}`));
    }
  }

  if (hasSection(report, "work_orders")) {
    children.push(
      heading(sectionTitle(report, "work_orders", "Work Orders Summary"))
    );
    children.push(body(report.workOrders.narrative));
    children.push(...metricLines(report.workOrders.metrics));
    children.push(label("Latest open work orders"));
    children.push(...dataTable(report.workOrders.table));
  }

  if (hasSection(report, "maintenance")) {
    children.push(
      heading(sectionTitle(report, "maintenance", "Maintenance Summary"))
    );
    children.push(body(report.maintenance.narrative));
    children.push(...metricLines(report.maintenance.metrics));
    children.push(label("Maintenance attention register"));
    children.push(...dataTable(report.maintenance.table));
  }

  if (hasSection(report, "incidents")) {
    children.push(
      heading(sectionTitle(report, "incidents", "Incident Summary"))
    );
    children.push(body(report.incidents.narrative));
    children.push(...metricLines(report.incidents.metrics));
    children.push(label("Critical incident register"));
    children.push(...dataTable(report.incidents.table));
  }

  if (hasSection(report, "assets")) {
    children.push(heading(sectionTitle(report, "assets", "Asset Summary")));
    children.push(body(report.assets.narrative));
    children.push(...metricLines(report.assets.metrics));
    children.push(label("Asset register (sample)"));
    children.push(...dataTable(report.assets.table));
  }

  if (hasSection(report, "recommendations")) {
    children.push(
      heading(sectionTitle(report, "recommendations", "Recommendations"))
    );
    children.push(
      body(
        "Recommended actions for the next reporting cycle, based on the current snapshot posture."
      )
    );
    report.recommendations.forEach((item, index) => {
      children.push(
        body(`${String(index + 1).padStart(2, "0")}. ${item}`)
      );
    });
  }

  if (hasSection(report, "appendix")) {
    children.push(heading(sectionTitle(report, "appendix", "Appendix")));
    children.push(label("Data notes"));
    children.push(...report.appendix.dataNotes.map(bullet));
    for (const register of report.appendix.registers) {
      children.push(label(register.title));
      children.push(...dataTable(register.table));
    }
  }

  children.push(
    new Paragraph({
      border: {
        top: { style: BorderStyle.SINGLE, size: 6, color: "E2E8F0", space: 12 },
      },
      spacing: { before: 360 },
      children: [],
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({
          text: `Generated by SentraCore · ${formatReportDateTime(report.generatedAt)}`,
          size: 18,
          color: "64748B",
          italics: true,
        }),
      ],
    })
  );

  const doc = new Document({
    creator: "SentraCore",
    title: report.title,
    description: report.subtitle,
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, reportFilename(report.title, "docx"));
}
