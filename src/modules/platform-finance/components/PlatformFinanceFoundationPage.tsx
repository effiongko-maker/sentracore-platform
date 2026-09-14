"use client";

import { useEffect, useState } from "react";
import { PlatformFinanceService } from "@/services/platform-finance/PlatformFinanceService";
import type { FinanceFoundationStatus } from "@/modules/platform-finance/types";

/**
 * Minimal Phase 1 technical status surface — no KPIs or fake dashboard numbers.
 */
export function PlatformFinanceFoundationPage() {
  const [status, setStatus] = useState<FinanceFoundationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void PlatformFinanceService.getFoundationStatus()
      .then((data) => {
        if (!cancelled) {
          setStatus(data);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load Platform Finance status."
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Platform Finance
        </h1>
        <p className="mt-3 text-sm text-red-700">{error}</p>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Platform Finance
        </h1>
        <p className="mt-3 text-sm text-zinc-500">Loading foundation status…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
        Platform Finance
      </h1>
      <p className="mt-2 text-sm text-zinc-600">
        Phase 1 foundation — companies, access, periods, chart of accounts,
        financial transactions, journal posting, and audit.
      </p>

      <dl className="mt-8 space-y-3 border-t border-zinc-200 pt-6 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-500">Module</dt>
          <dd className="font-mono text-zinc-900">{status.module}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-500">Phase</dt>
          <dd className="text-zinc-900">{status.phase}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-500">Persistence</dt>
          <dd className="text-zinc-900">{status.persistence}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-500">Ready</dt>
          <dd className="text-zinc-900">{status.ready ? "yes" : "no"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-500">Companies (seeded)</dt>
          <dd className="tabular-nums text-zinc-900">{status.companies}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-500">Accounts (COA)</dt>
          <dd className="tabular-nums text-zinc-900">{status.accounts}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-500">Open periods</dt>
          <dd className="tabular-nums text-zinc-900">{status.openPeriods}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-500">Draft transactions</dt>
          <dd className="tabular-nums text-zinc-900">
            {status.draftTransactions}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-500">Posted transactions</dt>
          <dd className="tabular-nums text-zinc-900">
            {status.postedTransactions}
          </dd>
        </div>
      </dl>
    </div>
  );
}
