"use client";

import { useEffect, useState } from "react";
import {
  EntityKinds,
  EntityResolver,
  type EntityKind,
} from "@/services/entityResolver";

/**
 * Resolve an entity id → display name for tables, modals, forms, dropdowns.
 * Falls back to the raw id while loading / when unknown.
 */
export function useEntityLabel(
  kind: EntityKind,
  id: string | null | undefined
) {
  const fallback = id?.trim() ?? "";
  const [label, setLabel] = useState(fallback);

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
