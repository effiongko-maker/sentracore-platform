"use client";

import { useEffect, useState } from "react";
import type { Facility } from "@/modules/facilities/types";
import { FacilityService } from "@/services/facilities/FacilityService";

/**
 * Shared facility lookup — always from Facilities sheet via FacilityService.
 */
export function useFacilityOptions(enabled = true) {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    setLoading(true);

    FacilityService.listFacilities({ page: 1, pageSize: 200 })
      .then((page) => {
        if (cancelled) return;
        setFacilities(page.data);
      })
      .catch(() => {
        if (cancelled) return;
        setFacilities([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { facilities, loading };
}
