"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  APPROVALS_PAGE_SIZE,
  DEFAULT_APPROVAL_SORT,
} from "../constants";
import { ApprovalService } from "../services/ApprovalService";
import { sortApprovals } from "../utils";
import type { Approval, ApprovalSort, ApprovalStatus, ApprovalType } from "../types";

export function useApprovals(initialWorkOrderId?: string) {
  const [items, setItems] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatusState] = useState<ApprovalStatus | "all">("all");
  const [type, setTypeState] = useState<ApprovalType | "all">("all");
  const [facilityId, setFacilityIdState] = useState<string | "all">("all");
  const [workOrderId, setWorkOrderIdState] = useState<string | "all">(
    initialWorkOrderId ?? "all"
  );
  const [sort, setSortState] = useState<ApprovalSort>(DEFAULT_APPROVAL_SORT);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const requestId = useRef(0);
  const debouncedSearch = useDebouncedValue(search, 250);
  const previousSearch = useRef(debouncedSearch);

  const setStatus = useCallback((value: ApprovalStatus | "all") => {
    setStatusState(value);
    setPage(1);
  }, []);

  const setType = useCallback((value: ApprovalType | "all") => {
    setTypeState(value);
    setPage(1);
  }, []);

  const setFacilityId = useCallback((value: string | "all") => {
    setFacilityIdState(value);
    setPage(1);
  }, []);

  const setWorkOrderId = useCallback((value: string | "all") => {
    setWorkOrderIdState(value);
    setPage(1);
  }, []);

  const setSort = useCallback((value: ApprovalSort) => {
    setSortState(value);
    setPage(1);
  }, []);

  const clearAll = useCallback(() => {
    setSearch("");
    setStatusState("all");
    setTypeState("all");
    setFacilityIdState("all");
    setWorkOrderIdState("all");
    setPage(1);
  }, []);

  const fetchApprovals = useCallback(
    async (nextPage = page) => {
      const id = ++requestId.current;
      setLoading(true);
      setError(null);
      let keepLoadingForPageClamp = false;

      try {
        const result = await ApprovalService.listApprovals({
          page: nextPage,
          pageSize: APPROVALS_PAGE_SIZE,
          search: debouncedSearch,
          status,
          type,
          facilityId,
          workOrderId,
          sort,
        });

        if (id !== requestId.current) return;

        if (
          result.data.length === 0 &&
          result.total > 0 &&
          nextPage > result.totalPages
        ) {
          setTotalPages(result.totalPages);
          setTotal(result.total);
          keepLoadingForPageClamp = true;
          setPage(Math.max(1, result.totalPages));
          return;
        }

        setItems(sortApprovals(result.data, sort));
        setTotalPages(result.totalPages);
        setTotal(result.total);
      } catch (err) {
        if (id !== requestId.current) return;
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load approvals right now."
        );
        setItems([]);
        setTotal(0);
        setTotalPages(1);
      } finally {
        if (id === requestId.current && !keepLoadingForPageClamp) {
          setLoading(false);
        }
      }
    },
    [
      page,
      debouncedSearch,
      status,
      type,
      facilityId,
      workOrderId,
      sort,
    ]
  );

  useEffect(() => {
    if (previousSearch.current !== debouncedSearch) {
      previousSearch.current = debouncedSearch;
      if (page !== 1) {
        setPage(1);
        return;
      }
    }
    void fetchApprovals(page);
  }, [fetchApprovals, page, debouncedSearch]);

  useEffect(() => {
    if (totalPages >= 1 && page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const deactivateApproval = useCallback(async (id: string) => {
    return ApprovalService.deactivateApproval(id);
  }, []);

  const reload = useCallback(async () => {
    await fetchApprovals(page);
  }, [fetchApprovals, page]);

  const reloadFirstPage = useCallback(async () => {
    if (page !== 1) {
      setPage(1);
      return;
    }
    await fetchApprovals(1);
  }, [fetchApprovals, page]);

  return {
    items,
    loading,
    error,
    search,
    setSearch,
    status,
    setStatus,
    type,
    setType,
    facilityId,
    setFacilityId,
    workOrderId,
    setWorkOrderId,
    sort,
    setSort,
    clearAll,
    page,
    setPage,
    totalPages,
    total,
    reload,
    reloadFirstPage,
    deactivateApproval,
  };
}
