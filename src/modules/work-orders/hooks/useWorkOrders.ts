"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  DEFAULT_WORK_ORDER_SORT,
  WORK_ORDERS_PAGE_SIZE,
} from "../constants";
import { WorkOrderService } from "../services/WorkOrderService";
import { sortWorkOrders } from "../utils";
import type {
  WorkOrder,
  WorkOrderDueDateFilter,
  WorkOrderPriority,
  WorkOrderSort,
  WorkOrderStatus,
} from "../types";

export function useWorkOrders() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatusState] = useState<WorkOrderStatus | "all">("all");
  const [priority, setPriorityState] = useState<WorkOrderPriority | "all">(
    "all"
  );
  const [facilityId, setFacilityIdState] = useState<string | "all">("all");
  const [assetId, setAssetIdState] = useState<string | "all">("all");
  const [assignedToUserId, setAssignedToUserIdState] = useState<
    string | "all"
  >("all");
  const [dueDate, setDueDateState] = useState<WorkOrderDueDateFilter>("all");
  const [maintenanceId, setMaintenanceIdState] = useState<string | "all">(
    "all"
  );
  const [sort, setSortState] = useState<WorkOrderSort>(DEFAULT_WORK_ORDER_SORT);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const requestId = useRef(0);
  const debouncedSearch = useDebouncedValue(search, 250);
  const previousSearch = useRef(debouncedSearch);

  const setStatus = useCallback((value: WorkOrderStatus | "all") => {
    setStatusState(value);
    setPage(1);
  }, []);

  const setPriority = useCallback((value: WorkOrderPriority | "all") => {
    setPriorityState(value);
    setPage(1);
  }, []);

  const setFacilityId = useCallback((value: string | "all") => {
    setFacilityIdState(value);
    setPage(1);
  }, []);

  const setAssetId = useCallback((value: string | "all") => {
    setAssetIdState(value);
    setPage(1);
  }, []);

  const setAssignedToUserId = useCallback((value: string | "all") => {
    setAssignedToUserIdState(value);
    setPage(1);
  }, []);

  const setDueDate = useCallback((value: WorkOrderDueDateFilter) => {
    setDueDateState(value);
    setPage(1);
  }, []);

  const setMaintenanceId = useCallback((value: string | "all") => {
    setMaintenanceIdState(value);
    setPage(1);
  }, []);

  const setSort = useCallback((value: WorkOrderSort) => {
    setSortState(value);
    setPage(1);
  }, []);

  const clearAll = useCallback(() => {
    setSearch("");
    setStatusState("all");
    setPriorityState("all");
    setFacilityIdState("all");
    setAssetIdState("all");
    setAssignedToUserIdState("all");
    setDueDateState("all");
    setMaintenanceIdState("all");
    setPage(1);
  }, []);

  useEffect(() => {
    if (previousSearch.current !== debouncedSearch) {
      previousSearch.current = debouncedSearch;
      setPage(1);
    }
  }, [debouncedSearch]);

  const fetchWorkOrders = useCallback(
    async (nextPage = page) => {
      const id = ++requestId.current;
      setLoading(true);
      setError(null);

      try {
        const result = await WorkOrderService.listWorkOrders({
          page: nextPage,
          pageSize: WORK_ORDERS_PAGE_SIZE,
          search: debouncedSearch,
          status,
          priority,
          facilityId,
          assignedToUserId,
          assetId,
          maintenanceId,
          dueDate,
          sort,
        });

        if (id !== requestId.current) return;

        setWorkOrders(sortWorkOrders(result.data, sort));
        setTotalPages(result.totalPages);
        setTotal(result.total);
      } catch (err) {
        if (id !== requestId.current) return;
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load work orders right now."
        );
        setWorkOrders([]);
        setTotal(0);
        setTotalPages(1);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [
      page,
      debouncedSearch,
      status,
      priority,
      facilityId,
      assignedToUserId,
      assetId,
      maintenanceId,
      dueDate,
      sort,
    ]
  );

  useEffect(() => {
    void fetchWorkOrders(page);
  }, [fetchWorkOrders, page]);

  const deactivateWorkOrder = useCallback(async (id: string) => {
    return WorkOrderService.deactivateWorkOrder(id);
  }, []);

  const reload = useCallback(async () => {
    await fetchWorkOrders(page);
  }, [fetchWorkOrders, page]);

  const reloadFirstPage = useCallback(async () => {
    if (page !== 1) {
      setPage(1);
      return;
    }
    await fetchWorkOrders(1);
  }, [fetchWorkOrders, page]);

  return {
    workOrders,
    loading,
    error,
    search,
    setSearch,
    status,
    setStatus,
    priority,
    setPriority,
    facilityId,
    setFacilityId,
    assetId,
    setAssetId,
    assignedToUserId,
    setAssignedToUserId,
    dueDate,
    setDueDate,
    maintenanceId,
    setMaintenanceId,
    sort,
    setSort,
    clearAll,
    page,
    setPage,
    totalPages,
    total,
    reload,
    reloadFirstPage,
    deactivateWorkOrder,
  };
}
