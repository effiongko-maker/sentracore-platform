"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApprovalService } from "@/modules/approvals/services/ApprovalService";
import { CostRecordService } from "@/services/finance/CostRecordService";
import { CostSubmissionService } from "@/services/finance/CostSubmissionService";
import { ReimbursementAuthorizationService } from "@/services/finance/ReimbursementAuthorizationService";
import { ReimbursementPaymentService } from "@/services/finance/ReimbursementPaymentService";
import {
  FINANCE_COST_POOL_FETCH_SIZE,
  FINANCE_OPERATING_YEAR,
  FINANCE_OVERVIEW_FETCH_SIZE,
} from "../constants";
import type { FinanceOverview } from "../types";
import { deriveFinanceOverview } from "../utils/deriveFinanceOverview";

const SOURCE_TIMEOUT_MS = 25_000;

async function settleSource<T>(
  loader: (signal: AbortSignal) => Promise<{ data: T[]; total: number }>
): Promise<{ available: true; data: T[]; total: number } | { available: false }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);
  try {
    const result = await loader(controller.signal);
    return { available: true, data: result.data, total: result.total };
  } catch {
    return { available: false };
  } finally {
    clearTimeout(timer);
  }
}

export function useFinanceOverview() {
  const [overview, setOverview] = useState<FinanceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);

    const [
      approvalResult,
      costResult,
      costTotalsResult,
      yearTotalsResult,
      submissionResult,
      paymentResult,
      authorizationResult,
    ] = await Promise.all([
      settleSource((signal) =>
        ApprovalService.listApprovals(
          {
            page: 1,
            pageSize: FINANCE_OVERVIEW_FETCH_SIZE,
            status: "all",
            sort: "newest",
          },
          { signal }
        )
      ),
      settleSource((signal) =>
        CostRecordService.listCostRecords(
          { page: 1, pageSize: FINANCE_COST_POOL_FETCH_SIZE },
          { signal }
        )
      ),
      // The authoritative headline total: the COMPLETE register, never the bounded preview pool above.
      (async (): Promise<{ available: true; data: Awaited<ReturnType<typeof CostRecordService.getTotals>> } | { available: false }> => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);
        try {
          const data = await CostRecordService.getTotals({ signal: controller.signal });
          return { available: true, data };
        } catch {
          return { available: false };
        } finally {
          clearTimeout(timer);
        }
      })(),
      // Headline: the operating year's complete-register total (same year classification as Home).
      (async (): Promise<{ available: true; data: Awaited<ReturnType<typeof CostRecordService.getOperatingYearTotals>> } | { available: false }> => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);
        try {
          const data = await CostRecordService.getOperatingYearTotals(FINANCE_OPERATING_YEAR, { signal: controller.signal });
          return { available: true, data };
        } catch {
          return { available: false };
        } finally {
          clearTimeout(timer);
        }
      })(),
      settleSource((signal) =>
        CostSubmissionService.listCostSubmissions(
          { page: 1, pageSize: FINANCE_OVERVIEW_FETCH_SIZE },
          { signal }
        )
      ),
      settleSource((signal) =>
        ReimbursementPaymentService.listPayments(
          { page: 1, pageSize: FINANCE_OVERVIEW_FETCH_SIZE },
          { signal }
        )
      ),
      settleSource((signal) =>
        ReimbursementAuthorizationService.listAuthorizations(
          { page: 1, pageSize: FINANCE_OVERVIEW_FETCH_SIZE },
          { signal }
        )
      ),
    ]);

    if (id !== requestId.current) return;

    const allFailed =
      !approvalResult.available &&
      !costResult.available &&
      !submissionResult.available &&
      !paymentResult.available &&
      !authorizationResult.available;

    if (allFailed) {
      setError("Unable to load finance overview right now.");
      setOverview(null);
      setLoading(false);
      return;
    }

    setOverview(
      deriveFinanceOverview({
        approvals: approvalResult.available ? approvalResult.data : [],
        totalApprovals: approvalResult.available ? approvalResult.total : 0,
        approvalsAvailable: approvalResult.available,
        costRecords: costResult.available ? costResult.data : [],
        totalCostRecords: costResult.available ? costResult.total : 0,
        costRecordsAvailable: costResult.available,
        costTotals: costTotalsResult.available ? costTotalsResult.data : null,
        operatingYearCostTotals: yearTotalsResult.available
          ? {
              year: yearTotalsResult.data.operatingYear,
              totalCount: yearTotalsResult.data.totalCount,
              totalAmount: yearTotalsResult.data.totalAmount,
              currency: yearTotalsResult.data.currency,
            }
          : null,
        submissions: submissionResult.available ? submissionResult.data : [],
        totalSubmissions: submissionResult.available
          ? submissionResult.total
          : 0,
        submissionsAvailable: submissionResult.available,
        payments: paymentResult.available ? paymentResult.data : [],
        totalPayments: paymentResult.available ? paymentResult.total : 0,
        paymentsAvailable: paymentResult.available,
        authorizations: authorizationResult.available
          ? authorizationResult.data
          : [],
        authorizationsAvailable: authorizationResult.available,
      })
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { overview, loading, error, reload };
}
