"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { INCIDENTS_PAGE_SIZE } from "../constants";
import { IncidentService } from "../services/IncidentService";
import type { Incident, IncidentSeverity, IncidentStatus } from "../types";

export function useIncidents() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [severity, setSeverityState] = useState<IncidentSeverity | "all">(
    "all"
  );
  const [status, setStatusState] = useState<IncidentStatus | "all">("all");
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

  const setSeverity = useCallback((value: IncidentSeverity | "all") => {
    setSeverityState(value);
    setPage(1);
  }, []);

  const setStatus = useCallback((value: IncidentStatus | "all") => {
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

  useEffect(() => {
    if (previousSearch.current !== debouncedSearch) {
      previousSearch.current = debouncedSearch;
      setPage(1);
    }
  }, [debouncedSearch]);

  const fetchIncidents = useCallback(
    async (nextPage = page) => {
      const id = ++requestId.current;
      setLoading(true);
      setError(null);

      try {
        const result = await IncidentService.listIncidents({
          page: nextPage,
          pageSize: INCIDENTS_PAGE_SIZE,
          search: debouncedSearch,
          severity,
          status,
          facilityId,
          assignedToUserId,
          requiresWorkOrder,
        });

        if (id !== requestId.current) return;

        setIncidents(result.data);
        setTotalPages(result.totalPages);
        setTotal(result.total);
      } catch (err) {
        if (id !== requestId.current) return;
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load incidents right now."
        );
        setIncidents([]);
        setTotal(0);
        setTotalPages(1);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [
      page,
      debouncedSearch,
      severity,
      status,
      facilityId,
      assignedToUserId,
      requiresWorkOrder,
    ]
  );

  useEffect(() => {
    fetchIncidents(page);
  }, [fetchIncidents, page]);

  const deactivateIncident = useCallback(async (id: string) => {
    return IncidentService.deactivateIncident(id);
  }, []);

  return {
    incidents,
    loading,
    error,
    search,
    setSearch,
    severity,
    setSeverity,
    status,
    setStatus,
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
    reload: () => fetchIncidents(page),
    deactivateIncident,
  };
}
