"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { getReportSection } from "../constants";
import type {
  ClientReportDocument,
  ReportChartBar,
  ReportKpiMetric,
  ReportSectionId,
  ReportTable,
} from "../types";
import {
  displayReportValue,
  formatReportDate,
  formatReportDateTime,
} from "../utils";
import { ReportToolbar } from "./ReportToolbar";

export const REPORT_DOCUMENT_ID = "report-document";

function DocPage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        // A4-like page sheet on the desk workspace
        "report-doc-page mx-auto w-full max-w-[794px] bg-white px-12 py-12 text-[#142033]",
        "shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.08)]",
        "ring-1 ring-slate-900/5",
        "print:max-w-none print:px-0 print:py-8 print:shadow-none print:ring-0",
        "sm:px-14 sm:py-14",
        className
      )}
    >
      {children}
    </section>
  );
}

function SectionHeading({
  number,
  title,
}: {
  number: string;
  title: string;
}) {
  const safeTitle = displayReportValue(title, "Section");
  return (
    <header className="mb-5 border-b border-slate-200 pb-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        Section {number}
      </p>
      <h2 className="mt-1 font-serif text-2xl tracking-tight text-[#0f1c2e]">
        {safeTitle}
      </h2>
    </header>
  );
}

function MetricGrid({ metrics }: { metrics: ReportKpiMetric[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric) => (
        <div
          key={metric.id}
          className="border border-slate-200 bg-slate-50/70 px-3 py-3"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            {displayReportValue(metric.label, "Metric")}
          </p>
          <p className="mt-2 font-serif text-2xl tracking-tight text-[#0f1c2e]">
            {displayReportValue(metric.value, "—")}
          </p>
          {metric.detail ? (
            <p className="mt-1 text-xs text-slate-500">
              {displayReportValue(metric.detail)}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function DataTable({ table }: { table: ReportTable }) {
  if (!table.rows.length) {
    return (
      <p className="border border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-sm text-slate-500">
        {displayReportValue(table.emptyMessage, "No records.")}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto border border-slate-200">
      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
        <thead>
          <tr className="bg-slate-50">
            {table.headers.map((header, index) => (
              <th
                key={`${header}_${index}`}
                className="border-b border-slate-200 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500"
              >
                {displayReportValue(header, "—")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.id} className="border-b border-slate-100">
              {row.cells.map((cell, index) => (
                <td
                  key={`${row.id}_${index}`}
                  className="px-3 py-2.5 align-top text-slate-700"
                >
                  {displayReportValue(cell, "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BarChart({ bars }: { bars: ReportChartBar[] }) {
  const toneClass = {
    neutral: "bg-[#1d4ed8]",
    success: "bg-emerald-600",
    warning: "bg-amber-500",
    danger: "bg-rose-600",
  } as const;

  return (
    <div className="space-y-3 border border-slate-200 bg-slate-50/40 px-4 py-5">
      {bars.map((bar) => {
        const width = Math.max(2, Math.round((bar.value / bar.max) * 100));
        return (
          <div
            key={bar.label}
            className="grid grid-cols-[160px_1fr_40px] items-center gap-3"
          >
            <p className="truncate text-xs font-medium text-slate-600">
              {displayReportValue(bar.label, "Series")}
            </p>
            <div className="h-2.5 overflow-hidden rounded-sm bg-slate-200/80">
              <div
                className={cn(
                  "h-full rounded-sm",
                  toneClass[bar.tone ?? "neutral"]
                )}
                style={{ width: `${width}%` }}
              />
            </div>
            <p className="text-right text-xs font-semibold text-slate-700">
              {displayReportValue(bar.value, "0")}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, index) => {
        const text = displayReportValue(item, "");
        if (!text) return null;
        return (
          <li
            key={`${text}_${index}`}
            className="flex gap-2 text-sm leading-relaxed text-slate-700"
          >
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1d4ed8]" />
            <span>{text}</span>
          </li>
        );
      })}
    </ul>
  );
}

function CoverPage({ report }: { report: ClientReportDocument }) {
  const title = displayReportValue(report.title, "Operational Report");
  const subtitle = displayReportValue(report.subtitle, "");
  const preparedFor = displayReportValue(
    report.cover.preparedFor,
    "Selected Client"
  );
  const preparedBy = displayReportValue(
    report.cover.preparedBy,
    "SentraCore"
  );
  const period = displayReportValue(report.periodLabel, "Reporting Period");
  const confidentiality = displayReportValue(
    report.cover.confidentiality,
    "Confidential"
  );

  return (
    <DocPage className="relative min-h-[1123px] overflow-hidden print:min-h-0">
      <div className="flex min-h-[1040px] flex-col print:min-h-0">
        <div className="flex items-start justify-end">
          <p className="text-right text-xs text-slate-500">{confidentiality}</p>
        </div>

        <div className="my-auto max-w-xl py-12 print:py-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Operational report
          </p>
          <h1 className="mt-4 font-serif text-5xl leading-[1.05] tracking-tight text-[#0f1c2e]">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-5 text-lg text-slate-600">{subtitle}</p>
          ) : null}

          <dl className="mt-10 grid gap-4 border-t border-slate-200 pt-6 text-sm">
            <div className="grid grid-cols-[140px_1fr] gap-3">
              <dt className="text-slate-500">Prepared for</dt>
              <dd className="font-medium text-[#0f1c2e]">{preparedFor}</dd>
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-3">
              <dt className="text-slate-500">Prepared by</dt>
              <dd className="font-medium text-[#0f1c2e]">{preparedBy}</dd>
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-3">
              <dt className="text-slate-500">Reporting period</dt>
              <dd className="font-medium text-[#0f1c2e]">{period}</dd>
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-3">
              <dt className="text-slate-500">Generated</dt>
              <dd className="font-medium text-[#0f1c2e]">
                {formatReportDate(report.generatedAt)}
              </dd>
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-3">
              <dt className="text-slate-500">Health score</dt>
              <dd className="font-medium capitalize text-[#0f1c2e]">
                {displayReportValue(report.healthScore, "—")}/100 ·{" "}
                {displayReportValue(report.healthBand, "—")}
              </dd>
            </div>
          </dl>
        </div>

        <div className="mt-auto border-t border-slate-200 pt-5 text-xs text-slate-500">
          <p>
            Data as of {formatReportDateTime(report.asOf)}
          </p>
        </div>
      </div>
    </DocPage>
  );
}

function hasSection(report: ClientReportDocument, id: ReportSectionId) {
  return report.sections.includes(id);
}

function sectionNumber(
  report: ClientReportDocument,
  id: ReportSectionId
): string {
  const index = report.sections.indexOf(id);
  return String(index + 1).padStart(2, "0");
}

export function ReportPreview({
  report,
  onBack,
  onStartOver,
}: {
  report: ClientReportDocument;
  onBack: () => void;
  onStartOver: () => void;
}) {
  const facility = displayReportValue(
    report.facilityLabel,
    "Selected Facility"
  );
  const period = displayReportValue(report.periodLabel, "Reporting Period");

  return (
    <div className="space-y-0 print:space-y-0">
      <ReportToolbar
        report={report}
        documentElementId={REPORT_DOCUMENT_ID}
        onBack={onBack}
        onStartOver={onStartOver}
      />

      <div
        id={REPORT_DOCUMENT_ID}
        className={cn(
          "report-print-root space-y-5 bg-[#e8eaed] px-3 py-5",
          // Bleed into page padding so the desk workspace feels full-width
          "-mx-4 sm:-mx-6 lg:-mx-8",
          "print:mx-0 print:space-y-0 print:bg-white print:px-0 print:py-0",
          "sm:px-6 sm:py-6 lg:px-10"
        )}
      >
        <CoverPage report={report} />

        {hasSection(report, "executive_summary") ? (
          <DocPage>
            <SectionHeading
              number={sectionNumber(report, "executive_summary")}
              title={getReportSection("executive_summary")!.title}
            />
            <p className="text-[15px] leading-7 text-slate-700">
              {displayReportValue(
                report.executiveSummary.overview,
                "No executive summary available for this period."
              )}
            </p>
            <div className="mt-8 grid gap-8 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Highlights
                </h3>
                <div className="mt-3">
                  <BulletList items={report.executiveSummary.highlights} />
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Risks
                </h3>
                <div className="mt-3">
                  <BulletList items={report.executiveSummary.risks} />
                </div>
              </div>
            </div>
          </DocPage>
        ) : null}

        {hasSection(report, "kpi_summary") ? (
          <DocPage>
            <SectionHeading
              number={sectionNumber(report, "kpi_summary")}
              title={getReportSection("kpi_summary")!.title}
            />
            <p className="mb-6 text-sm leading-6 text-slate-600">
              Key performance indicators for {facility} during {period}.
            </p>
            <MetricGrid metrics={report.kpiSummary} />
          </DocPage>
        ) : null}

        {hasSection(report, "operational_performance") ? (
          <DocPage>
            <SectionHeading
              number={sectionNumber(report, "operational_performance")}
              title={getReportSection("operational_performance")!.title}
            />
            <p className="mb-6 text-[15px] leading-7 text-slate-700">
              {displayReportValue(
                report.operationalPerformance.narrative,
                "No operational narrative available for this period."
              )}
            </p>
            <BarChart bars={report.operationalPerformance.bars} />
          </DocPage>
        ) : null}

        {hasSection(report, "work_orders") ? (
          <DocPage>
            <SectionHeading
              number={sectionNumber(report, "work_orders")}
              title="Work Orders Summary"
            />
            <p className="mb-6 text-[15px] leading-7 text-slate-700">
              {displayReportValue(
                report.workOrders.narrative,
                "No work order narrative available for this period."
              )}
            </p>
            <MetricGrid metrics={report.workOrders.metrics} />
            <div className="mt-6">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                Latest open work orders
              </h3>
              <DataTable table={report.workOrders.table} />
            </div>
          </DocPage>
        ) : null}

        {hasSection(report, "maintenance") ? (
          <DocPage>
            <SectionHeading
              number={sectionNumber(report, "maintenance")}
              title="Maintenance Summary"
            />
            <p className="mb-6 text-[15px] leading-7 text-slate-700">
              {displayReportValue(
                report.maintenance.narrative,
                "No maintenance narrative available for this period."
              )}
            </p>
            <MetricGrid metrics={report.maintenance.metrics} />
            <div className="mt-6">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                Maintenance attention register
              </h3>
              <DataTable table={report.maintenance.table} />
            </div>
          </DocPage>
        ) : null}

        {hasSection(report, "incidents") ? (
          <DocPage>
            <SectionHeading
              number={sectionNumber(report, "incidents")}
              title="Incident Summary"
            />
            <p className="mb-6 text-[15px] leading-7 text-slate-700">
              {displayReportValue(
                report.incidents.narrative,
                "No incident narrative available for this period."
              )}
            </p>
            <MetricGrid metrics={report.incidents.metrics} />
            <div className="mt-6">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                Critical incident register
              </h3>
              <DataTable table={report.incidents.table} />
            </div>
          </DocPage>
        ) : null}

        {hasSection(report, "assets") ? (
          <DocPage>
            <SectionHeading
              number={sectionNumber(report, "assets")}
              title="Asset Summary"
            />
            <p className="mb-6 text-[15px] leading-7 text-slate-700">
              {displayReportValue(
                report.assets.narrative,
                "No asset narrative available for this period."
              )}
            </p>
            <MetricGrid metrics={report.assets.metrics} />
            <div className="mt-6">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                Asset register
              </h3>
              <DataTable table={report.assets.table} />
            </div>
          </DocPage>
        ) : null}

        {hasSection(report, "recommendations") ? (
          <DocPage>
            <SectionHeading
              number={sectionNumber(report, "recommendations")}
              title={getReportSection("recommendations")!.title}
            />
            <p className="mb-6 text-sm leading-6 text-slate-600">
              Recommended actions for the next reporting cycle, based on the
              current snapshot posture.
            </p>
            <ol className="space-y-3">
              {report.recommendations.map((item, index) => {
                const text = displayReportValue(item, "");
                if (!text) return null;
                return (
                  <li
                    key={`${text}_${index}`}
                    className="flex gap-3 border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm leading-relaxed text-slate-700"
                  >
                    <span className="font-serif text-lg text-[#1d4ed8]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span>{text}</span>
                  </li>
                );
              })}
            </ol>
          </DocPage>
        ) : null}

        {hasSection(report, "appendix") ? (
          <DocPage>
            <SectionHeading
              number={sectionNumber(report, "appendix")}
              title={getReportSection("appendix")!.title}
            />
            <div className="mb-8">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                Data notes
              </h3>
              <BulletList items={report.appendix.dataNotes} />
            </div>
            <div className="space-y-8">
              {report.appendix.registers.map((register) => (
                <div key={register.title}>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {displayReportValue(register.title, "Register")}
                  </h3>
                  <DataTable table={register.table} />
                </div>
              ))}
            </div>
          </DocPage>
        ) : null}
      </div>

      <footer className="print:hidden border-t border-border/60 bg-card px-1 py-3 text-center text-xs text-muted sm:px-0">
        <p>Generated by SentraCore</p>
        <p className="mt-0.5">
          {formatReportDateTime(report.generatedAt)}
        </p>
      </footer>
    </div>
  );
}
