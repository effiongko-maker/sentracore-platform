"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CostRecordService } from "@/services/finance/CostRecordService";
import { CostSubmissionService } from "@/services/finance/CostSubmissionService";
import { ReimbursementAuthorizationService } from "@/services/finance/ReimbursementAuthorizationService";
import { ReimbursementPaymentService } from "@/services/finance/ReimbursementPaymentService";
import {
  FINANCE_COST_POOL_FETCH_SIZE,
  FINANCE_OVERVIEW_FETCH_SIZE,
} from "../constants";
import {
  deriveFinancialPositionSnapshot,
  type FinancialPositionSnapshot,
} from "../utils/deriveFinancialPositionSnapshot";

/**
 * Bounded Finance pools for Home Financial Position — same sizes as Finance overview.
 * Does not load Approvals (not used by the three metrics).
 */
export function useFinancialPosition() {
  const [snapshot, setSnapshot] = useState<FinancialPositionSnapshot | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);

    try {
      const [
        costResult,
        submissionResult,
        paymentResult,
        authorizationResult,
      ] = await Promise.all([
        CostRecordService.listCostRecords({
          page: 1,
          pageSize: FINANCE_COST_POOL_FETCH_SIZE,
        }),
        CostSubmissionService.listCostSubmissions({
          page: 1,
          pageSize: FINANCE_OVERVIEW_FETCH_SIZE,
        }),
        ReimbursementPaymentService.listPayments({
          page: 1,
          pageSize: FINANCE_OVERVIEW_FETCH_SIZE,
        }),
        ReimbursementAuthorizationService.listAuthorizations({
          page: 1,
          pageSize: FINANCE_OVERVIEW_FETCH_SIZE,
        }),
      ]);

      if (id !== requestId.current) return;

      setSnapshot(
        deriveFinancialPositionSnapshot({
          costRecords: costResult.data,
          totalCostRecords: costResult.total,
          submissions: submissionResult.data,
          totalSubmissions: submissionResult.total,
          payments: paymentResult.data,
          totalPayments: paymentResult.total,
          authorizations: authorizationResult.data,
          totalAuthorizations: authorizationResult.total,
        })
      );
    } catch (err) {
      if (id !== requestId.current) return;
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load financial position right now."
      );
      setSnapshot(null);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { snapshot, loading, error, reload };
}
