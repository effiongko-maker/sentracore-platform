"use client";

import { useEffect, useState } from "react";
import type { Facility } from "@/modules/facilities/types";
import { listOccupantFacilities } from "../actions/listOccupantFacilities";

/**
 * Anonymous request portal facilities.
 * Loaded from the server (Supabase) — the real facility UUID is the identity;
 * no Sheet-era identity is hardcoded in the browser.
 */
export function useOccupantFacilities() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listOccupantFacilities()
      .then((result) => {
        if (cancelled) return;
        setFacilities(result.facilities);
        setError(result.error);
      })
      .catch(() => {
        if (cancelled) return;
        setError("The request portal is unavailable right now.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { facilities, loading, error };
}
