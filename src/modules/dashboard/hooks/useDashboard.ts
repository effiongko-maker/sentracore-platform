"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DashboardService } from "@/services/dashboard/DashboardService";
import type { DashboardSnapshot } from "../types";

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
    load();
  }, [load]);

  return {
    snapshot,
    loading,
    error,
    reload: load,
  };
}
