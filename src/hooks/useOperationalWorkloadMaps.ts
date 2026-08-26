"use client";

import { useCallback, useEffect, useState } from "react";
import {
  loadOperationalWorkloadMaps,
  type OperationalWorkloadMaps,
} from "@/lib/operational/workload";

const EMPTY: OperationalWorkloadMaps = {
  byUserId: {},
  byUserIdEvidence: {},
  byAssetId: {},
  byAssetIdEvidence: {},
};

/**
 * Optional client helper for dashboards / tooltips.
 * People + Assets registers derive workload in UserService / AssetService via
 * OperationalWorkloadService — do not treat this hook as source of truth.
 */
export function useOperationalWorkloadMaps(enabled = true) {
  const [maps, setMaps] = useState<OperationalWorkloadMaps>(EMPTY);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) {
      setMaps(EMPTY);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const next = await loadOperationalWorkloadMaps();
      setMaps(next);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to derive operational workload."
      );
      setMaps(EMPTY);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { maps, loading, error, reload };
}
