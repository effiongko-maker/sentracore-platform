"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DashboardService } from "@/services/dashboard/DashboardService";
import type { DashboardSnapshot } from "../types";

/**
 * Loads DashboardSnapshot via DashboardService.getOperationalHealth().
 * UI never calls ReportingService or domain services.
 */
export function useDashboard() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);

    try {
      const next = await DashboardService.getOperationalHealth();
      if (id !== requestId.current) return;
      setSnapshot(next);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load dashboard right now."
      );
      setSnapshot(null);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const id = ++requestId.current;
    // Strict Mode remounts this effect; DashboardService dedupes in-flight work
    // so the second invoke joins the same promise instead of a second fan-out.
    console.log(`[hang] useDashboard effect start requestId=${id}`);

    DashboardService.getOperationalHealth()
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
            : "Unable to load dashboard right now."
        );
        setSnapshot(null);
      })
      .finally(() => {
        if (!cancelled && id === requestId.current) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      console.log(`[hang] useDashboard effect cleanup requestId=${id}`);
    };
  }, []);

  return {
    snapshot,
    loading,
    error,
    reload: load,
  };
}
