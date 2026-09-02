"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApprovalService } from "@/modules/approvals/services/ApprovalService";
import { CostRecordService } from "@/services/finance/CostRecordService";
import {
  FINANCE_COST_LIST_PAGE_SIZE,
  FINANCE_OVERVIEW_FETCH_SIZE,
} from "../constants";
import type { FinanceOverview } from "../types";
import { deriveFinanceOverview } from "../utils/deriveFinanceOverview";

export function useFinanceOverview() {
  const [overview, setOverview] = useState<FinanceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);

    try {
      const [approvalResult, costResult] = await Promise.all([
        ApprovalService.listApprovals({
          page: 1,
          pageSize: FINANCE_OVERVIEW_FETCH_SIZE,
          status: "all",
          sort: "newest",
        }),
        CostRecordService.listCostRecords({
          page: 1,
          pageSize: FINANCE_COST_LIST_PAGE_SIZE,
        }),
      ]);

      if (id !== requestId.current) return;

      setOverview(
        deriveFinanceOverview(
          approvalResult.data,
          costResult.data,
          {
            totalApprovals: approvalResult.total,
            truncated: approvalResult.total > approvalResult.data.length,
          }
        )
      );
    } catch (err) {
      if (id !== requestId.current) return;
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load finance overview right now."
      );
      setOverview(null);
    } finally {
      if (id === requestId.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { overview, loading, error, reload };
}
