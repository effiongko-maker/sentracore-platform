"use client";

import {
  Building2,
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  FileBarChart2,
  FileText,
  Layers3,
  Loader2,
  Wrench,
  AlertTriangle,
} from "lucide-react";
import { toolbarSelectClassName } from "@/components/forms/FormField";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import {
  REPORT_SECTIONS,
  REPORT_TYPES,
  REPORT_WIZARD_STEPS,
  getReportType,
} from "../constants";
import type {
  ReportPeriodKind,
  ReportSectionId,
  ReportTypeId,
  ReportWizardState,
  ReportWizardStep,
} from "../types";

const selectClass = cn(toolbarSelectClassName, "w-full");

const TYPE_ICONS: Record<ReportTypeId, typeof FileText> = {
  monthly_operations: FileText,
  weekly_operations: CalendarRange,
  quarterly_review: Layers3,
  incident_report: AlertTriangle,
  maintenance_report: Wrench,
  executive_summary: FileBarChart2,
};

function WizardStepper({
  step,
  onStepClick,
}: {
  step: ReportWizardStep;
  onStepClick: (step: ReportWizardStep) => void;
}) {
  const currentIndex = REPORT_WIZARD_STEPS.findIndex((s) => s.id === step);

  return (
    <ol className="grid gap-2 sm:grid-cols-5">
      {REPORT_WIZARD_STEPS.map((item, index) => {
        const active = item.id === step;
        const complete = index < currentIndex;
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => {
                if (index <= currentIndex) onStepClick(item.id);
              }}
              disabled={index > currentIndex}
              className={cn(
                "flex w-full items-center gap-3 rounded-sc border px-3 py-3 text-left transition-colors",
                active
                  ? "border-primary/30 bg-primary text-white"
                  : complete
                    ? "border-border bg-card hover:border-primary/20"
                    : "border-border/70 bg-slate-50 text-muted"
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  active
                    ? "bg-white/15 text-white"
                    : complete
                      ? "bg-primary/10 text-primary"
                      : "bg-slate-200/80 text-muted"
                )}
              >
                {complete ? <Check className="h-3.5 w-3.5" /> : item.number}
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    "block text-[11px] font-semibold uppercase tracking-wide",
                    active ? "text-white/70" : "text-muted"
                  )}
                >
                  Step {item.number}
                </span>
                <span
                  className={cn(
                    "block truncate text-sm font-medium",
                    active ? "text-white" : "text-foreground"
                  )}
                >
                  {item.label}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function StepType({
  selected,
  onSelect,
}: {
  selected: ReportTypeId | null;
  onSelect: (id: ReportTypeId) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Choose Report
        </h2>
        <p className="mt-1.5 text-sm text-muted">
          Select the report you want to generate.
        </p>
      </div>

      <div className="grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-3">
        {REPORT_TYPES.map((item) => {
          const Icon = TYPE_ICONS[item.id];
          const isSelected = selected === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className="h-full text-left"
              aria-pressed={isSelected}
            >
              <Card
                className={cn(
                  "flex h-full flex-col border-2 px-0 transition-all duration-200 ease-out",
                  isSelected
                    ? "border-primary bg-primary/[0.03] shadow-sc-lg"
                    : "border-border/70 shadow-sc hover:border-primary/25 hover:bg-slate-50/40 hover:shadow-sc-lg"
                )}
              >
                <CardHeader className="gap-4 px-6 pt-6">
                  <div className="flex items-start gap-3.5">
                    <div
                      className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border bg-white shadow-sc transition-colors duration-200",
                        isSelected
                          ? "border-primary/20 bg-accent-soft"
                          : "border-border/80"
                      )}
                    >
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base leading-snug">
                        {item.title}
                      </CardTitle>
                      <CardDescription className="mt-1.5 line-clamp-2 text-[13px] leading-5">
                        {item.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="flex flex-1 flex-col gap-5 px-6 pb-6 pt-1">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                      Includes
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {item.includes.map((label) => (
                        <span
                          key={label}
                          className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700"
                        >
                          <Check
                            className="h-3 w-3 shrink-0 text-success"
                            aria-hidden
                          />
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-auto grid gap-4 border-t border-border/70 pt-4 sm:grid-cols-2">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                        Audience
                      </p>
                      <p className="mt-1.5 text-xs leading-5 text-foreground">
                        {item.audience.join(" · ")}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                        Output
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {item.outputs.map((format) => (
                          <span
                            key={format}
                            className="rounded-md border border-border/80 bg-white px-2 py-0.5 text-[11px] font-medium text-foreground"
                          >
                            {format}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepFacilities({
  wizard,
  facilityOptions,
  onAllFacilities,
  onToggleFacility,
}: {
  wizard: ReportWizardState;
  facilityOptions: Array<{ id: string; name: string }>;
  onAllFacilities: (value: boolean) => void;
  onToggleFacility: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">
          Select Facility
        </h2>
        <p className="mt-1 text-sm text-muted">
          Include one facility, several facilities, or the full portfolio.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 py-5">
          <label className="flex cursor-pointer items-start gap-3 rounded-sc border border-border/80 bg-slate-50/50 px-4 py-3">
            <input
              type="checkbox"
              className="mt-1"
              checked={wizard.allFacilities}
              onChange={(e) => onAllFacilities(e.target.checked)}
            />
            <span>
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Building2 className="h-4 w-4 text-primary" />
                All facilities (portfolio)
              </span>
              <span className="mt-0.5 block text-xs text-muted">
                Aggregate the report across every facility in the snapshot.
              </span>
            </span>
          </label>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {facilityOptions.map((facility) => {
              const checked =
                !wizard.allFacilities &&
                wizard.facilityIds.includes(facility.id);
              return (
                <label
                  key={facility.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-sc border px-3 py-3 text-sm transition-colors",
                    checked
                      ? "border-accent/40 bg-accent-soft/40"
                      : "border-border/80 bg-card hover:border-primary/20"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleFacility(facility.id)}
                  />
                  <span className="font-medium text-foreground">
                    {facility.name}
                  </span>
                </label>
              );
            })}
          </div>

          {!facilityOptions.length ? (
            <p className="text-sm text-muted">
              No facilities were available to list. Portfolio mode can still be
              used.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function StepPeriod({
  wizard,
  onPeriodChange,
}: {
  wizard: ReportWizardState;
  onPeriodChange: (
    partial: Partial<ReportWizardState["period"]> & { kind?: ReportPeriodKind }
  ) => void;
}) {
  const type = wizard.reportType
    ? getReportType(wizard.reportType)
    : undefined;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">
          Select Reporting Period
        </h2>
        <p className="mt-1 text-sm text-muted">
          Label the report for client delivery
          {type ? ` (${type.title})` : ""}. Snapshot figures reflect the latest
          available data.
        </p>
      </div>

      <Card>
        <CardContent className="grid gap-3 py-5 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1.5 text-xs font-medium text-muted">
            Period type
            <select
              className={selectClass}
              value={wizard.period.kind}
              onChange={(e) =>
                onPeriodChange({
                  kind: e.target.value as ReportPeriodKind,
                })
              }
            >
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="quarter">Quarter</option>
              <option value="year">Year</option>
            </select>
          </label>

          {wizard.period.kind === "week" ? (
            <label className="space-y-1.5 text-xs font-medium text-muted">
              Week ending
              <input
                type="date"
                className={selectClass}
                value={wizard.period.weekEnding ?? ""}
                onChange={(e) => onPeriodChange({ weekEnding: e.target.value })}
              />
            </label>
          ) : null}

          {wizard.period.kind === "month" ? (
            <label className="space-y-1.5 text-xs font-medium text-muted">
              Month
              <select
                className={selectClass}
                value={wizard.period.month ?? 1}
                onChange={(e) =>
                  onPeriodChange({ month: Number(e.target.value) })
                }
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

          {wizard.period.kind === "quarter" ? (
            <label className="space-y-1.5 text-xs font-medium text-muted">
              Quarter
              <select
                className={selectClass}
                value={wizard.period.quarter ?? 1}
                onChange={(e) =>
                  onPeriodChange({ quarter: Number(e.target.value) })
                }
              >
                {[1, 2, 3, 4].map((q) => (
                  <option key={q} value={q}>
                    Q{q}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {wizard.period.kind !== "week" ? (
            <label className="space-y-1.5 text-xs font-medium text-muted">
              Year
              <input
                type="number"
                className={selectClass}
                value={wizard.period.year}
                min={2020}
                max={2100}
                onChange={(e) =>
                  onPeriodChange({ year: Number(e.target.value) })
                }
              />
            </label>
          ) : null}

          <div className="md:col-span-2 xl:col-span-4">
            <div className="rounded-sc border border-dashed border-border/80 bg-slate-50/60 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Period label
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {wizard.period.label}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StepSections({
  selected,
  onToggle,
  onSelectDefaults,
}: {
  selected: ReportSectionId[];
  onToggle: (id: ReportSectionId) => void;
  onSelectDefaults: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Select Report Sections
          </h2>
          <p className="mt-1 text-sm text-muted">
            Include only the sections required for this client pack. Cover page
            is always included.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onSelectDefaults}>
          Reset to defaults
        </Button>
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {REPORT_SECTIONS.map((section) => {
          const checked = selected.includes(section.id);
          return (
            <label
              key={section.id}
              className={cn(
                "flex cursor-pointer gap-3 rounded-sc border px-4 py-4 transition-colors",
                checked
                  ? "border-accent/40 bg-accent-soft/40"
                  : "border-border/80 bg-card hover:border-primary/20"
              )}
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={checked}
                onChange={() => onToggle(section.id)}
              />
              <span>
                <span className="block text-sm font-medium text-foreground">
                  {section.title}
                </span>
                <span className="mt-1 block text-xs text-muted">
                  {section.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function StepGenerate({
  wizard,
  facilityOptions,
  generating,
  error,
  onGenerate,
}: {
  wizard: ReportWizardState;
  facilityOptions: Array<{ id: string; name: string }>;
  generating: boolean;
  error?: string | null;
  onGenerate: () => void;
}) {
  const type = wizard.reportType
    ? getReportType(wizard.reportType)
    : undefined;
  const facilityLabel = wizard.allFacilities
    ? "All facilities (portfolio)"
    : facilityOptions
        .filter((f) => wizard.facilityIds.includes(f.id))
        .map((f) => f.name)
        .join(", ") ||
      (wizard.facilityIds.length
        ? `${wizard.facilityIds.length} selected`
        : "Selected Facility");

  const sectionTitles = REPORT_SECTIONS.filter((s) =>
    wizard.sections.includes(s.id)
  ).map((s) => s.title);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">
          Generate Report
        </h2>
        <p className="mt-1 text-sm text-muted">
          Review your selections, then generate a professional preview suitable
          for later PDF and Word export.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Generation summary</CardTitle>
          <CardDescription>
            Content will be assembled from the existing Reporting Snapshot only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Report type
              </dt>
              <dd className="mt-1 text-sm font-medium text-foreground">
                {type?.title ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Facilities
              </dt>
              <dd className="mt-1 text-sm font-medium text-foreground">
                {facilityLabel}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Reporting period
              </dt>
              <dd className="mt-1 text-sm font-medium text-foreground">
                {wizard.period.label?.trim() || "Reporting Period"}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Sections
              </dt>
              <dd className="mt-1 text-sm text-foreground">
                {sectionTitles.join(" · ") || "None selected"}
              </dd>
            </div>
          </dl>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <div className="flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted">
              Preview first, then export to PDF or Word from the document viewer.
            </p>
            <Button
              size="lg"
              className="min-w-[220px]"
              onClick={onGenerate}
              disabled={generating}
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              {generating ? "Generating…" : "Generate Report"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function ReportWizard({
  wizard,
  facilityOptions,
  canProceed,
  generating,
  error,
  onStepClick,
  onSelectType,
  onAllFacilities,
  onToggleFacility,
  onPeriodChange,
  onToggleSection,
  onResetSections,
  onBack,
  onNext,
  onGenerate,
}: {
  wizard: ReportWizardState;
  facilityOptions: Array<{ id: string; name: string }>;
  canProceed: boolean;
  generating: boolean;
  error?: string | null;
  onStepClick: (step: ReportWizardStep) => void;
  onSelectType: (id: ReportTypeId) => void;
  onAllFacilities: (value: boolean) => void;
  onToggleFacility: (id: string) => void;
  onPeriodChange: (
    partial: Partial<ReportWizardState["period"]> & { kind?: ReportPeriodKind }
  ) => void;
  onToggleSection: (id: ReportSectionId) => void;
  onResetSections: () => void;
  onBack: () => void;
  onNext: () => void;
  onGenerate: () => void;
}) {
  return (
    <div className="space-y-8">
      <WizardStepper step={wizard.step} onStepClick={onStepClick} />

      {wizard.step === "type" ? (
        <StepType selected={wizard.reportType} onSelect={onSelectType} />
      ) : null}

      {wizard.step === "facilities" ? (
        <StepFacilities
          wizard={wizard}
          facilityOptions={facilityOptions}
          onAllFacilities={onAllFacilities}
          onToggleFacility={onToggleFacility}
        />
      ) : null}

      {wizard.step === "period" ? (
        <StepPeriod wizard={wizard} onPeriodChange={onPeriodChange} />
      ) : null}

      {wizard.step === "sections" ? (
        <StepSections
          selected={wizard.sections}
          onToggle={onToggleSection}
          onSelectDefaults={onResetSections}
        />
      ) : null}

      {wizard.step === "generate" ? (
        <StepGenerate
          wizard={wizard}
          facilityOptions={facilityOptions}
          generating={generating}
          error={error}
          onGenerate={onGenerate}
        />
      ) : null}

      {wizard.step !== "generate" ? (
        <div className="flex items-center justify-between border-t border-border/70 pt-6">
          <Button
            type="button"
            variant="outline"
            onClick={onBack}
            disabled={wizard.step === "type"}
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>
          <Button
            type="button"
            size="lg"
            onClick={onNext}
            disabled={!canProceed}
            className="min-w-[148px] shadow-sc transition-all duration-200 enabled:hover:-translate-y-px enabled:hover:shadow-sc-lg enabled:active:translate-y-0"
          >
            Continue
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between border-t border-border/70 pt-6">
          <Button type="button" variant="outline" onClick={onBack}>
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>
        </div>
      )}
    </div>
  );
}
