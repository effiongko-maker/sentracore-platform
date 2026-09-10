"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  DEFAULT_GENERATOR_LOG_SORT,
  GENERATOR_LOG_PAGE_SIZE,
} from "../constants";
import { GeneratorLogService } from "../services/GeneratorLogService";
import type { GeneratorLog, GeneratorLogSort } from "../types";

export function useGeneratorLogs() {
  const [entries, setEntries] = useState<GeneratorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [generator, setGeneratorState] = useState("");
  const [dateFrom, setDateFromState] = useState("");
  const [dateTo, setDateToState] = useState("");
  const [sort, setSortState] = useState<GeneratorLogSort>(
    DEFAULT_GENERATOR_LOG_SORT
  );
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const requestId = useRef(0);
  const debouncedSearch = useDebouncedValue(search, 250);
  const previousSearch = useRef(debouncedSearch);

  const setGenerator = useCallback((value: string) => {
    setGeneratorState(value);
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

  const setSort = useCallback((value: GeneratorLogSort) => {
    setSortState(value);
    setPage(1);
  }, []);

  const clearAll = useCallback(() => {
    setSearch("");
    setGeneratorState("");
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
        const generatorFilter = generator.trim();
        const result = await GeneratorLogService.listGeneratorLogs({
          page: nextPage,
          pageSize: GENERATOR_LOG_PAGE_SIZE,
          search: debouncedSearch,
          generator: generatorFilter ? generatorFilter : "all",
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
            : "Unable to load generator logs right now."
        );
        setEntries([]);
        setTotal(0);
        setTotalPages(1);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [page, debouncedSearch, generator, dateFrom, dateTo, sort]
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
    generator,
    setGenerator,
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
