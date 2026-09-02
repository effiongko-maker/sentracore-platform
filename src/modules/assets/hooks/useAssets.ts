"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { ASSETS_PAGE_SIZE, DEFAULT_ASSET_SORT } from "../constants";
import { AssetService } from "../services/AssetService";
import type { Asset, AssetCategory, AssetSort, AssetStatus } from "../types";

export function useAssets() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatusState] = useState<AssetStatus | "all">("all");
  const [category, setCategoryState] = useState<AssetCategory | "all">("all");
  const [facility, setFacilityState] = useState<string | "all">("all");
  const [sort, setSortState] = useState<AssetSort>(DEFAULT_ASSET_SORT);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const requestId = useRef(0);
  const debouncedSearch = useDebouncedValue(search, 250);
  const previousSearch = useRef(debouncedSearch);

  const setStatus = useCallback((value: AssetStatus | "all") => {
    setStatusState(value);
    setPage(1);
  }, []);

  const setCategory = useCallback((value: AssetCategory | "all") => {
    setCategoryState(value);
    setPage(1);
  }, []);

  const setFacility = useCallback((value: string | "all") => {
    setFacilityState(value);
    setPage(1);
  }, []);

  const setSort = useCallback((value: AssetSort) => {
    setSortState(value);
    setPage(1);
  }, []);

  const clearAll = useCallback(() => {
    setSearch("");
    setStatusState("all");
    setCategoryState("all");
    setFacilityState("all");
    setPage(1);
  }, []);

  useEffect(() => {
    if (previousSearch.current !== debouncedSearch) {
      previousSearch.current = debouncedSearch;
      setPage(1);
    }
  }, [debouncedSearch]);

  const fetchAssets = useCallback(
    async (nextPage = page) => {
      const id = ++requestId.current;
      setLoading(true);
      setError(null);

      try {
        const result = await AssetService.listAssets({
          page: nextPage,
          pageSize: ASSETS_PAGE_SIZE,
          search: debouncedSearch,
          status,
          category,
          facility,
          sort,
        });

        if (id !== requestId.current) return;

        setAssets(result.data);
        setTotalPages(result.totalPages);
        setTotal(result.total);
        if (result.page !== nextPage) {
          setPage(result.page);
        }

        void AssetService.enrichAssetsWorkload(result.data).then((enriched) => {
          if (id !== requestId.current) return;
          setAssets(enriched);
        });
      } catch (err) {
        if (id !== requestId.current) return;
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load assets right now."
        );
        setAssets([]);
        setTotal(0);
        setTotalPages(1);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [page, debouncedSearch, status, category, facility, sort]
  );

  useEffect(() => {
    void fetchAssets(page);
  }, [fetchAssets, page]);

  const deactivateAsset = useCallback(async (id: string) => {
    return AssetService.deactivateAsset(id);
  }, []);

  const reload = useCallback(async () => {
    await fetchAssets(page);
  }, [fetchAssets, page]);

  /** After create/update — always return to page 1 (newest-friendly). */
  const reloadFirstPage = useCallback(async () => {
    if (page !== 1) {
      setPage(1);
      return;
    }
    await fetchAssets(1);
  }, [fetchAssets, page]);

  return {
    assets,
    loading,
    error,
    search,
    setSearch,
    status,
    setStatus,
    category,
    setCategory,
    facility,
    setFacility,
    sort,
    setSort,
    clearAll,
    page,
    setPage,
    totalPages,
    total,
    reload,
    reloadFirstPage,
    deactivateAsset,
  };
}
