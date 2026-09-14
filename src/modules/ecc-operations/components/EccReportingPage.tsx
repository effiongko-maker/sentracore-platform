"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { EccOperationsService } from "../services/EccOperationsService";
import type {
  EccDailyOpsRecord,
  EccIssue,
  EccReportingSnapshot,
  EccRequest,
} from "../types";
import { buildEccReportDocument } from "../reporting/buildEccReportDocument";
import {
  ECC_REPORT_WIZARD_STEPS,
  applyEccReportType,
  canProceedEccWizardStep,
  configFromWizard,
  createInitialEccWizardState,
  formatEccReportRangeLabel,
  getEccReportType,
  resolveEccReportTypeFromPrompt,
} from "../reporting/constants";
import { EccReportPreview } from "../reporting/EccReportPreview";
import { EccReportWizard } from "../reporting/EccReportWizard";
import { EccReportsLanding } from "../reporting/EccReportsLanding";
import {
  buildEccSessionName,
  deriveEccSessionStatus,
  loadEccReportSessions,
  removeEccReportSession,
  upsertEccReportSession,
  type EccReportSessionRecord,
} from "../reporting/sessions";
import type {
  EccClientReportDocument,
  EccReportSectionId,
  EccReportTypeId,
  EccReportWizardState,
  EccReportWizardStep,
} from "../reporting/types";

type Surface = "home" | "wizard" | "preview";

const STEP_ORDER = ECC_REPORT_WIZARD_STEPS.map((s) => s.id);

function toDateInputValue(isoOrDate: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDate)) return isoOrDate;
  try {
    return new Date(isoOrDate).toISOString().slice(0, 10);
  } catch {
    return isoOrDate.slice(0, 10);
  }
}

function newSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ecc-report-${Date.now()}`;
}

export function EccReportingPage() {
  const [snapshot, setSnapshot] = useState<EccReportingSnapshot | null>(null);
  const [issues, setIssues] = useState<EccIssue[]>([]);
  const [requests, setRequests] = useState<EccRequest[]>([]);
  const [dailyOps, setDailyOps] = useState<EccDailyOpsRecord[]>([]);
  const [wizard, setWizard] = useState<EccReportWizardState>(
    createInitialEccWizardState
  );
  const [report, setReport] = useState<EccClientReportDocument | null>(null);
  const [surface, setSurface] = useState<Surface>("home");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<EccReportSessionRecord[]>([]);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const asOfDay = snapshot ? toDateInputValue(snapshot.asOf) : "";

  const persistCurrent = useCallback(
    (
      nextWizard: EccReportWizardState,
      options?: {
        id?: string | null;
        hasGeneratedPreview?: boolean;
      }
    ) => {
      if (!nextWizard.reportType) return;
      const def = getEccReportType(nextWizard.reportType);
      if (!def) return;
      const id = options?.id ?? sessionId ?? newSessionId();
      if (!sessionId) setSessionId(id);
      const hasGeneratedPreview =
        options?.hasGeneratedPreview ?? Boolean(report);
      const periodLabel =
        nextWizard.rangeFrom && nextWizard.rangeTo
          ? formatEccReportRangeLabel(nextWizard.rangeFrom, nextWizard.rangeTo)
          : "";
      const record: EccReportSessionRecord = {
        id,
        name: buildEccSessionName(def.title, periodLabel),
        reportType: nextWizard.reportType,
        status: deriveEccSessionStatus(nextWizard, hasGeneratedPreview),
        updatedAt: new Date().toISOString(),
        wizard: nextWizard,
        hasGeneratedPreview,
      };
      setSessions(upsertEccReportSession(record));
    },
    [report, sessionId]
  );

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const [snap, issueList, requestList, opsList] = await Promise.all([
        EccOperationsService.getReportingSnapshot(),
        EccOperationsService.listIssues(),
        EccOperationsService.listRequests(),
        EccOperationsService.listDailyOps(),
      ]);
      if (id !== requestId.current) return;
      setSnapshot(snap);
      setIssues(issueList);
      setRequests(requestList);
      setDailyOps(opsList);
      setSessions(loadEccReportSessions());
    } catch (err) {
      if (id !== requestId.current) return;
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load reporting foundation."
      );
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const canProceed = useMemo(
    () => canProceedEccWizardStep(wizard),
    [wizard]
  );

  function setStep(step: EccReportWizardStep) {
    setWizard((prev) => {
      const next = { ...prev, step };
      persistCurrent(next);
      return next;
    });
  }

  function selectReportType(typeId: EccReportTypeId) {
    if (!asOfDay) return;
    const next = applyEccReportType(typeId, asOfDay, wizard.preparedBy);
    setWizard(next);
    persistCurrent(next);
  }

  function beginCreate(typeId?: EccReportTypeId) {
    setReport(null);
    setError(null);
    setSessionId(null);
    if (typeId && asOfDay) {
      const next = applyEccReportType(typeId, asOfDay);
      setWizard(next);
      persistCurrent(next);
    } else {
      setWizard(createInitialEccWizardState());
    }
    setSurface("wizard");
  }

  function beginFromPrompt(prompt: string) {
    const typeId = resolveEccReportTypeFromPrompt(prompt);
    beginCreate(typeId);
  }

  function updatePeriod(
    partial: Partial<
      Pick<
        EccReportWizardState,
        "title" | "preparedBy" | "rangeFrom" | "rangeTo"
      >
    >
  ) {
    setWizard((prev) => {
      const next = { ...prev, ...partial };
      persistCurrent(next);
      return next;
    });
  }

  function toggleSection(id: EccReportSectionId) {
    setWizard((prev) => {
      const exists = prev.sections.includes(id);
      const next = {
        ...prev,
        sections: exists
          ? prev.sections.filter((item) => item !== id)
          : [...prev.sections, id],
      };
      persistCurrent(next);
      return next;
    });
  }

  function resetSections() {
    setWizard((prev) => {
      const next = { ...prev, sections: [...prev.sectionsBaseline] };
      persistCurrent(next);
      return next;
    });
  }

  function goNext() {
    if (!canProceed) return;
    const index = STEP_ORDER.indexOf(wizard.step);
    const nextStep = STEP_ORDER[index + 1];
    if (!nextStep) return;
    setStep(nextStep);
  }

  function goBack() {
    if (surface === "preview") {
      setSurface("wizard");
      setStep("generate");
      return;
    }
    const index = STEP_ORDER.indexOf(wizard.step);
    if (index <= 0) return;
    setStep(STEP_ORDER[index - 1]!);
  }

  function returnHome() {
    setSurface("home");
    setError(null);
  }

  function startOver() {
    setReport(null);
    setWizard(createInitialEccWizardState());
    setSessionId(null);
    setError(null);
    setSurface("home");
  }

  function openSession(session: EccReportSessionRecord) {
    setSessionId(session.id);
    setWizard(session.wizard);
    setReport(null);
    setError(null);
    setSurface("wizard");
  }

  function deleteSession(id: string) {
    setSessions(removeEccReportSession(id));
    if (sessionId === id) {
      setSessionId(null);
    }
  }

  async function generate() {
    if (!snapshot) return;
    const config = configFromWizard(wizard);
    if (!config || !canProceedEccWizardStep({ ...wizard, step: "sections" })) {
      setError("Complete report type, period, and content before generating.");
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const built = buildEccReportDocument({
        snapshot,
        config,
        issues,
        requests,
        dailyOps,
      });
      setReport(built);
      persistCurrent(wizard, { hasGeneratedPreview: true });
      setSurface("preview");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to generate report preview."
      );
    } finally {
      setGenerating(false);
    }
  }

  if (error && !snapshot && !loading) {
    return (
      <ModeFrame mode="cognitive">
        <div className="rp-page">
          <EmptyState
            icon={FileBarChart2}
            title="Couldn’t load reports"
            description={error}
            actionLabel="Retry"
            onAction={() => void reload()}
          />
        </div>
      </ModeFrame>
    );
  }

  const reportTitle = wizard.reportType
    ? getEccReportType(wizard.reportType)?.title
    : undefined;

  return (
    <LoadingGate
      loading={loading && !snapshot}
      skeleton={<ReportsSkeleton />}
      status={REPORTS_LOADING_STATUS}
      messages={REPORTS_LOADING_MESSAGES}
      title="Loading reports"
      tone="dark"
    >
      {snapshot ? (
        surface === "preview" && report ? (
          <ModeFrame mode="cognitive">
            <EccReportPreview
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
                <EccReportWizard
                  wizard={wizard}
                  centreName={snapshot.centre.name}
                  facilityId={snapshot.centre.facilityId || ""}
                  canProceed={canProceed}
                  generating={generating}
                  error={error}
                  onStepClick={setStep}
                  onSelectType={selectReportType}
                  onPeriodChange={updatePeriod}
                  onToggleSection={toggleSection}
                  onResetSections={resetSections}
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
              <EccReportsLanding
                sessions={sessions}
                showAllSessions={showAllSessions}
                onToggleAllSessions={() =>
                  setShowAllSessions((value) => !value)
                }
                onCreateFromType={(id) => beginCreate(id)}
                onCreateFromPrompt={beginFromPrompt}
                onOpenSession={openSession}
                onDeleteSession={deleteSession}
                registers={{
                  openIssues: snapshot.openIssues,
                  openRequests: snapshot.openRequests,
                  escalations: snapshot.escalatedIssues,
                  highUrgent:
                    snapshot.highCriticalOpenIssues +
                    snapshot.highUrgentOpenRequests,
                  waitingOnOthers:
                    snapshot.waitingIssues + snapshot.waitingRequests,
                }}
              />
            </div>
          </ModeFrame>
        )
      ) : null}
    </LoadingGate>
  );
}
