"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WorkspaceService } from "@/services/workspace/WorkspaceService";
import type { WorkspaceSnapshot } from "../types";
import { signalHomeWorkspaceSettled } from "../utils/homeWorkspaceReady";

/**
 * Facility Management Home loader.
 * Critical path: paint when core domains (WO / incidents / maintenance) settle.
 * Non-core (approvals, facilities, currentUser) enrich without re-entering LoadingGate.
 * Bell deferral fires on core paint — not after secondary enrichment.
 */
export function useWorkspace() {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const runProgressiveLoad = useCallback((id: number, cancelled?: () => boolean) => {
    const isCurrent = () =>
      !(cancelled?.() ?? false) && id === requestId.current;

    const { core, complete } = WorkspaceService.beginWorkspaceLoad();

    core
      .then((next) => {
        if (!isCurrent()) return;
        setSnapshot(next);
        setError(null);
        setLoading(false);
        signalHomeWorkspaceSettled();
      })
      .catch((err: unknown) => {
        if (!isCurrent()) return;
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load Home right now."
        );
        setSnapshot(null);
        setLoading(false);
        signalHomeWorkspaceSettled();
      });

    complete
      .then((next) => {
        if (!isCurrent()) return;
        setSnapshot(next);
        setError(null);
        // Never flip loading back to true — enrich in place.
      })
      .catch(() => {
        // Core already painted (or failed). Non-core enrich failure is non-fatal.
      });
  }, []);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    runProgressiveLoad(id);
  }, [runProgressiveLoad]);

  useEffect(() => {
    let cancelled = false;
    const id = ++requestId.current;
    runProgressiveLoad(id, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [runProgressiveLoad]);

  return {
    snapshot,
    loading,
    error,
    reload: load,
  };
}
