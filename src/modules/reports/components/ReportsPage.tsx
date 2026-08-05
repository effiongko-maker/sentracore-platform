"use client";

import { FileBarChart2 } from "lucide-react";
import {
  LoadingGate,
  REPORTS_LOADING_MESSAGES,
  ReportGeneratingProgress,
  ReportsSkeleton,
} from "@/components/loading";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { defaultSectionsForType, getReportType } from "../constants";
import { useReportWizard } from "../hooks/useReportWizard";
import { ReportPreview } from "./ReportPreview";
import { ReportWizard } from "./ReportWizard";

export function ReportsPage() {
  const {
    home,
    wizard,
    report,
    view,
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
    setSections,
    goNext,
    goBack,
    generate,
    startOver,
  } = useReportWizard();

  if (error && !home && !loading) {
    return (
      <div>
        <PageHeader
          title="Reports"
          description="Generate operational reports for clients and management."
        />
        <EmptyState
          icon={FileBarChart2}
          title="Couldn’t load reports"
          description={error}
          actionLabel="Retry"
          onAction={reload}
        />
      </div>
    );
  }

  const reportTitle = wizard.reportType
    ? getReportType(wizard.reportType)?.title
    : undefined;

  return (
    <LoadingGate
      loading={loading && !home}
      skeleton={<ReportsSkeleton />}
      messages={REPORTS_LOADING_MESSAGES}
      title="Loading reports"
    >
      {home ? (
        view === "preview" && report ? (
          <ReportPreview
            report={report}
            onBack={goBack}
            onStartOver={startOver}
          />
        ) : (
          <div className="space-y-8">
            <PageHeader
              className="mb-0"
              title="Reports"
              description="Generate operational reports for clients and management."
            />

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
                onResetSections={() => {
                  if (wizard.reportType) {
                    setSections(defaultSectionsForType(wizard.reportType));
                  }
                }}
                onBack={goBack}
                onNext={goNext}
                onGenerate={() => void generate()}
              />
            )}
          </div>
        )
      ) : null}
    </LoadingGate>
  );
}
