"use client";

import { useEffect, useState } from "react";
import type { Facility } from "@/modules/facilities/types";
import { FacilityService } from "@/services/facilities/FacilityService";

/**
 * Shared facility lookup — Facilities SoT is Supabase via FacilityService.
 * Failed retrieval is an error, never a healthy empty list.
 */
export function useFacilityOptions(enabled = true) {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    FacilityService.listFacilities({ page: 1, pageSize: 200 })
      .then((page) => {
        if (cancelled) return;
        setFacilities(page.data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFacilities([]);
        setError(
          err instanceof Error ? err.message : "Unable to load facilities."
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { facilities, loading, error };
}
