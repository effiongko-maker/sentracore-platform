"use client";

import { useState } from "react";
import { ArrowLeft, FileBarChart2 } from "lucide-react";
import {
  LoadingGate,
  REPORTS_LOADING_MESSAGES,
  REPORTS_LOADING_STATUS,
  ReportGeneratingProgress,
  ReportsSkeleton,
} from "@/components/loading";
import { ModeFrame } from "@/components/platform";
import { EmptyState } from "@/components/ui/EmptyState";
import { getReportType } from "../constants";
import { useReportWizard } from "../hooks/useReportWizard";
import { ReportPreview } from "./ReportPreview";
import { ReportWizard } from "./ReportWizard";
import { ReportsLanding } from "./ReportsLanding";

export function ReportsPage() {
  const {
    home,
    wizard,
    report,
    surface,
    sessions,
    loading,
    generating,
    error,
    canProceed,
    reload,
    setStep,
    selectReportType,
    setAllFacilities,
    toggleFacility,
    setPeriod,
    toggleSection,
    resetSectionsToDefaults,
    goNext,
    goBack,
    generate,
    startOver,
    beginCreate,
    beginFromPrompt,
    openSession,
    returnHome,
    deleteSession,
  } = useReportWizard();

  const [showAllSessions, setShowAllSessions] = useState(false);

  if (error && !home && !loading) {
    return (
      <ModeFrame mode="cognitive">
        <div className="rp-page">
          <EmptyState
            icon={FileBarChart2}
            title="Couldn’t load reports"
            description={error}
            actionLabel="Retry"
            onAction={reload}
          />
        </div>
      </ModeFrame>
    );
  }

  const reportTitle = wizard.reportType
    ? getReportType(wizard.reportType)?.title
    : undefined;

  return (
    <LoadingGate
      loading={loading && !home}
      skeleton={<ReportsSkeleton />}
      status={REPORTS_LOADING_STATUS}
      messages={REPORTS_LOADING_MESSAGES}
      title="Loading reports"
      tone="dark"
    >
      {home ? (
        surface === "preview" && report ? (
          <ModeFrame mode="cognitive">
            <ReportPreview
              report={report}
              onBack={goBack}
              onStartOver={startOver}
            />
          </ModeFrame>
        ) : surface === "wizard" ? (
          <ModeFrame mode="cognitive">
            <div className="rp-page">
              <button
                type="button"
                className="rp-wizard-back"
                onClick={returnHome}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Back to Reports
              </button>

              {generating ? (
                <ReportGeneratingProgress reportTitle={reportTitle} />
              ) : (
                <ReportWizard
                  wizard={wizard}
                  facilityOptions={home.facilityOptions}
                  canProceed={canProceed}
                  generating={generating}
                  error={error}
                  onStepClick={setStep}
                  onSelectType={selectReportType}
                  onAllFacilities={setAllFacilities}
                  onToggleFacility={toggleFacility}
                  onPeriodChange={setPeriod}
                  onToggleSection={toggleSection}
                  onResetSections={resetSectionsToDefaults}
                  onBack={goBack}
                  onNext={goNext}
                  onGenerate={() => void generate()}
                />
              )}
            </div>
          </ModeFrame>
        ) : (
          <ModeFrame mode="cognitive">
            <div className="rp-page">
              <ReportsLanding
                sessions={sessions}
                showAllSessions={showAllSessions}
                onToggleAllSessions={() =>
                  setShowAllSessions((value) => !value)
                }
                onCreateFromType={(id) => beginCreate(id)}
                onCreateFromPrompt={beginFromPrompt}
                onOpenSession={openSession}
                onDeleteSession={deleteSession}
              />
            </div>
          </ModeFrame>
        )
      ) : null}
    </LoadingGate>
  );
}
