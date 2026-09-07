"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CostRecordService } from "@/services/finance/CostRecordService";
import { CostSubmissionService } from "@/services/finance/CostSubmissionService";
import { ReimbursementAuthorizationService } from "@/services/finance/ReimbursementAuthorizationService";
import { ReimbursementPaymentService } from "@/services/finance/ReimbursementPaymentService";
import { signalHomeFinanceSettled } from "@/modules/workspace/utils/homeWorkspaceReady";
import {
  FINANCE_COST_POOL_FETCH_SIZE,
  FINANCE_OVERVIEW_FETCH_SIZE,
} from "../constants";
import {
  deriveFinancialPositionSnapshot,
  type FinancialPositionSnapshot,
  type FinancialPositionSourcePool,
} from "../utils/deriveFinancialPositionSnapshot";

/**
 * Per-source ceiling for Home Financial Position.
 * Aligned with Workspace domain settle timeout — does not change Workspace.
 */
export const HOME_FINANCE_SOURCE_TIMEOUT_MS = 25_000;

/**
 * Isolate one Finance source: success → available pool; reject/timeout/abort →
 * unavailable. Never invents 0. Does not block sibling sources.
 */
async function settleSource<T>(
  loader: (signal: AbortSignal) => Promise<{ data: T[]; total: number }>
): Promise<FinancialPositionSourcePool<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, HOME_FINANCE_SOURCE_TIMEOUT_MS);

  try {
    const result = await loader(controller.signal);
    return {
      available: true,
      data: result.data,
      total: result.total,
    };
  } catch {
    return { available: false };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Bounded Finance pools for Home Financial Position — same sizes as Finance overview.
 * Does not load Approvals (not used by the three metrics).
 *
 * Per-source settle + timeout/abort: one hung source cannot leave the strip loading.
 * Signals Home Finance settled when the load attempt finishes so notification
 * fan-out can proceed without competing for connections.
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
      const [costs, submissions, payments, authorizations] = await Promise.all([
        settleSource((signal) =>
          CostRecordService.listCostRecords(
            {
              page: 1,
              pageSize: FINANCE_COST_POOL_FETCH_SIZE,
            },
            { signal }
          )
        ),
        settleSource((signal) =>
          CostSubmissionService.listCostSubmissions(
            {
              page: 1,
              pageSize: FINANCE_OVERVIEW_FETCH_SIZE,
            },
            { signal }
          )
        ),
        settleSource((signal) =>
          ReimbursementPaymentService.listPayments(
            {
              page: 1,
              pageSize: FINANCE_OVERVIEW_FETCH_SIZE,
            },
            { signal }
          )
        ),
        settleSource((signal) =>
          ReimbursementAuthorizationService.listAuthorizations(
            {
              page: 1,
              pageSize: FINANCE_OVERVIEW_FETCH_SIZE,
            },
            { signal }
          )
        ),
      ]);

      if (id !== requestId.current) return;

      const next = deriveFinancialPositionSnapshot({
        costs,
        submissions,
        payments,
        authorizations,
      });

      const anyAvailable =
        next.spentAvailable ||
        next.expectedAvailable ||
        next.outstandingAvailable;

      setSnapshot(next);
      setError(
        anyAvailable
          ? null
          : "Unable to load financial position right now."
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
      if (id === requestId.current) {
        setLoading(false);
        signalHomeFinanceSettled();
      }
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { snapshot, loading, error, reload };
}
