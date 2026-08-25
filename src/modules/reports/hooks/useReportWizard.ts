"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ReportsService } from "@/services/reports/ReportsService";
import {
  buildDefaultPeriod,
  createInitialWizardState,
  defaultSectionsForType,
  defaultWeekEnding,
  getReportType,
  REPORT_WIZARD_STEPS,
  withSectionsBaseline,
} from "../constants";
import {
  buildSessionName,
  deriveSessionStatus,
  loadReportSessions,
  removeReportSession,
  upsertReportSession,
  type ReportSessionRecord,
} from "../sessions";
import type {
  ClientReportDocument,
  ReportPeriodKind,
  ReportPeriodSelection,
  ReportsHomeSnapshot,
  ReportSectionId,
  ReportTypeId,
  ReportWizardState,
  ReportWizardStep,
} from "../types";
import { canProceedFromStep, withPeriodLabel } from "../utils";

const STEP_ORDER = REPORT_WIZARD_STEPS.map((s) => s.id);

export type ReportsSurface = "home" | "wizard" | "preview";

function newSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `report-${Date.now()}`;
}

export function useReportWizard() {
  const [home, setHome] = useState<ReportsHomeSnapshot | null>(null);
  const [wizard, setWizard] = useState<ReportWizardState>(
    createInitialWizardState
  );
  const [report, setReport] = useState<ClientReportDocument | null>(null);
  const [surface, setSurface] = useState<ReportsSurface>("home");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ReportSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const persistCurrent = useCallback(
    (
      nextWizard: ReportWizardState,
      options?: {
        id?: string | null;
        hasGeneratedPreview?: boolean;
      }
    ) => {
      if (!nextWizard.reportType) return;
      const def = getReportType(nextWizard.reportType);
      if (!def) return;
      const id = options?.id ?? sessionId ?? newSessionId();
      if (!sessionId) setSessionId(id);
      const hasGeneratedPreview =
        options?.hasGeneratedPreview ?? Boolean(report);
      const record: ReportSessionRecord = {
        id,
        name: buildSessionName(def.title, nextWizard.period.label),
        reportType: nextWizard.reportType,
        status: deriveSessionStatus(nextWizard, hasGeneratedPreview),
        updatedAt: new Date().toISOString(),
        wizard: nextWizard,
        hasGeneratedPreview,
      };
      setSessions(upsertReportSession(record));
    },
    [report, sessionId]
  );

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const next = await ReportsService.getHome();
      if (id !== requestId.current) return;
      setHome(next);
      setSessions(loadReportSessions());
    } catch (err) {
      if (id !== requestId.current) return;
      setError(
        err instanceof Error ? err.message : "Unable to load reports right now."
      );
      setHome(null);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setStep = useCallback((step: ReportWizardStep) => {
    setWizard((prev) => {
      const next = { ...prev, step };
      persistCurrent(next);
      return next;
    });
  }, [persistCurrent]);

  const selectReportType = useCallback((reportType: ReportTypeId) => {
    const def = getReportType(reportType);
    const baseline = defaultSectionsForType(reportType);
    setWizard((prev) => {
      const next = {
        ...prev,
        reportType,
        sections: [...baseline],
        sectionsBaseline: [...baseline],
        period: buildDefaultPeriod(def?.defaultPeriodKind ?? "month"),
      };
      persistCurrent(next);
      return next;
    });
  }, [persistCurrent]);

  const setAllFacilities = useCallback((allFacilities: boolean) => {
    setWizard((prev) => {
      const next = {
        ...prev,
        allFacilities,
        facilityIds: allFacilities ? [] : prev.facilityIds,
      };
      persistCurrent(next);
      return next;
    });
  }, [persistCurrent]);

  const toggleFacility = useCallback((facilityId: string) => {
    setWizard((prev) => {
      const exists = prev.facilityIds.includes(facilityId);
      const facilityIds = exists
        ? prev.facilityIds.filter((id) => id !== facilityId)
        : [...prev.facilityIds, facilityId];
      const next = {
        ...prev,
        allFacilities: false,
        facilityIds,
      };
      persistCurrent(next);
      return next;
    });
  }, [persistCurrent]);

  const setPeriod = useCallback(
    (partial: Partial<ReportPeriodSelection> & { kind?: ReportPeriodKind }) => {
      setWizard((prev) => {
        const nextPeriod = { ...prev.period, ...partial };
        if (nextPeriod.kind === "week" && !nextPeriod.weekEnding) {
          nextPeriod.weekEnding = defaultWeekEnding();
        }
        const next = {
          ...prev,
          period: withPeriodLabel(nextPeriod),
        };
        persistCurrent(next);
        return next;
      });
    },
    [persistCurrent]
  );

  const toggleSection = useCallback((sectionId: ReportSectionId) => {
    setWizard((prev) => {
      const exists = prev.sections.includes(sectionId);
      const next = {
        ...prev,
        sections: exists
          ? prev.sections.filter((id) => id !== sectionId)
          : [...prev.sections, sectionId],
      };
      persistCurrent(next);
      return next;
    });
  }, [persistCurrent]);

  const setSections = useCallback((sections: ReportSectionId[]) => {
    setWizard((prev) => {
      const next = { ...prev, sections: [...sections] };
      persistCurrent(next);
      return next;
    });
  }, [persistCurrent]);

  /** Restore the captured template defaults for the currently selected report type. */
  const resetSectionsToDefaults = useCallback(() => {
    setWizard((prev) => {
      if (!prev.reportType) return prev;
      const baseline =
        prev.sectionsBaseline.length > 0
          ? [...prev.sectionsBaseline]
          : defaultSectionsForType(prev.reportType);
      const next = {
        ...prev,
        sections: baseline,
        sectionsBaseline: [...baseline],
      };
      persistCurrent(next);
      return next;
    });
  }, [persistCurrent]);

  const beginCreate = useCallback((reportType?: ReportTypeId) => {
    const id = newSessionId();
    setSessionId(id);
    setReport(null);
    setError(null);
    const def = reportType ? getReportType(reportType) : undefined;
    const baseline = reportType ? defaultSectionsForType(reportType) : [];
    const next = reportType
      ? {
          ...createInitialWizardState(),
          step: "facilities" as const,
          reportType,
          sections: [...baseline],
          sectionsBaseline: [...baseline],
          period: buildDefaultPeriod(def?.defaultPeriodKind ?? "month"),
        }
      : createInitialWizardState();
    setWizard(next);
    if (next.reportType) persistCurrent(next, { id, hasGeneratedPreview: false });
    setSurface("wizard");
  }, [persistCurrent]);

  const beginFromPrompt = useCallback(
    (prompt: string) => {
      const q = prompt.trim().toLowerCase();
      let type: ReportTypeId = "monthly_operations";
      if (q.includes("week") || q.includes("brief")) type = "weekly_operations";
      else if (q.includes("quarter")) type = "quarterly_review";
      else if (q.includes("executive") || q.includes("management")) {
        type = q.includes("monthly") ? "monthly_operations" : "executive_summary";
      } else if (q.includes("incident") || q.includes("risk")) {
        type = "incident_report";
      } else if (q.includes("maintenance") || q.includes("work order")) {
        type = "maintenance_report";
      } else if (q.includes("monthly")) {
        type = "monthly_operations";
      }
      beginCreate(type);
    },
    [beginCreate]
  );

  const openSession = useCallback((session: ReportSessionRecord) => {
    setSessionId(session.id);
    const restored = withSectionsBaseline(session.wizard);
    const wizardState =
      session.status === "generated" || restored.step === "generate"
        ? { ...restored, step: "generate" as const }
        : restored;
    setWizard(wizardState);
    setReport(null);
    setError(null);
    setSurface("wizard");
  }, []);

  const goNext = useCallback(() => {
    if (!canProceedFromStep(wizard)) return;
    const index = STEP_ORDER.indexOf(wizard.step);
    if (index < 0 || index >= STEP_ORDER.length - 1) return;
    setWizard((prev) => {
      const next = { ...prev, step: STEP_ORDER[index + 1] };
      persistCurrent(next);
      return next;
    });
  }, [persistCurrent, wizard]);

  const goBack = useCallback(() => {
    if (surface === "preview") {
      setSurface("wizard");
      setWizard((prev) => {
        const next = { ...prev, step: "generate" as const };
        persistCurrent(next, { hasGeneratedPreview: true });
        return next;
      });
      return;
    }
    const index = STEP_ORDER.indexOf(wizard.step);
    if (index <= 0) {
      setSurface("home");
      return;
    }
    setWizard((prev) => {
      const next = { ...prev, step: STEP_ORDER[index - 1] };
      persistCurrent(next);
      return next;
    });
  }, [persistCurrent, surface, wizard.step]);

  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const next = await ReportsService.generatePreview(wizard);
      setReport(next);
      setSurface("preview");
      persistCurrent(wizard, { hasGeneratedPreview: true });
      return next;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to generate report."
      );
      return null;
    } finally {
      setGenerating(false);
    }
  }, [persistCurrent, wizard]);

  const startOver = useCallback(() => {
    setReport(null);
    setSessionId(null);
    setWizard(createInitialWizardState());
    setError(null);
    setSurface("home");
    setSessions(loadReportSessions());
  }, []);

  const returnHome = useCallback(() => {
    setSurface("home");
    setSessions(loadReportSessions());
  }, []);

  const deleteSession = useCallback(
    (id: string) => {
      const next = removeReportSession(id);
      setSessions(next);
      if (sessionId === id) {
        setSessionId(null);
        setReport(null);
        setWizard(createInitialWizardState());
        setSurface("home");
      }
    },
    [sessionId]
  );

  return {
    home,
    wizard,
    report,
    surface,
    sessions,
    loading,
    generating,
    error,
    canProceed: canProceedFromStep(wizard),
    reload: load,
    setStep,
    selectReportType,
    setAllFacilities,
    toggleFacility,
    setPeriod,
    toggleSection,
    setSections,
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
  };
}
