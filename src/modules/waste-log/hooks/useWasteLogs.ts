"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  DEFAULT_WASTE_LOG_SORT,
  WASTE_LOG_PAGE_SIZE,
} from "../constants";
import { WasteLogService } from "../services/WasteLogService";
import type { WasteLog, WasteLogSort } from "../types";

export function useWasteLogs() {
  const [entries, setEntries] = useState<WasteLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [facilityId, setFacilityIdState] = useState("");
  const [wasteType, setWasteTypeState] = useState("");
  const [dateFrom, setDateFromState] = useState("");
  const [dateTo, setDateToState] = useState("");
  const [sort, setSortState] = useState<WasteLogSort>(DEFAULT_WASTE_LOG_SORT);
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

  const setWasteType = useCallback((value: string) => {
    setWasteTypeState(value);
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

  const setSort = useCallback((value: WasteLogSort) => {
    setSortState(value);
    setPage(1);
  }, []);

  const clearAll = useCallback(() => {
    setSearch("");
    setFacilityIdState("");
    setWasteTypeState("");
    setDateFromState("");
    setDateToState("");
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
        const wasteTypeFilter = wasteType.trim();
        const result = await WasteLogService.listWasteLogs({
          page: nextPage,
          pageSize: WASTE_LOG_PAGE_SIZE,
          search: debouncedSearch,
          facilityId: facilityFilter ? facilityFilter : "all",
          wasteType: wasteTypeFilter ? wasteTypeFilter : "all",
          dateFrom: dateFrom.trim() || undefined,
          dateTo: dateTo.trim() || undefined,
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
            : "Unable to load waste logs right now."
        );
        setEntries([]);
        setTotal(0);
        setTotalPages(1);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [page, debouncedSearch, facilityId, wasteType, dateFrom, dateTo, sort]
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
    wasteType,
    setWasteType,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
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
