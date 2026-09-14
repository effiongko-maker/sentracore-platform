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
  ECC_REPORT_SECTIONS,
  formatEccReportRangeLabel,
  getEccReportType,
} from "./constants";
import type {
  EccReportSectionId,
  EccReportTypeId,
  EccReportWizardState,
  EccReportWizardStep,
} from "./types";
import { EccReportTemplateGrid } from "./EccReportTemplateGrid";
import { EccReportWorkflow } from "./EccReportWorkflow";

const selectClass = cn(toolbarSelectClassName, "w-full");

function StepCentre({
  centreName,
  facilityId,
}: {
  centreName: string;
  facilityId: string;
}) {
  return (
    <div className="rp-step-body">
      <div>
        <h2 className="rp-step-heading">Confirm reporting scope</h2>
        <p className="rp-step-lede">
          ECC reports are prepared for the active emergency control centre.
        </p>
      </div>

      <div className="rp-panel">
        <label className={cn("rp-choice", "rp-choice-on")}>
          <input type="checkbox" className="mt-1" checked readOnly />
          <span>
            <span className="rp-choice-title">
              <Building2 className="h-3.5 w-3.5 text-[var(--rp-muted)]" />
              {centreName}
            </span>
            <span className="rp-choice-desc">
              Facility reference: {facilityId || "—"}. Daily Ops, Issues, and
              Requests for this centre will feed the report.
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}

function StepPeriod({
  wizard,
  onChange,
}: {
  wizard: EccReportWizardState;
  onChange: (
    partial: Partial<
      Pick<
        EccReportWizardState,
        "title" | "preparedBy" | "rangeFrom" | "rangeTo"
      >
    >
  ) => void;
}) {
  const type = wizard.reportType
    ? getEccReportType(wizard.reportType)
    : undefined;
  const periodLabel =
    wizard.rangeFrom && wizard.rangeTo
      ? formatEccReportRangeLabel(wizard.rangeFrom, wizard.rangeTo)
      : "Reporting period";

  return (
    <div className="rp-step-body">
      <div>
        <h2 className="rp-step-heading">Select reporting period</h2>
        <p className="rp-step-lede">
          Label the report for delivery
          {type ? ` (${type.title})` : ""}. Figures reflect live ECC register
          data for the selected window.
        </p>
      </div>

      <div className="rp-panel">
        <div className="rp-field-grid">
          <label className="rp-field">
            Report title
            <input
              type="text"
              className={selectClass}
              value={wizard.title}
              onChange={(e) => onChange({ title: e.target.value })}
            />
          </label>
          <label className="rp-field">
            Prepared by
            <input
              type="text"
              className={selectClass}
              value={wizard.preparedBy}
              placeholder="Name or role"
              onChange={(e) => onChange({ preparedBy: e.target.value })}
            />
          </label>
          <label className="rp-field">
            Start date
            <input
              type="date"
              className={selectClass}
              value={wizard.rangeFrom}
              onChange={(e) => onChange({ rangeFrom: e.target.value })}
            />
          </label>
          <label className="rp-field">
            End date
            <input
              type="date"
              className={selectClass}
              value={wizard.rangeTo}
              onChange={(e) => onChange({ rangeTo: e.target.value })}
            />
          </label>
        </div>

        <div className="rp-period-label">
          <p className="rp-micro">Period label</p>
          <p className="mt-1.5 text-sm font-medium text-[var(--rp-ink)]">
            {periodLabel}
          </p>
        </div>
      </div>
    </div>
  );
}

function StepSections({
  selected,
  baseline,
  onToggle,
  onSelectDefaults,
}: {
  selected: EccReportSectionId[];
  baseline: EccReportSectionId[];
  onToggle: (id: EccReportSectionId) => void;
  onSelectDefaults: () => void;
}) {
  const selectedKey = selected.slice().sort().join("|");

  return (
    <div className="rp-step-body">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="rp-step-heading">Select report sections</h2>
          <p className="rp-step-lede">
            Include only the sections required for this pack. Cover page is
            always included. Sections are backed by ECC Daily Ops, Issues, and
            Requests only.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onSelectDefaults}
          disabled={baseline.length === 0}
        >
          Reset to defaults
        </Button>
      </div>

      <div className="rp-section-grid" key={selectedKey}>
        {ECC_REPORT_SECTIONS.map((section) => {
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
  centreName,
  generating,
  error,
  onGenerate,
}: {
  wizard: EccReportWizardState;
  centreName: string;
  generating: boolean;
  error?: string | null;
  onGenerate: () => void;
}) {
  const type = wizard.reportType
    ? getEccReportType(wizard.reportType)
    : undefined;
  const sectionTitles = ECC_REPORT_SECTIONS.filter((s) =>
    wizard.sections.includes(s.id)
  ).map((s) => s.title);
  const periodLabel =
    wizard.rangeFrom && wizard.rangeTo
      ? formatEccReportRangeLabel(wizard.rangeFrom, wizard.rangeTo)
      : "Reporting Period";

  return (
    <div className="rp-step-body">
      <div>
        <h2 className="rp-step-heading">Generate report</h2>
        <p className="rp-step-lede">
          Review your selections, then generate a professional preview suitable
          for Word export.
        </p>
      </div>

      <div className="rp-panel">
        <p className="rp-micro">Generation summary</p>
        <p className="mt-2 text-sm text-[var(--rp-muted)]">
          Content will be assembled from current ECC operational records.
        </p>

        <dl className="rp-summary-grid mt-5">
          <div>
            <dt className="rp-summary-dt">Report type</dt>
            <dd className="rp-summary-dd">{type?.title ?? "—"}</dd>
          </div>
          <div>
            <dt className="rp-summary-dt">Centre</dt>
            <dd className="rp-summary-dd">{centreName}</dd>
          </div>
          <div>
            <dt className="rp-summary-dt">Reporting period</dt>
            <dd className="rp-summary-dd">{periodLabel}</dd>
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
            Preview first, then export to Word from the document viewer.
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

export function EccReportWizard({
  wizard,
  centreName,
  facilityId,
  canProceed,
  generating,
  error,
  onStepClick,
  onSelectType,
  onPeriodChange,
  onToggleSection,
  onResetSections,
  onBack,
  onNext,
  onGenerate,
}: {
  wizard: EccReportWizardState;
  centreName: string;
  facilityId: string;
  canProceed: boolean;
  generating: boolean;
  error?: string | null;
  onStepClick: (step: EccReportWizardStep) => void;
  onSelectType: (id: EccReportTypeId) => void;
  onPeriodChange: (
    partial: Partial<
      Pick<
        EccReportWizardState,
        "title" | "preparedBy" | "rangeFrom" | "rangeTo"
      >
    >
  ) => void;
  onToggleSection: (id: EccReportSectionId) => void;
  onResetSections: () => void;
  onBack: () => void;
  onNext: () => void;
  onGenerate: () => void;
}) {
  return (
    <div className="rp-wizard">
      <EccReportWorkflow step={wizard.step} onStepClick={onStepClick} />

      {wizard.step === "type" ? (
        <EccReportTemplateGrid
          selected={wizard.reportType}
          onSelect={onSelectType}
        />
      ) : null}

      {wizard.step === "centre" ? (
        <StepCentre centreName={centreName} facilityId={facilityId} />
      ) : null}

      {wizard.step === "period" ? (
        <StepPeriod wizard={wizard} onChange={onPeriodChange} />
      ) : null}

      {wizard.step === "sections" ? (
        <StepSections
          selected={wizard.sections}
          baseline={wizard.sectionsBaseline}
          onToggle={onToggleSection}
          onSelectDefaults={onResetSections}
        />
      ) : null}

      {wizard.step === "generate" ? (
        <StepGenerate
          wizard={wizard}
          centreName={centreName}
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
