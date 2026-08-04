"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarRange,
  Check,
  ChevronDown,
  ClipboardList,
  Download,
  FileBarChart2,
  FileOutput,
  FileSpreadsheet,
  FileText,
  Loader2,
  Package,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { OUTPUT_FORMATS } from "../constants";
import { useReportsCentre } from "../hooks/useReportsCentre";
import type {
  GeneratedReportRecord,
  ReportGenerationParams,
  ReportLibraryIcon,
  ReportLibraryItem,
} from "../types";
import { downloadExportFile, formatGeneratedAt } from "../utils";

const selectClass =
  "h-10 w-full rounded-[12px] border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/15";

const REPORT_ICONS: Record<ReportLibraryIcon, LucideIcon> = {
  executive: FileBarChart2,
  monthly: FileText,
  quarterly: CalendarRange,
  annual: Building2,
  maintenance: Wrench,
  work_order: ClipboardList,
  incident: AlertTriangle,
  asset: Package,
};

const FORMAT_LABEL: Record<string, string> = {
  word: "Word",
  pdf: "PDF",
  excel: "Excel",
};

function LibraryCard({
  item,
  selected,
  onSelect,
}: {
  item: ReportLibraryItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = REPORT_ICONS[item.icon];

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!item.available}
      className="h-full text-left"
    >
      <Card
        className={cn(
          "flex h-full flex-col transition-colors",
          selected
            ? "border-accent/50 bg-accent-soft/30 ring-1 ring-accent/25"
            : item.available
              ? "hover:border-primary/25 hover:bg-slate-50/50"
              : "opacity-60"
        )}
      >
        <CardHeader className="gap-3">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-white shadow-sc",
                selected && "border-accent/30 bg-white"
              )}
            >
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-[15px] leading-snug">
                {item.title}
              </CardTitle>
              <CardDescription className="mt-1 line-clamp-2">
                {item.description}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="mt-auto space-y-4 pt-0">
          <ul className="space-y-1">
            {item.highlights.map((line) => (
              <li key={line} className="text-xs leading-relaxed text-muted">
                {line}
              </li>
            ))}
          </ul>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Includes
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {item.modules.map((mod) => (
                <span
                  key={mod}
                  className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700"
                >
                  <Check className="h-3 w-3 text-success" />
                  {mod}
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Audience
              </p>
              <p className="mt-1 text-xs text-foreground">
                {item.audience.join(" · ")}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Output
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {item.outputs.map((format) => (
                  <span
                    key={format}
                    className="rounded-md border border-border/80 bg-white px-2 py-0.5 text-[11px] font-medium text-foreground"
                  >
                    {FORMAT_LABEL[format] ?? format}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

function ParametersPanel({
  params,
  facilityOptions,
  onChange,
}: {
  params: ReportGenerationParams;
  facilityOptions: Array<{ id: string; name: string }>;
  onChange: (next: ReportGenerationParams) => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  function patch(partial: Partial<ReportGenerationParams>) {
    onChange({ ...params, ...partial });
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Report Parameters</CardTitle>
          <CardDescription>
            Configure facility, period, and output format.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className="space-y-1.5 text-xs font-medium text-muted">
            Facility
            <select
              className={selectClass}
              value={params.facilityId}
              onChange={(e) => patch({ facilityId: e.target.value })}
            >
              <option value="all">All facilities (portfolio)</option>
              {facilityOptions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5 text-xs font-medium text-muted">
            Reporting period
            <select
              className={selectClass}
              value={params.periodKind}
              onChange={(e) =>
                patch({
                  periodKind: e.target
                    .value as ReportGenerationParams["periodKind"],
                })
              }
            >
              <option value="month">Month</option>
              <option value="quarter">Quarter</option>
              <option value="year">Year</option>
            </select>
          </label>

          {params.periodKind === "month" ? (
            <label className="space-y-1.5 text-xs font-medium text-muted">
              Month
              <select
                className={selectClass}
                value={params.month ?? 1}
                onChange={(e) => patch({ month: Number(e.target.value) })}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {new Date(2000, m - 1, 1).toLocaleString("en-GB", {
                      month: "long",
                    })}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {params.periodKind === "quarter" ? (
            <label className="space-y-1.5 text-xs font-medium text-muted">
              Quarter
              <select
                className={selectClass}
                value={params.quarter ?? 1}
                onChange={(e) => patch({ quarter: Number(e.target.value) })}
              >
                {[1, 2, 3, 4].map((q) => (
                  <option key={q} value={q}>
                    Q{q}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="space-y-1.5 text-xs font-medium text-muted">
            Year
            <input
              type="number"
              className={selectClass}
              value={params.year}
              onChange={(e) => patch({ year: Number(e.target.value) })}
              min={2020}
              max={2100}
            />
          </label>

          <label className="space-y-1.5 text-xs font-medium text-muted">
            Department (optional)
            <input
              type="text"
              className={selectClass}
              value={params.department ?? ""}
              onChange={(e) =>
                patch({ department: e.target.value || undefined })
              }
              placeholder="e.g. Soft Services"
            />
          </label>

          <label className="space-y-1.5 text-xs font-medium text-muted">
            Output format
            <select
              className={selectClass}
              value={params.format}
              onChange={(e) =>
                patch({
                  format: e.target.value as ReportGenerationParams["format"],
                })
              }
            >
              {OUTPUT_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="rounded-sc border border-dashed border-border/80 bg-slate-50/40">
          <button
            type="button"
            onClick={() => setAdvancedOpen((open) => !open)}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Future Features
              </p>
              <p className="mt-0.5 text-xs text-muted">
                Client branding, templates, and localisation
              </p>
            </div>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted transition-transform",
                advancedOpen && "rotate-180"
              )}
            />
          </button>
          {advancedOpen ? (
            <div className="grid gap-3 border-t border-border/70 px-4 py-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-1.5 text-xs font-medium text-muted">
                Client branding
                <input
                  type="text"
                  className={selectClass}
                  value={params.clientName ?? ""}
                  onChange={(e) =>
                    patch({ clientName: e.target.value || undefined })
                  }
                  placeholder="Client name"
                />
              </label>
              <label className="space-y-1.5 text-xs font-medium text-muted">
                Template version
                <input
                  type="text"
                  className={selectClass}
                  value={params.templateVersion ?? "v1"}
                  onChange={(e) => patch({ templateVersion: e.target.value })}
                />
              </label>
              <label className="space-y-1.5 text-xs font-medium text-muted">
                Logo URL
                <input
                  type="url"
                  className={selectClass}
                  value={params.logoUrl ?? ""}
                  onChange={(e) =>
                    patch({ logoUrl: e.target.value || undefined })
                  }
                  placeholder="https://…"
                />
              </label>
              <label className="space-y-1.5 text-xs font-medium text-muted">
                Language
                <input
                  type="text"
                  className={selectClass}
                  value={params.language ?? "en"}
                  onChange={(e) => patch({ language: e.target.value })}
                />
              </label>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function GeneratePanel({
  reportTitle,
  generating,
  onGenerate,
  message,
  error,
}: {
  reportTitle: string;
  generating: boolean;
  onGenerate: () => void;
  message?: string | null;
  error?: string | null;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-5 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Selected Report
          </p>
          <p className="mt-1 text-lg font-semibold tracking-tight text-foreground">
            {reportTitle}
          </p>
          <p className="mt-1 text-sm text-muted">
            Generate a downloadable document for this selection.
          </p>
          {message ? (
            <p className="mt-2 text-xs text-muted">{message}</p>
          ) : null}
          {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
        </div>
        <Button
          size="lg"
          className="min-w-[200px]"
          onClick={onGenerate}
          disabled={generating}
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileOutput className="h-4 w-4" />
          )}
          {generating ? "Generating…" : "Generate Report"}
        </Button>
      </CardContent>
    </Card>
  );
}

function GeneratedTable({ rows }: { rows: GeneratedReportRecord[] }) {
  if (!rows.length) {
    return (
      <EmptyState
        icon={FileSpreadsheet}
        title="No reports generated yet"
        description="Choose a report, configure parameters, then generate a document to see it here."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-sc border border-border/80 bg-card shadow-sc">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border/80 bg-slate-50/80">
              {[
                "Report",
                "Facility",
                "Period",
                "Generated",
                "Format",
                "Status",
                "Download",
              ].map((header) => (
                <th
                  key={header}
                  className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border/60">
                <td className="px-5 py-4 text-sm font-medium text-foreground">
                  {row.title}
                </td>
                <td className="px-5 py-4 text-sm text-foreground">
                  {row.facilityName}
                </td>
                <td className="px-5 py-4 text-sm text-foreground">
                  {row.periodLabel}
                </td>
                <td className="px-5 py-4 text-sm text-muted">
                  {formatGeneratedAt(row.generatedAt)}
                </td>
                <td className="px-5 py-4 text-sm uppercase text-foreground">
                  {FORMAT_LABEL[row.format] ?? row.format}
                </td>
                <td className="px-5 py-4">
                  <Badge
                    variant={row.status === "ready" ? "success" : "danger"}
                  >
                    {row.status}
                  </Badge>
                </td>
                <td className="px-5 py-4">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={row.status !== "ready" || !row.content}
                    onClick={() =>
                      downloadExportFile({
                        filename: row.filename,
                        mimeType: row.mimeType,
                        content: row.content,
                      })
                    }
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ReportsPage() {
  const {
    snapshot,
    selectedKind,
    selectedReport,
    params,
    setParams,
    selectReport,
    generate,
    generating,
    lastGenerated,
    loading,
    error,
    reload,
  } = useReportsCentre();

  if (loading && !snapshot) {
    return (
      <div className="space-y-8">
        <PageHeader
          title="Reports"
          description="Create and download professional facility management documents."
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-56 animate-pulse rounded-sc border border-border/80 bg-slate-100/80"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error && !snapshot) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" />
        <EmptyState
          title="Unable to load reports"
          description={error}
          actionLabel="Retry"
          onAction={reload}
        />
      </div>
    );
  }

  if (!snapshot) return null;

  return (
    <div className="space-y-10">
      <PageHeader
        title="Reports"
        description="Choose a report, configure parameters, generate, and download."
      />

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Report Library
          </h2>
          <p className="mt-1 text-sm text-muted">
            Select the report you want to generate.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {snapshot.library.map((item) => (
            <LibraryCard
              key={item.kind}
              item={item}
              selected={selectedKind === item.kind}
              onSelect={() => selectReport(item.kind)}
            />
          ))}
        </div>
      </section>

      {params && selectedReport ? (
        <>
          <section className="space-y-3">
            <ParametersPanel
              params={params}
              facilityOptions={snapshot.facilityOptions}
              onChange={setParams}
            />
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Generate Report
              </h2>
              <p className="mt-1 text-sm text-muted">
                Create a downloadable document from your selection.
              </p>
            </div>
            <GeneratePanel
              reportTitle={selectedReport.title}
              generating={generating}
              onGenerate={() => void generate()}
              message={lastGenerated?.message}
              error={error}
            />
          </section>
        </>
      ) : (
        <EmptyState
          icon={FileText}
          title="Select a report to continue"
          description="Pick a document from the library to configure parameters and generate."
        />
      )}

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Generated Reports
          </h2>
          <p className="mt-1 text-sm text-muted">
            Previously generated documents from this session.
          </p>
        </div>
        <GeneratedTable rows={snapshot.generated} />
      </section>
    </div>
  );
}
