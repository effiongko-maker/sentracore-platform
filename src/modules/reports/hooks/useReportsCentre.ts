"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ReportsService } from "@/services/reports/ReportsService";
import { getLibraryItem } from "../constants";
import type {
  DocumentKind,
  GeneratedReportRecord,
  ReportGenerationParams,
  ReportLibraryItem,
  ReportsHomeSnapshot,
} from "../types";

export function useReportsCentre() {
  const [snapshot, setSnapshot] = useState<ReportsHomeSnapshot | null>(null);
  const [selectedKind, setSelectedKind] = useState<DocumentKind | null>(null);
  const [params, setParams] = useState<ReportGenerationParams | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastGenerated, setLastGenerated] =
    useState<GeneratedReportRecord | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const next = await ReportsService.getHome();
      if (id !== requestId.current) return;
      setSnapshot(next);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(
        err instanceof Error ? err.message : "Unable to load reports right now."
      );
      setSnapshot(null);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const id = ++requestId.current;

    ReportsService.getHome()
      .then((next) => {
        if (cancelled || id !== requestId.current) return;
        setSnapshot(next);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled || id !== requestId.current) return;
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load reports right now."
        );
        setSnapshot(null);
      })
      .finally(() => {
        if (!cancelled && id === requestId.current) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectReport = useCallback((kind: DocumentKind) => {
    setSelectedKind(kind);
    setParams(ReportsService.defaultParams(kind));
  }, []);

  const selectedReport: ReportLibraryItem | null = selectedKind
    ? getLibraryItem(selectedKind) ?? null
    : null;

  const generate = useCallback(async () => {
    if (!params) return null;
    setGenerating(true);
    setError(null);
    try {
      const record = await ReportsService.generate(params);
      setLastGenerated(record);
      const home = await ReportsService.getHome();
      setSnapshot(home);
      return record;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to generate report."
      );
      return null;
    } finally {
      setGenerating(false);
    }
  }, [params]);

  return {
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
    reload: load,
  };
}
