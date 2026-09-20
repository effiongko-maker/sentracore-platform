"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { getEccReportSection } from "./constants";
import { EccReportToolbar } from "./EccReportToolbar";
import type {
  EccClientReportDocument,
  EccReportMetric,
  EccReportSectionId,
  EccReportTable,
} from "./types";

export const ECC_REPORT_DOCUMENT_ID = "ecc-report-document";

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
  return (
    <header className="mb-5 border-b border-slate-200 pb-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        Section {number}
      </p>
      <h2 className="mt-1 font-serif text-2xl tracking-tight text-[#0f1c2e]">
        {title}
      </h2>
    </header>
  );
}

function MetricGrid({ metrics }: { metrics: EccReportMetric[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric) => (
        <div
          key={metric.id}
          className="border border-slate-200 bg-slate-50/70 px-3 py-3"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            {metric.label}
          </p>
          <p className="mt-2 font-serif text-2xl tracking-tight text-[#0f1c2e]">
            {metric.value}
          </p>
          {metric.detail ? (
            <p className="mt-1 text-xs text-slate-500">{metric.detail}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function DataTable({ table }: { table: EccReportTable }) {
  if (!table.rows.length) {
    return (
      <p className="border border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-sm text-slate-500">
        {table.emptyMessage ?? "No records."}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto border border-slate-200">
      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
        <thead>
          <tr className="bg-slate-50">
            {table.headers.map((header) => (
              <th
                key={header}
                className="border-b border-slate-200 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.id}>
              {row.cells.map((cell, index) => (
                <td
                  key={`${row.id}-${index}`}
                  className="border-b border-slate-100 px-3 py-2.5 text-slate-700"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li
          key={`${item}_${index}`}
          className="flex gap-2 text-sm leading-relaxed text-slate-700"
        >
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1d4ed8]" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function sectionNumber(
  report: EccClientReportDocument,
  id: EccReportSectionId
): string {
  return String(report.sections.indexOf(id) + 1).padStart(2, "0");
}

function hasSection(
  report: EccClientReportDocument,
  id: EccReportSectionId
): boolean {
  return report.sections.includes(id);
}

function formatGeneratedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
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

export function EccReportPreview({
  report,
  onBack,
  onStartOver,
}: {
  report: EccClientReportDocument;
  onBack: () => void;
  onStartOver: () => void;
}) {
  return (
    <div className="space-y-0 print:space-y-0">
      <EccReportToolbar
        report={report}
        onBack={onBack}
        onStartOver={onStartOver}
      />

      <div
        id={ECC_REPORT_DOCUMENT_ID}
        className={cn(
          "report-print-root space-y-5 bg-[#e8eaed] px-3 py-5",
          "-mx-4 sm:-mx-6 lg:-mx-8",
          "print:mx-0 print:space-y-0 print:bg-white print:px-0 print:py-0",
          "sm:px-6 sm:py-6 lg:px-10"
        )}
      >
        <DocPage className="relative min-h-[1123px] overflow-hidden print:min-h-0">
          <div className="flex min-h-[1040px] flex-col print:min-h-0">
            <div className="flex items-start justify-end">
              <p className="text-right text-xs text-slate-500">
                {report.cover.confidentiality}
              </p>
            </div>
            <div className="my-auto max-w-xl py-12 print:py-10">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                ECC operational report
              </p>
              <h1 className="mt-4 font-serif text-5xl leading-[1.05] tracking-tight text-[#0f1c2e]">
                {report.title}
              </h1>
              {report.subtitle ? (
                <p className="mt-5 text-lg text-slate-600">{report.subtitle}</p>
              ) : null}
              <dl className="mt-10 grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Prepared for
                  </dt>
                  <dd className="mt-1 text-slate-800">
                    {report.cover.preparedFor}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Prepared by
                  </dt>
                  <dd className="mt-1 text-slate-800">
                    {report.cover.preparedBy}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Period
                  </dt>
                  <dd className="mt-1 text-slate-800">{report.periodLabel}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Generated
                  </dt>
                  <dd className="mt-1 text-slate-800">
                    {formatGeneratedAt(report.generatedAt)}
                  </dd>
                </div>
              </dl>
            </div>
            <p className="text-xs text-slate-500">Generated by SentraCore™</p>
          </div>
        </DocPage>

        {hasSection(report, "executive_summary") ? (
          <DocPage>
            <SectionHeading
              number={sectionNumber(report, "executive_summary")}
              title={
                getEccReportSection("executive_summary")?.title ??
                "Executive Summary"
              }
            />
            <p className="text-[15px] leading-7 text-slate-700">
              {report.executiveSummary.overview}
            </p>
            <h3 className="mt-6 text-sm font-semibold text-slate-800">
              Recorded facts
            </h3>
            <div className="mt-3">
              <BulletList items={report.executiveSummary.highlights} />
            </div>
            <h3 className="mt-6 text-sm font-semibold text-slate-800">
              Recorded attention
            </h3>
            <div className="mt-3">
              <BulletList items={report.executiveSummary.risks} />
            </div>
            <div className="mt-8 border border-slate-200 bg-slate-50/60 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                {report.analysis.label}
              </p>
              <p className="mt-3 text-[15px] leading-7 text-slate-700">
                {report.analysis.summary}
              </p>
              <div className="mt-3">
                <BulletList
                  items={[...report.analysis.highlights, ...report.analysis.attention]}
                />
              </div>
            </div>
          </DocPage>
        ) : null}

        {hasSection(report, "key_metrics") ? (
          <DocPage>
            <SectionHeading
              number={sectionNumber(report, "key_metrics")}
              title={getEccReportSection("key_metrics")?.title ?? "Key Metrics"}
            />
            <MetricGrid metrics={report.keyMetrics} />
          </DocPage>
        ) : null}

        {hasSection(report, "daily_operations") ? (
          <DocPage>
            <SectionHeading
              number={sectionNumber(report, "daily_operations")}
              title={
                getEccReportSection("daily_operations")?.title ??
                "Daily Operations"
              }
            />
            <p className="mb-4 text-[15px] leading-7 text-slate-700">
              {report.dailyOperations.narrative}
            </p>
            <DataTable table={report.dailyOperations.table} />
          </DocPage>
        ) : null}

        {hasSection(report, "centre_performance") ? (
          <DocPage>
            <SectionHeading
              number={sectionNumber(report, "centre_performance")}
              title={
                getEccReportSection("centre_performance")?.title ??
                "Centre Performance"
              }
            />
            <p className="mb-4 text-[15px] leading-7 text-slate-700">
              {report.centrePerformance.narrative}
            </p>
            <DataTable table={report.centrePerformance.table} />
          </DocPage>
        ) : null}

        {hasSection(report, "call_activity") ? (
          <DocPage>
            <SectionHeading
              number={sectionNumber(report, "call_activity")}
              title={
                getEccReportSection("call_activity")?.title ?? "Call Activity"
              }
            />
            <p className="mb-4 text-[15px] leading-7 text-slate-700">
              {report.callActivity.narrative}
            </p>
            <DataTable table={report.callActivity.table} />
          </DocPage>
        ) : null}

        {hasSection(report, "issues") ? (
          <DocPage>
            <SectionHeading
              number={sectionNumber(report, "issues")}
              title={getEccReportSection("issues")?.title ?? "Issues"}
            />
            <p className="mb-4 text-[15px] leading-7 text-slate-700">
              {report.issues.narrative}
            </p>
            {report.issues.metrics.length ? (
              <div className="mb-4">
                <MetricGrid metrics={report.issues.metrics} />
              </div>
            ) : null}
            <DataTable table={report.issues.table} />
          </DocPage>
        ) : null}

        {hasSection(report, "requests") ? (
          <DocPage>
            <SectionHeading
              number={sectionNumber(report, "requests")}
              title={getEccReportSection("requests")?.title ?? "Requests"}
            />
            <p className="mb-4 text-[15px] leading-7 text-slate-700">
              {report.requests.narrative}
            </p>
            {report.requests.metrics.length ? (
              <div className="mb-4">
                <MetricGrid metrics={report.requests.metrics} />
              </div>
            ) : null}
            <DataTable table={report.requests.table} />
          </DocPage>
        ) : null}

        {hasSection(report, "recommendations") ? (
          <DocPage>
            <SectionHeading
              number={sectionNumber(report, "recommendations")}
              title={
                getEccReportSection("recommendations")?.title ??
                "Recommendations"
              }
            />
            <p className="mb-4 text-sm italic leading-relaxed text-slate-600">
              {report.recommendationsNote}
            </p>
            <ol className="space-y-3">
              {report.recommendations.map((item, index) => (
                <li
                  key={`${item}_${index}`}
                  className="flex gap-3 border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm leading-relaxed text-slate-700"
                >
                  <span className="font-serif text-lg text-[#1d4ed8]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ol>
          </DocPage>
        ) : null}

        {hasSection(report, "appendix") ? (
          <DocPage>
            <SectionHeading
              number={sectionNumber(report, "appendix")}
              title={getEccReportSection("appendix")?.title ?? "Appendix"}
            />
            <h3 className="text-sm font-semibold text-slate-800">Data notes</h3>
            <div className="mt-3">
              <BulletList items={report.appendix.dataNotes} />
            </div>
            {report.appendix.registers.map((register) => (
              <div key={register.title} className="mt-8">
                <h3 className="mb-3 text-sm font-semibold text-slate-800">
                  {register.title}
                </h3>
                <DataTable table={register.table} />
              </div>
            ))}
          </DocPage>
        ) : null}
      </div>
    </div>
  );
}
