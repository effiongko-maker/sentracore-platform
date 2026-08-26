"use client";

import { useEffect, useMemo, useState } from "react";
import { useFacilityOptions } from "@/hooks/useFacilityOptions";
import { MasterDataService } from "@/services/masterData/MasterDataService";
import type { MasterDataItem } from "../types";

type NamedRecord = { id: string; name: string };

/**
 * Loads facility / building / floor catalogs for Master Data relationship columns.
 * Resolves by matching record.facilityId → catalog item.id → item.name.
 */
export function useMasterDataRelationMaps(enabled = true) {
  const { facilities, loading: facilitiesLoading } = useFacilityOptions(enabled);
  const [buildings, setBuildings] = useState<MasterDataItem[]>([]);
  const [floors, setFloors] = useState<MasterDataItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    setCatalogLoading(true);

    Promise.all([
      MasterDataService.list({
        entity: "buildings",
        page: 1,
        pageSize: 500,
        status: "all",
      }),
      MasterDataService.list({
        entity: "floors",
        page: 1,
        pageSize: 500,
        status: "all",
      }),
    ])
      .then(([buildingPage, floorPage]) => {
        if (cancelled) return;
        setBuildings(buildingPage.data);
        setFloors(floorPage.data);
      })
      .catch(() => {
        if (cancelled) return;
        setBuildings([]);
        setFloors([]);
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const facilityList = useMemo<NamedRecord[]>(
    () =>
      facilities.map((item) => ({
        id: String(item.id ?? "").trim(),
        name: String(item.name ?? "").trim(),
      })),
    [facilities]
  );

  const buildingList = useMemo<NamedRecord[]>(
    () =>
      buildings.map((item) => ({
        id: String(item.id ?? "").trim(),
        name: String(item.name ?? "").trim(),
      })),
    [buildings]
  );

  const floorList = useMemo<NamedRecord[]>(
    () =>
      floors.map((item) => ({
        id: String(item.id ?? "").trim(),
        name: String(item.name ?? "").trim(),
      })),
    [floors]
  );

  const ready = enabled && !facilitiesLoading && !catalogLoading;

  return {
    facilities: facilityList,
    buildings: buildingList,
    floors: floorList,
    ready,
  };
}

export function resolveRelationName(
  id: string | undefined,
  records: NamedRecord[],
  ready: boolean
): string {
  const key = String(id ?? "").trim();
  if (!key) return "—";
  const match = records.find((item) => item.id === key);
  if (match?.name) return match.name;
  if (!ready) return "…";
  return "—";
}
