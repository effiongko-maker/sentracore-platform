"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CostRecord } from "@/lib/operational/finance/types";
import { CostRecordService } from "@/services/finance/CostRecordService";
import { FINANCE_OVERVIEW_FETCH_SIZE } from "../constants";
import { partitionCostsForSubmission } from "../utils/submissionEligibility";

export function useSubmissionCostPool() {
  const [records, setRecords] = useState<CostRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await CostRecordService.listCostRecords({
        page: 1,
        pageSize: FINANCE_OVERVIEW_FETCH_SIZE,
      });
      if (id !== requestId.current) return;
      setRecords(result.data);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load costs for submission."
      );
      setRecords([]);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pool = partitionCostsForSubmission(records);

  return {
    records,
    ...pool,
    loading,
    error,
    reload: load,
  };
}
