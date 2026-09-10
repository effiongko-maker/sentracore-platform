"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  CONSUMABLES_UPDATE_PAGE_SIZE,
  DEFAULT_CONSUMABLES_UPDATE_SORT,
} from "../constants";
import { ConsumablesUpdateService } from "../services/ConsumablesUpdateService";
import type { ConsumablesUpdate, ConsumablesUpdateSort } from "../types";

export function useConsumablesUpdates() {
  const [entries, setEntries] = useState<ConsumablesUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [facilityId, setFacilityIdState] = useState("");
  const [itemName, setItemNameState] = useState("");
  const [dateFrom, setDateFromState] = useState("");
  const [dateTo, setDateToState] = useState("");
  const [sort, setSortState] = useState<ConsumablesUpdateSort>(
    DEFAULT_CONSUMABLES_UPDATE_SORT
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

  const setItemName = useCallback((value: string) => {
    setItemNameState(value);
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

  const setSort = useCallback((value: ConsumablesUpdateSort) => {
    setSortState(value);
    setPage(1);
  }, []);

  const clearAll = useCallback(() => {
    setSearch("");
    setFacilityIdState("");
    setItemNameState("");
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
        const itemFilter = itemName.trim();
        const result = await ConsumablesUpdateService.listConsumablesUpdates({
          page: nextPage,
          pageSize: CONSUMABLES_UPDATE_PAGE_SIZE,
          search: debouncedSearch,
          facilityId: facilityFilter ? facilityFilter : "all",
          itemName: itemFilter ? itemFilter : "all",
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
            : "Unable to load consumables updates right now."
        );
        setEntries([]);
        setTotal(0);
        setTotalPages(1);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [page, debouncedSearch, facilityId, itemName, dateFrom, dateTo, sort]
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
    itemName,
    setItemName,
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
