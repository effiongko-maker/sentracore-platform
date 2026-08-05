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
} from "../constants";
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

export function useReportWizard() {
  const [home, setHome] = useState<ReportsHomeSnapshot | null>(null);
  const [wizard, setWizard] = useState<ReportWizardState>(
    createInitialWizardState
  );
  const [report, setReport] = useState<ClientReportDocument | null>(null);
  const [view, setView] = useState<"wizard" | "preview">("wizard");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const next = await ReportsService.getHome();
      if (id !== requestId.current) return;
      setHome(next);
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
    setWizard((prev) => ({ ...prev, step }));
  }, []);

  const selectReportType = useCallback((reportType: ReportTypeId) => {
    const def = getReportType(reportType);
    setWizard((prev) => ({
      ...prev,
      reportType,
      sections: defaultSectionsForType(reportType),
      period: buildDefaultPeriod(def?.defaultPeriodKind ?? "month"),
    }));
  }, []);

  const setAllFacilities = useCallback((allFacilities: boolean) => {
    setWizard((prev) => ({
      ...prev,
      allFacilities,
      facilityIds: allFacilities ? [] : prev.facilityIds,
    }));
  }, []);

  const toggleFacility = useCallback((facilityId: string) => {
    setWizard((prev) => {
      const exists = prev.facilityIds.includes(facilityId);
      const facilityIds = exists
        ? prev.facilityIds.filter((id) => id !== facilityId)
        : [...prev.facilityIds, facilityId];
      return {
        ...prev,
        allFacilities: false,
        facilityIds,
      };
    });
  }, []);

  const setPeriod = useCallback(
    (partial: Partial<ReportPeriodSelection> & { kind?: ReportPeriodKind }) => {
      setWizard((prev) => {
        const next = { ...prev.period, ...partial };
        if (next.kind === "week" && !next.weekEnding) {
          next.weekEnding = defaultWeekEnding();
        }
        return {
          ...prev,
          period: withPeriodLabel(next),
        };
      });
    },
    []
  );

  const toggleSection = useCallback((sectionId: ReportSectionId) => {
    setWizard((prev) => {
      const exists = prev.sections.includes(sectionId);
      return {
        ...prev,
        sections: exists
          ? prev.sections.filter((id) => id !== sectionId)
          : [...prev.sections, sectionId],
      };
    });
  }, []);

  const setSections = useCallback((sections: ReportSectionId[]) => {
    setWizard((prev) => ({ ...prev, sections }));
  }, []);

  const goNext = useCallback(() => {
    if (!canProceedFromStep(wizard)) return;
    const index = STEP_ORDER.indexOf(wizard.step);
    if (index < 0 || index >= STEP_ORDER.length - 1) return;
    setWizard((prev) => ({ ...prev, step: STEP_ORDER[index + 1] }));
  }, [wizard]);

  const goBack = useCallback(() => {
    if (view === "preview") {
      setView("wizard");
      setWizard((prev) => ({ ...prev, step: "generate" }));
      return;
    }
    const index = STEP_ORDER.indexOf(wizard.step);
    if (index <= 0) return;
    setWizard((prev) => ({ ...prev, step: STEP_ORDER[index - 1] }));
  }, [view, wizard.step]);

  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const next = await ReportsService.generatePreview(wizard);
      setReport(next);
      setView("preview");
      return next;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to generate report."
      );
      return null;
    } finally {
      setGenerating(false);
    }
  }, [wizard]);

  const startOver = useCallback(() => {
    setReport(null);
    setView("wizard");
    setWizard(createInitialWizardState());
    setError(null);
  }, []);

  return {
    home,
    wizard,
    report,
    view,
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
    goNext,
    goBack,
    generate,
    startOver,
  };
}
