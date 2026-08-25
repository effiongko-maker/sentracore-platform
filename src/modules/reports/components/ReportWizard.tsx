"use client";

import {
  Building2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
} from "lucide-react";
import { toolbarSelectClassName } from "@/components/forms/FormField";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  REPORT_SECTIONS,
  getReportType,
} from "../constants";
import type {
  ReportPeriodKind,
  ReportSectionId,
  ReportTypeId,
  ReportWizardState,
  ReportWizardStep,
} from "../types";
import { ReportTemplateGrid } from "./ReportTemplateGrid";
import { ReportWorkflow } from "./ReportWorkflow";

const selectClass = cn(toolbarSelectClassName, "w-full");

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
    <div className="rp-step-body">
      <div>
        <h2 className="rp-step-heading">Select facility</h2>
        <p className="rp-step-lede">
          Include one facility, several facilities, or the full portfolio.
        </p>
      </div>

      <div className="rp-panel">
        <label
          className={cn("rp-choice", wizard.allFacilities && "rp-choice-on")}
        >
          <input
            type="checkbox"
            className="mt-1"
            checked={wizard.allFacilities}
            onChange={(e) => onAllFacilities(e.target.checked)}
          />
          <span>
            <span className="rp-choice-title">
              <Building2 className="h-3.5 w-3.5 text-[var(--rp-muted)]" />
              All facilities (portfolio)
            </span>
            <span className="rp-choice-desc">
              Aggregate the report across every facility in the snapshot.
            </span>
          </span>
        </label>

        <div className="rp-facility-grid">
          {facilityOptions.map((facility) => {
            const checked =
              !wizard.allFacilities && wizard.facilityIds.includes(facility.id);
            return (
              <label
                key={facility.id}
                className={cn("rp-choice", checked && "rp-choice-on")}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleFacility(facility.id)}
                />
                <span className="rp-choice-title">{facility.name}</span>
              </label>
            );
          })}
        </div>

        {!facilityOptions.length ? (
          <p className="mt-4 text-sm text-[var(--rp-muted)]">
            No facilities were available to list. Portfolio mode can still be
            used.
          </p>
        ) : null}
      </div>
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
    <div className="rp-step-body">
      <div>
        <h2 className="rp-step-heading">Select reporting period</h2>
        <p className="rp-step-lede">
          Label the report for client delivery
          {type ? ` (${type.title})` : ""}. Snapshot figures reflect the latest
          available data.
        </p>
      </div>

      <div className="rp-panel">
        <div className="rp-field-grid">
          <label className="rp-field">
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
            <label className="rp-field">
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
            <label className="rp-field">
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
            <label className="rp-field">
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
            <label className="rp-field">
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
        </div>

        <div className="rp-period-label">
          <p className="rp-micro">Period label</p>
          <p className="mt-1.5 text-sm font-medium text-[var(--rp-ink)]">
            {wizard.period.label}
          </p>
        </div>
      </div>
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
    <div className="rp-step-body">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="rp-step-heading">Select report sections</h2>
          <p className="rp-step-lede">
            Include only the sections required for this client pack. Cover page
            is always included.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onSelectDefaults}>
          Reset to defaults
        </Button>
      </div>

      <div className="rp-section-grid">
        {REPORT_SECTIONS.map((section) => {
          const checked = selected.includes(section.id);
          return (
            <label
              key={section.id}
              className={cn("rp-choice", checked && "rp-choice-on")}
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={checked}
                onChange={() => onToggle(section.id)}
              />
              <span>
                <span className="rp-choice-title">{section.title}</span>
                <span className="rp-choice-desc">{section.description}</span>
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
    <div className="rp-step-body">
      <div>
        <h2 className="rp-step-heading">Generate report</h2>
        <p className="rp-step-lede">
          Review your selections, then generate a professional preview suitable
          for later PDF and Word export.
        </p>
      </div>

      <div className="rp-panel">
        <p className="rp-micro">Generation summary</p>
        <p className="mt-2 text-sm text-[var(--rp-muted)]">
          Content will be assembled from current operational records.
        </p>

        <dl className="rp-summary-grid mt-5">
          <div>
            <dt className="rp-summary-dt">Report type</dt>
            <dd className="rp-summary-dd">{type?.title ?? "—"}</dd>
          </div>
          <div>
            <dt className="rp-summary-dt">Facilities</dt>
            <dd className="rp-summary-dd">{facilityLabel}</dd>
          </div>
          <div>
            <dt className="rp-summary-dt">Reporting period</dt>
            <dd className="rp-summary-dd">
              {wizard.period.label?.trim() || "Reporting Period"}
            </dd>
          </div>
          <div>
            <dt className="rp-summary-dt">Sections</dt>
            <dd className="rp-summary-dd">
              {sectionTitles.join(" · ") || "None selected"}
            </dd>
          </div>
        </dl>

        {error ? (
          <p className="mt-4 text-sm text-[var(--rp-critical)]">{error}</p>
        ) : null}

        <div className="rp-generate-footer">
          <p className="text-sm text-[var(--rp-muted)]">
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
      </div>
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
    <div className="rp-wizard">
      <ReportWorkflow step={wizard.step} onStepClick={onStepClick} />

      {wizard.step === "type" ? (
        <ReportTemplateGrid
          selected={wizard.reportType}
          onSelect={onSelectType}
        />
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
        <div className="rp-nav">
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
            className="min-w-[148px] transition-all duration-150 ease-out enabled:hover:-translate-y-px enabled:active:translate-y-0"
          >
            Continue
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="rp-nav">
          <Button type="button" variant="outline" onClick={onBack}>
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>
        </div>
      )}
    </div>
  );
}
