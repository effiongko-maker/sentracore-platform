"use client";

import { useEffect, useState } from "react";
import type {
  MasterDataEntity,
  MasterDataItem,
} from "@/modules/master-data/types";
import { MasterDataService } from "@/services/masterData/MasterDataService";

export type MasterDataOptionFilters = {
  facilityId?: string;
  buildingId?: string;
  floorId?: string;
  /** When false, skip fetch. Default true. */
  enabled?: boolean;
};

/**
 * Lookup hook for master-data selectors across the app.
 * Location entities (buildings/floors/rooms/departments) are Supabase-backed.
 * Vendors remain Apps Script-backed.
 *
 * Cascade filters (facility → building → floor) are applied in
 * MasterDataService against the normalized facilityId/buildingId/floorId model.
 * A failed source is reported as error — never disguised as a healthy empty list.
 */
export function useMasterDataOptions(
  entity: MasterDataEntity,
  filters: MasterDataOptionFilters = {}
) {
  const { facilityId, buildingId, floorId, enabled = true } = filters;
  const [items, setItems] = useState<MasterDataItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    MasterDataService.list({
      entity,
      page: 1,
      pageSize: 200,
      status: "active",
      facilityId: facilityId || undefined,
      buildingId: buildingId || undefined,
      floorId: floorId || undefined,
    })
      .then((page) => {
        if (cancelled) return;
        setItems(page.data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setItems([]);
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load master data."
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [entity, facilityId, buildingId, floorId, enabled]);

  return { items, loading, error };
}
