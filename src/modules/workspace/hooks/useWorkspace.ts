"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WorkspaceService } from "@/services/workspace/WorkspaceService";
import type { WorkspaceSnapshot } from "../types";

export function useWorkspace() {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);

    try {
      const next = await WorkspaceService.getWorkspace();
      if (id !== requestId.current) return;
      setSnapshot(next);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load Home right now."
      );
      setSnapshot(null);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const id = ++requestId.current;

    WorkspaceService.getWorkspace()
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
            : "Unable to load Home right now."
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
    };
  }, []);

  return {
    snapshot,
    loading,
    error,
    reload: load,
  };
}
