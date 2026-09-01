"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { MaintenanceService } from "@/modules/maintenance/services/MaintenanceService";
import { sortMaintenance } from "@/modules/maintenance/utils";
import type {
  Maintenance,
  MaintenancePriority,
  MaintenanceSort,
  MaintenanceStatus,
} from "@/modules/maintenance/types";
import { DEFAULT_WORK_LIST_STATUS, DEFAULT_WORK_SORT, WORK_PAGE_SIZE } from "../constants";

type WorkListStatus = MaintenanceStatus | "all" | "active";

/**
 * Work list data — Maintenance persistence as Work backing store.
 * Does not invent a second store or sheet.
 */
export function useWork() {
  const [items, setItems] = useState<Maintenance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [priority, setPriorityState] = useState<MaintenancePriority | "all">(
    "all"
  );
  const [status, setStatusState] = useState<WorkListStatus>(
    DEFAULT_WORK_LIST_STATUS
  );
  const [facilityId, setFacilityIdState] = useState<string | "all">("all");
  const [assignedToUserId, setAssignedToUserIdState] = useState<
    string | "all"
  >("all");
  const [requiresWorkOrder, setRequiresWorkOrderState] = useState<
    boolean | "all"
  >("all");
  const [sort, setSortState] = useState<MaintenanceSort>(DEFAULT_WORK_SORT);
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

  const setStatus = useCallback((value: WorkListStatus) => {
    setStatusState(value);
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
    setStatusState(DEFAULT_WORK_LIST_STATUS);
    setFacilityIdState("all");
    setAssignedToUserIdState("all");
    setRequiresWorkOrderState("all");
    setPage(1);
  }, []);

  const fetchWork = useCallback(
    async (nextPage = page) => {
      const id = ++requestId.current;
      setLoading(true);
      setError(null);
      let keepLoadingForPageClamp = false;

      try {
        const result = await MaintenanceService.listMaintenance({
          page: nextPage,
          pageSize: WORK_PAGE_SIZE,
          search: debouncedSearch,
          priority,
          status,
          type: "all",
          facilityId,
          assignedToUserId,
          requiresWorkOrder,
          sort,
        });

        if (id !== requestId.current) return;

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
            : "Unable to load work right now."
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
    void fetchWork(page);
  }, [fetchWork, page, debouncedSearch]);

  useEffect(() => {
    if (totalPages >= 1 && page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const cancelWork = useCallback(async (id: string) => {
    return MaintenanceService.deactivateMaintenance(id);
  }, []);

  const reload = useCallback(async () => {
    await fetchWork(page);
  }, [fetchWork, page]);

  const reloadFirstPage = useCallback(async () => {
    if (page !== 1) {
      setPage(1);
      return;
    }
    await fetchWork(1);
  }, [fetchWork, page]);

  /** Optimistic list patch after Treat/complete without full refetch when possible. */
  const patchItem = useCallback((next: Maintenance) => {
    setItems((prev) =>
      prev.map((row) => (row.id === next.id ? next : row))
    );
  }, []);

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
    cancelWork,
    patchItem,
  };
}
