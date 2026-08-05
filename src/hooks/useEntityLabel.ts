"use client";

import { useEffect, useState } from "react";
import {
  EntityKinds,
  EntityResolver,
  type EntityKind,
} from "@/services/entityResolver";

function initialLabel(kind: EntityKind, id: string | null | undefined) {
  const normalized = id?.trim() ?? "";
  if (!normalized) return "";
  return EntityResolver.getCached(kind, normalized) ?? normalized;
}

/**
 * Resolve an entity id → display name for tables, modals, forms, dropdowns.
 * Falls back to the raw id while loading / when unknown.
 * Prefers ReportingSnapshot-primed EntityResolver cache (no network).
 */
export function useEntityLabel(
  kind: EntityKind,
  id: string | null | undefined
) {
  const [label, setLabel] = useState(() => initialLabel(kind, id));

  useEffect(() => {
    const normalized = id?.trim() ?? "";
    if (!normalized) {
      setLabel("");
      return;
    }

    const cached = EntityResolver.getCached(kind, normalized);
    if (cached) {
      setLabel(cached);
      return;
    }

    setLabel(normalized);
    let cancelled = false;

    EntityResolver.resolve(kind, normalized).then((name) => {
      if (!cancelled) setLabel(name);
    });

    return () => {
      cancelled = true;
    };
  }, [kind, id]);

  return label;
}

export function useUserName(id: string | null | undefined) {
  return useEntityLabel(EntityKinds.user, id);
}

export function useFacilityName(id: string | null | undefined) {
  return useEntityLabel(EntityKinds.facility, id);
}

export function useAssetName(id: string | null | undefined) {
  return useEntityLabel(EntityKinds.asset, id);
}

export function useWorkOrderTitle(id: string | null | undefined) {
  return useEntityLabel(EntityKinds.workOrder, id);
}

export function useMaintenanceTitle(id: string | null | undefined) {
  return useEntityLabel(EntityKinds.maintenance, id);
}

export function useDepartmentName(id: string | null | undefined) {
  return useEntityLabel(EntityKinds.department, id);
}

export function useBuildingName(id: string | null | undefined) {
  return useEntityLabel(EntityKinds.building, id);
}

export function useFloorName(id: string | null | undefined) {
  return useEntityLabel(EntityKinds.floor, id);
}

export function useRoomName(id: string | null | undefined) {
  return useEntityLabel(EntityKinds.room, id);
}

export function useVendorName(id: string | null | undefined) {
  return useEntityLabel(EntityKinds.vendor, id);
}
