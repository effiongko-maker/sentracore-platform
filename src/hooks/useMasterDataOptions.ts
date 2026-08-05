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
 * Always reads from Google Sheets via MasterDataService.
 */
export function useMasterDataOptions(
  entity: MasterDataEntity,
  filters: MasterDataOptionFilters = {}
) {
  const { facilityId, buildingId, floorId, enabled = true } = filters;
  const [items, setItems] = useState<MasterDataItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    setLoading(true);

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
      .catch(() => {
        if (cancelled) return;
        setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [entity, facilityId, buildingId, floorId, enabled]);

  return { items, loading };
}
