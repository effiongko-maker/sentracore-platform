"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  DEFAULT_MAINTENANCE_SORT,
  MAINTENANCE_PAGE_SIZE,
} from "../constants";
import { MaintenanceService } from "../services/MaintenanceService";
import { sortMaintenance } from "../utils";
import type {
  Maintenance,
  MaintenancePriority,
  MaintenanceSort,
  MaintenanceStatus,
  MaintenanceType,
} from "../types";

export function useMaintenance() {
  const [items, setItems] = useState<Maintenance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [priority, setPriorityState] = useState<MaintenancePriority | "all">(
    "all"
  );
  const [status, setStatusState] = useState<MaintenanceStatus | "all">("all");
  const [type, setTypeState] = useState<MaintenanceType | "all">("all");
  const [facilityId, setFacilityIdState] = useState<string | "all">("all");
  const [assignedToUserId, setAssignedToUserIdState] = useState<
    string | "all"
  >("all");
  const [requiresWorkOrder, setRequiresWorkOrderState] = useState<
    boolean | "all"
  >("all");
  const [sort, setSortState] = useState<MaintenanceSort>(
    DEFAULT_MAINTENANCE_SORT
  );
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const requestId = useRef(0);
  const debouncedSearch = useDebouncedValue(search, 250);
  const previousSearch = useRef(debouncedSearch);

  const setPriority = useCallback((value: MaintenancePriority | "all") => {
    setPriorityState(value);
    setPage(1);
  }, []);

  const setStatus = useCallback((value: MaintenanceStatus | "all") => {
    setStatusState(value);
    setPage(1);
  }, []);

  const setType = useCallback((value: MaintenanceType | "all") => {
    setTypeState(value);
    setPage(1);
  }, []);

  const setFacilityId = useCallback((value: string | "all") => {
    setFacilityIdState(value);
    setPage(1);
  }, []);

  const setAssignedToUserId = useCallback((value: string | "all") => {
    setAssignedToUserIdState(value);
    setPage(1);
  }, []);

  const setRequiresWorkOrder = useCallback((value: boolean | "all") => {
    setRequiresWorkOrderState(value);
    setPage(1);
  }, []);

  const setSort = useCallback((value: MaintenanceSort) => {
    setSortState(value);
    setPage(1);
  }, []);

  const clearAll = useCallback(() => {
    setSearch("");
    setPriorityState("all");
    setStatusState("all");
    setTypeState("all");
    setFacilityIdState("all");
    setAssignedToUserIdState("all");
    setRequiresWorkOrderState("all");
    setPage(1);
  }, []);

  const fetchMaintenance = useCallback(
    async (nextPage = page) => {
      const id = ++requestId.current;
      setLoading(true);
      setError(null);
      let keepLoadingForPageClamp = false;

      try {
        const result = await MaintenanceService.listMaintenance({
          page: nextPage,
          pageSize: MAINTENANCE_PAGE_SIZE,
          search: debouncedSearch,
          priority,
          status,
          type,
          facilityId,
          assignedToUserId,
          requiresWorkOrder,
          sort,
        });

        if (id !== requestId.current) return;

        // Filters/search can shrink results below the current page. Clamp without
        // painting an empty table while the footer still shows a non-zero total.
        if (
          result.data.length === 0 &&
          result.total > 0 &&
          nextPage > result.totalPages
        ) {
          setTotalPages(result.totalPages);
          setTotal(result.total);
          keepLoadingForPageClamp = true;
          setPage(Math.max(1, result.totalPages));
          return;
        }

        setItems(sortMaintenance(result.data, sort));
        setTotalPages(result.totalPages);
        setTotal(result.total);
      } catch (err) {
        if (id !== requestId.current) return;
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load maintenance right now."
        );
        setItems([]);
        setTotal(0);
        setTotalPages(1);
      } finally {
        if (id === requestId.current && !keepLoadingForPageClamp) {
          setLoading(false);
        }
      }
    },
    [
      page,
      debouncedSearch,
      priority,
      status,
      type,
      facilityId,
      assignedToUserId,
      requiresWorkOrder,
      sort,
    ]
  );

  useEffect(() => {
    if (previousSearch.current !== debouncedSearch) {
      previousSearch.current = debouncedSearch;
      if (page !== 1) {
        setPage(1);
        return;
      }
    }
    void fetchMaintenance(page);
  }, [fetchMaintenance, page, debouncedSearch]);

  useEffect(() => {
    if (totalPages >= 1 && page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const deactivateMaintenance = useCallback(async (id: string) => {
    return MaintenanceService.deactivateMaintenance(id);
  }, []);

  const reload = useCallback(async () => {
    await fetchMaintenance(page);
  }, [fetchMaintenance, page]);

  /** After create/update — always return to page 1 (newest-friendly). */
  const reloadFirstPage = useCallback(async () => {
    if (page !== 1) {
      setPage(1);
      return;
    }
    await fetchMaintenance(1);
  }, [fetchMaintenance, page]);

  return {
    items,
    loading,
    error,
    search,
    setSearch,
    priority,
    setPriority,
    status,
    setStatus,
    type,
    setType,
    facilityId,
    setFacilityId,
    assignedToUserId,
    setAssignedToUserId,
    requiresWorkOrder,
    setRequiresWorkOrder,
    sort,
    setSort,
    clearAll,
    page,
    setPage,
    totalPages,
    total,
    reload,
    reloadFirstPage,
    deactivateMaintenance,
  };
}
