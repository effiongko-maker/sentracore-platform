"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  DEFAULT_FUMIGATION_LOG_SORT,
  FUMIGATION_LOG_PAGE_SIZE,
} from "../constants";
import { FumigationLogService } from "../services/FumigationLogService";
import type { FumigationLog, FumigationLogSort } from "../types";

export function useFumigationLogs() {
  const [entries, setEntries] = useState<FumigationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [facilityId, setFacilityIdState] = useState("");
  const [dateFrom, setDateFromState] = useState("");
  const [dateTo, setDateToState] = useState("");
  const [nextDueFrom, setNextDueFromState] = useState("");
  const [nextDueTo, setNextDueToState] = useState("");
  const [sort, setSortState] = useState<FumigationLogSort>(
    DEFAULT_FUMIGATION_LOG_SORT
  );
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const requestId = useRef(0);
  const debouncedSearch = useDebouncedValue(search, 250);
  const previousSearch = useRef(debouncedSearch);

  const setFacilityId = useCallback((value: string) => {
    setFacilityIdState(value);
    setPage(1);
  }, []);

  const setDateFrom = useCallback((value: string) => {
    setDateFromState(value);
    setPage(1);
  }, []);

  const setDateTo = useCallback((value: string) => {
    setDateToState(value);
    setPage(1);
  }, []);

  const setNextDueFrom = useCallback((value: string) => {
    setNextDueFromState(value);
    setPage(1);
  }, []);

  const setNextDueTo = useCallback((value: string) => {
    setNextDueToState(value);
    setPage(1);
  }, []);

  const setSort = useCallback((value: FumigationLogSort) => {
    setSortState(value);
    setPage(1);
  }, []);

  const clearAll = useCallback(() => {
    setSearch("");
    setFacilityIdState("");
    setDateFromState("");
    setDateToState("");
    setNextDueFromState("");
    setNextDueToState("");
    setPage(1);
  }, []);

  useEffect(() => {
    if (previousSearch.current !== debouncedSearch) {
      previousSearch.current = debouncedSearch;
      setPage(1);
    }
  }, [debouncedSearch]);

  const fetchEntries = useCallback(
    async (nextPage = page) => {
      const id = ++requestId.current;
      setLoading(true);
      setError(null);

      try {
        const facilityFilter = facilityId.trim();
        const result = await FumigationLogService.listFumigationLogs({
          page: nextPage,
          pageSize: FUMIGATION_LOG_PAGE_SIZE,
          search: debouncedSearch,
          facilityId: facilityFilter ? facilityFilter : "all",
          dateFrom: dateFrom.trim() || undefined,
          dateTo: dateTo.trim() || undefined,
          nextDueFrom: nextDueFrom.trim() || undefined,
          nextDueTo: nextDueTo.trim() || undefined,
          sort,
        });

        if (id !== requestId.current) return;

        setEntries(result.data);
        setTotalPages(result.totalPages);
        setTotal(result.total);
        if (result.page !== nextPage) {
          setPage(result.page);
        }
      } catch (err) {
        if (id !== requestId.current) return;
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load fumigation logs right now."
        );
        setEntries([]);
        setTotal(0);
        setTotalPages(1);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [
      page,
      debouncedSearch,
      facilityId,
      dateFrom,
      dateTo,
      nextDueFrom,
      nextDueTo,
      sort,
    ]
  );

  useEffect(() => {
    void fetchEntries(page);
  }, [fetchEntries, page]);

  const reload = useCallback(async () => {
    await fetchEntries(page);
  }, [fetchEntries, page]);

  const reloadFirstPage = useCallback(async () => {
    if (page !== 1) {
      setPage(1);
      return;
    }
    await fetchEntries(1);
  }, [fetchEntries, page]);

  return {
    entries,
    loading,
    error,
    search,
    setSearch,
    facilityId,
    setFacilityId,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    nextDueFrom,
    setNextDueFrom,
    nextDueTo,
    setNextDueTo,
    sort,
    setSort,
    clearAll,
    page,
    setPage,
    totalPages,
    total,
    reload,
    reloadFirstPage,
  };
}
