"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { MasterDataService } from "@/services/masterData/MasterDataService";
import { MASTER_DATA_PAGE_SIZE } from "../constants";
import type {
  MasterDataEntity,
  MasterDataItem,
  MasterDataStatus,
} from "../types";

export function useMasterData(entity: MasterDataEntity) {
  const [items, setItems] = useState<MasterDataItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatusState] = useState<MasterDataStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const requestId = useRef(0);
  const debouncedSearch = useDebouncedValue(search, 250);
  const previousSearch = useRef(debouncedSearch);
  const previousEntity = useRef(entity);

  const setStatus = useCallback((value: MasterDataStatus | "all") => {
    setStatusState(value);
    setPage(1);
  }, []);

  useEffect(() => {
    if (previousEntity.current !== entity) {
      previousEntity.current = entity;
      setSearch("");
      setStatusState("all");
      setPage(1);
    }
  }, [entity]);

  useEffect(() => {
    if (previousSearch.current !== debouncedSearch) {
      previousSearch.current = debouncedSearch;
      setPage(1);
    }
  }, [debouncedSearch]);

  const fetchItems = useCallback(
    async (nextPage = page) => {
      const id = ++requestId.current;
      setLoading(true);
      setError(null);

      try {
        const result = await MasterDataService.list({
          entity,
          page: nextPage,
          pageSize: MASTER_DATA_PAGE_SIZE,
          search: debouncedSearch,
          status,
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
            : "Unable to load master data right now."
        );
        setItems([]);
        setTotal(0);
        setTotalPages(1);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [entity, page, debouncedSearch, status]
  );

  useEffect(() => {
    fetchItems(page);
  }, [fetchItems, page]);

  const deactivateItem = useCallback(
    async (id: string) => MasterDataService.deactivate(entity, id),
    [entity]
  );

  return {
    items,
    loading,
    error,
    search,
    setSearch,
    status,
    setStatus,
    page,
    setPage,
    totalPages,
    total,
    reload: () => fetchItems(page),
    deactivateItem,
  };
}
