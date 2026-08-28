"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { REQUESTS_PAGE_SIZE } from "../constants";
import { RequestService } from "../services/RequestService";
import type { RequestRecord, RequestStatus } from "../types";

export function useRequests() {
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatusState] = useState<RequestStatus | "all">("all");
  const [facilityId, setFacilityIdState] = useState<string | "all">("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const requestId = useRef(0);
  const debouncedSearch = useDebouncedValue(search, 250);
  const previousSearch = useRef(debouncedSearch);

  const setStatus = useCallback((value: RequestStatus | "all") => {
    setStatusState(value);
    setPage(1);
  }, []);

  const setFacilityId = useCallback((value: string | "all") => {
    setFacilityIdState(value);
    setPage(1);
  }, []);

  useEffect(() => {
    if (previousSearch.current !== debouncedSearch) {
      previousSearch.current = debouncedSearch;
      setPage(1);
    }
  }, [debouncedSearch]);

  const fetchRequests = useCallback(
    async (nextPage = page) => {
      const id = ++requestId.current;
      setLoading(true);
      setError(null);

      try {
        const result = await RequestService.listRequests({
          page: nextPage,
          pageSize: REQUESTS_PAGE_SIZE,
          search: debouncedSearch,
          status,
          facilityId,
        });

        if (id !== requestId.current) return;

        setRequests(result.data);
        setTotalPages(result.totalPages);
        setTotal(result.total);
      } catch (err) {
        if (id !== requestId.current) return;
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load requests right now."
        );
        setRequests([]);
        setTotal(0);
        setTotalPages(1);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [page, debouncedSearch, status, facilityId]
  );

  useEffect(() => {
    void fetchRequests(page);
  }, [fetchRequests, page]);

  const deactivateRequest = useCallback(async (id: string) => {
    return RequestService.deactivateRequest(id);
  }, []);

  return {
    requests,
    loading,
    error,
    search,
    setSearch,
    status,
    setStatus,
    facilityId,
    setFacilityId,
    page,
    setPage,
    totalPages,
    total,
    reload: () => fetchRequests(page),
    deactivateRequest,
  };
}
