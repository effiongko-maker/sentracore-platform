"use client";

import { useEffect, useMemo, useState } from "react";
import type { WorkOrder } from "@/modules/work-orders/types";
import { WorkOrderService } from "@/services/workOrders/WorkOrderService";

const workOrderCache = new Map<string, WorkOrder | null>();

/**
 * Hydrate linked Work Orders for display (execution assignment).
 * Dedupes IDs, reuses a module cache, and batches parallel getById calls.
 * Intended for bounded Work list pages — not a full-catalog scan.
 */
export function useLinkedWorkOrders(workOrderIds: string[]) {
  const key = useMemo(
    () => [...new Set(workOrderIds.map((id) => id.trim()).filter(Boolean))].sort().join("|"),
    [workOrderIds]
  );

  const [state, setState] = useState<{
    byId: Record<string, WorkOrder | null>;
    loading: boolean;
  }>({ byId: {}, loading: false });

  useEffect(() => {
    const unique = key ? key.split("|").filter(Boolean) : [];
    if (!unique.length) {
      setState({ byId: {}, loading: false });
      return;
    }

    const fromCache: Record<string, WorkOrder | null> = {};
    const missing: string[] = [];
    for (const id of unique) {
      if (workOrderCache.has(id)) {
        fromCache[id] = workOrderCache.get(id) ?? null;
      } else {
        missing.push(id);
      }
    }

    if (!missing.length) {
      setState({ byId: fromCache, loading: false });
      return;
    }

    setState({ byId: fromCache, loading: true });
    let cancelled = false;

    void Promise.all(
      missing.map(async (id) => {
        const row = await WorkOrderService.getWorkOrder(id);
        workOrderCache.set(id, row);
        return { id, row };
      })
    ).then((results) => {
      if (cancelled) return;
      const byId = { ...fromCache };
      for (const { id, row } of results) {
        byId[id] = row;
      }
      setState({ byId, loading: false });
    });

    return () => {
      cancelled = true;
    };
  }, [key]);

  return state;
}

/** Drop cached rows after WO mutations so detail/list refresh correctly. */
export function invalidateLinkedWorkOrderCache(workOrderId?: string) {
  if (workOrderId?.trim()) {
    workOrderCache.delete(workOrderId.trim());
    return;
  }
  workOrderCache.clear();
}
