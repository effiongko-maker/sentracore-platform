"use client";

import { useCallback, useEffect, useState } from "react";
import type { LocationCatalog } from "@/modules/master-data/types";
import { MasterDataService } from "@/services/masterData/MasterDataService";

const EMPTY_CATALOG: LocationCatalog = {
  facilities: [],
  buildings: [],
  floors: [],
  rooms: [],
};

/**
 * Loads the flat location hierarchy once (Facility/Building/Floor/Room).
 * Cascade filtering is done locally by consumers.
 */
export function useLocationCatalog(enabled = true) {
  const [catalog, setCatalog] = useState<LocationCatalog>(EMPTY_CATALOG);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => {
    setReloadKey((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const t0 =
      typeof performance !== "undefined" ? performance.now() : Date.now();

    MasterDataService.getLocationCatalog()
      .then((next) => {
        if (cancelled) return;
        const elapsedMs = Math.round(
          (typeof performance !== "undefined" ? performance.now() : Date.now()) -
            t0
        );
        if (process.env.NODE_ENV === "development") {
          console.info("[location.load.timing]", {
            level: "catalog",
            requestCount: 1,
            elapsedMs,
            facilities: next.facilities.length,
            buildings: next.buildings.length,
            floors: next.floors.length,
            rooms: next.rooms.length,
          });
        }
        setCatalog(next);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setCatalog(EMPTY_CATALOG);
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load locations."
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, reloadKey]);

  return { catalog, loading, error, reload };
}
