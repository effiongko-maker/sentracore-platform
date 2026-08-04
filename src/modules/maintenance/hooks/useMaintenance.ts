"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { MAINTENANCE_PAGE_SIZE } from "../constants";
import { MaintenanceService } from "../services/MaintenanceService";
import type {
  Maintenance,
  MaintenancePriority,
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

  useEffect(() => {
    if (previousSearch.current !== debouncedSearch) {
      previousSearch.current = debouncedSearch;
      setPage(1);
    }
  }, [debouncedSearch]);

  const fetchMaintenance = useCallback(
    async (nextPage = page) => {
      const id = ++requestId.current;
      setLoading(true);
      setError(null);

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
        });

        if (id !== requestId.current) return;

        setItems(result.data);
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
        if (id === requestId.current) setLoading(false);
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
    ]
  );

  useEffect(() => {
    fetchMaintenance(page);
  }, [fetchMaintenance, page]);

  const deactivateMaintenance = useCallback(async (id: string) => {
    return MaintenanceService.deactivateMaintenance(id);
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
    type,
    setType,
    facilityId,
    setFacilityId,
    assignedToUserId,
    setAssignedToUserId,
    requiresWorkOrder,
    setRequiresWorkOrder,
    page,
    setPage,
    totalPages,
    total,
    reload: () => fetchMaintenance(page),
    deactivateMaintenance,
  };
}
