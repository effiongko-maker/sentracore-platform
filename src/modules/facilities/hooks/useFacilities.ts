"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { FACILITIES_PAGE_SIZE } from "../constants";
import { FacilityService } from "../services/FacilityService";
import type { Facility, FacilityStatus, FacilityType } from "../types";

export function useFacilities() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatusState] = useState<FacilityStatus | "all">("all");
  const [type, setTypeState] = useState<FacilityType | "all">("all");
  const [location, setLocationState] = useState<string | "all">("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const requestId = useRef(0);
  const debouncedSearch = useDebouncedValue(search, 250);
  const previousSearch = useRef(debouncedSearch);

  const setStatus = useCallback((value: FacilityStatus | "all") => {
    setStatusState(value);
    setPage(1);
  }, []);

  const setType = useCallback((value: FacilityType | "all") => {
    setTypeState(value);
    setPage(1);
  }, []);

  const setLocation = useCallback((value: string | "all") => {
    setLocationState(value);
    setPage(1);
  }, []);

  useEffect(() => {
    if (previousSearch.current !== debouncedSearch) {
      previousSearch.current = debouncedSearch;
      setPage(1);
    }
  }, [debouncedSearch]);

  const fetchFacilities = useCallback(
    async (nextPage = page) => {
      const id = ++requestId.current;
      setLoading(true);
      setError(null);

      try {
        const result = await FacilityService.listFacilities({
          page: nextPage,
          pageSize: FACILITIES_PAGE_SIZE,
          search: debouncedSearch,
          status,
          type,
          location,
        });

        if (id !== requestId.current) return;

        setFacilities(result.data);
        setTotalPages(result.totalPages);
        setTotal(result.total);
      } catch (err) {
        if (id !== requestId.current) return;
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load facilities right now."
        );
        setFacilities([]);
        setTotal(0);
        setTotalPages(1);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [page, debouncedSearch, status, type, location]
  );

  useEffect(() => {
    fetchFacilities(page);
  }, [fetchFacilities, page]);

  const deactivateFacility = useCallback(async (id: string) => {
    return FacilityService.deactivateFacility(id);
  }, []);

  return {
    facilities,
    loading,
    error,
    search,
    setSearch,
    status,
    setStatus,
    type,
    setType,
    location,
    setLocation,
    page,
    setPage,
    totalPages,
    total,
    reload: () => fetchFacilities(page),
    deactivateFacility,
  };
}
