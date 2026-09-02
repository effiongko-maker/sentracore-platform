"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CostSubmission } from "@/lib/operational/finance/types";
import type { PaginatedResult } from "@/types";
import { CostSubmissionService } from "@/services/finance/CostSubmissionService";
import type { CostSubmissionListParams } from "@/services/finance/CostSubmissionService";

const DEFAULT_PAGE_SIZE = 25;

export function useCostSubmissionsList(
  params: CostSubmissionListParams = {}
) {
  const [result, setResult] = useState<PaginatedResult<CostSubmission> | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const data = await CostSubmissionService.listCostSubmissions({
        ...params,
        page,
        pageSize,
      });
      if (id !== requestId.current) return;
      setResult(data);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load reimbursement submissions."
      );
      setResult(null);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [page, pageSize, params.search, params.status, params.facilityId]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    submissions: result?.data ?? [],
    total: result?.total ?? 0,
    totalPages: result?.totalPages ?? 1,
    page,
    loading,
    error,
    reload: load,
  };
}
