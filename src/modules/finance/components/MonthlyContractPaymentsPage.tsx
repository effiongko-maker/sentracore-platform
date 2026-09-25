"use client";

import { CostsClaimsNav } from "./CostsClaimsNav";

import Link from "next/link";
import { ArrowLeft, CalendarClock, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ModeFrame, OperateHeader, StreamSurface } from "@/components/platform";
import { EmptyState } from "@/components/ui/EmptyState";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { useOperatingAccess } from "@/hooks/useOperatingAccess";
import {
  MonthlyPaymentsService,
  type ContractInstalmentPosition,
  type MonthlyContractPayment,
  type MonthlyPaymentStatusTone,
  type UnlinkedContractInstalment,
} from "@/services/finance/MonthlyPaymentsService";
import {
  formatMonthlyPaymentAmount,
  formatMonthlyPaymentDatetime,
} from "../utils/monthlyContractPayments";

/**
 * Contract Payments — ONE operational view of the contract-payment lifecycle, composed from existing records only:
 *   * the monthly FM-fee entries (read-only Platform Finance historical commercial facts: request + receipt facts);
 *   * the live contract instalment requests (FM Client Payments), whose receipts stay separate events on the request.
 * A monthly entry with a live request shows the live request's position (requested / received / outstanding); a
 * live request no entry corresponds to is its own row. Nothing is merged in storage and no relationship is guessed —
 * each row opens its own existing detail (request → follow-ups → receipts, or the historical entry).
 */

type RegisterRow = {
  key: string;
  sortKey: string;
  period: string;
  description?: string;
  requested?: number;
  received?: number;
  /** "settled" = the source marks the instalment Paid (received may be net of deductions the source does not state). */
  outstanding?: number | "settled";
  currency: string;
  requestedAt?: string;
  receivedAt?: string;
  receiptNote?: string;
  status: { label: string; tone: MonthlyPaymentStatusTone };
  href?: string;
  sourceHref?: string;
};

const LIVE_STATE: Record<ContractInstalmentPosition["state"], { label: string; tone: MonthlyPaymentStatusTone }> = {
  awaiting_receipt: { label: "Awaiting receipt", tone: "info" },
  partially_received: { label: "Partially received", tone: "warn" },
  received: { label: "Received", tone: "ok" },
};

function livePart(cp: ContractInstalmentPosition) {
  const n = cp.receiptCount ?? 0;
  return {
    requested: cp.requestedAmount,
    received: cp.receivedAmount,
    outstanding: cp.outstandingAmount,
    currency: cp.currency,
    requestedAt: cp.submittedAt,
    receivedAt: cp.lastReceiptAt,
    receiptNote: `Request ${cp.code} · ${n === 0 ? "no receipts recorded" : `${n} receipt${n === 1 ? "" : "s"}`}`,
    status: LIVE_STATE[cp.state],
    href: `/finance/submissions/${encodeURIComponent(cp.code)}`,
  };
}

function buildRows(monthly: MonthlyContractPayment[], unlinked: UnlinkedContractInstalment[]): RegisterRow[] {
  const usedCodes = new Set<string>();
  const rows: RegisterRow[] = monthly.map((m, i) => {
    const base = {
      key: `m-${m.slug ?? i}`,
      sortKey: m.slug ?? "0000-00",
      period: m.month ?? "Not established",
      sourceHref: m.slug ? `/finance/monthly-payments/${encodeURIComponent(m.slug)}` : undefined,
    };
    // The live request is the operational record of this month's instalment; counted once even if two entries map to it.
    if (m.clientPayment && !usedCodes.has(m.clientPayment.code)) {
      usedCodes.add(m.clientPayment.code);
      return { ...base, ...livePart(m.clientPayment) };
    }
    const paid = m.status?.label === "Paid";
    return {
      ...base,
      requested: m.requestedAmount,
      received: m.amountReceived,
      outstanding: paid ? "settled" : m.requestedAmount != null ? Math.max(0, m.requestedAmount - (m.amountReceived ?? 0)) : undefined,
      currency: m.currency,
      receivedAt: m.paymentDatetime,
      receiptNote: m.clientPayment ? `Same request as ${m.clientPayment.code}` : undefined,
      status: m.status ?? { label: "Not recorded", tone: "neutral" },
      href: base.sourceHref,
    };
  });
  for (const u of unlinked) {
    const live = livePart(u);
    rows.push({
      key: `u-${u.code}`,
      sortKey: (u.submittedAt ?? "0000-00").slice(0, 7),
      period: u.period ?? "Not established",
      description: u.description,
      ...live,
      status: u.status === "draft" ? { label: "Draft", tone: "neutral" } : live.status,
    });
  }
  return rows.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
}

const money = (amount: number | undefined, currency: string) => formatMonthlyPaymentAmount(amount, currency);
const shortDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Not recorded";

export function MonthlyContractPaymentsPage() {
  const { can } = useOperatingAccess();
  const [monthly, setMonthly] = useState<MonthlyContractPayment[]>([]);
  const [unlinked, setUnlinked] = useState<UnlinkedContractInstalment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // State is set only when the request settles (never synchronously inside the effect).
  const fetchRegister = useCallback(
    () =>
      MonthlyPaymentsService.register()
        .then((data) => {
          setMonthly(data.monthly);
          setUnlinked(data.unlinked);
          setError(null);
        })
        .catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : "Unable to load contract payments.");
        })
        .finally(() => setLoading(false)),
    []
  );
  const load = useCallback(() => {
    setLoading(true);
    void fetchRegister();
  }, [fetchRegister]);

  useEffect(() => {
    void fetchRegister();
  }, [fetchRegister]);

  const rows = useMemo(() => buildRows(monthly, unlinked), [monthly, unlinked]);
  const totals = useMemo(() => {
    const sum = (pick: (r: RegisterRow) => number | undefined) => rows.reduce((acc, r) => acc + (pick(r) ?? 0), 0);
    return {
      requested: sum((r) => r.requested),
      received: sum((r) => r.received),
      outstanding: sum((r) => (typeof r.outstanding === "number" ? r.outstanding : 0)),
      open: rows.filter((r) => typeof r.outstanding === "number" && r.outstanding > 0).length,
    };
  }, [rows]);

  const columns = useMemo<Column<RegisterRow>[]>(
    () => [
      {
        key: "period",
        header: "Period",
        render: (row) => (
          <div className="min-w-0">
            {row.href ? (
              <Link href={row.href} className="font-medium text-primary hover:underline">{row.period}</Link>
            ) : (
              <span className="font-medium text-foreground">{row.period}</span>
            )}
            {row.description ? <p className="line-clamp-1 text-xs text-muted" title={row.description}>{row.description}</p> : null}
          </div>
        ),
      },
      { key: "requested", header: "Requested", className: "fin-v13-num", render: (row) => money(row.requested, row.currency) },
      {
        key: "received",
        header: "Received",
        className: "fin-v13-num",
        render: (row) => (row.received == null ? <span className="text-muted">Not recorded</span> : money(row.received, row.currency)),
      },
      {
        key: "outstanding",
        header: "Outstanding",
        className: "fin-v13-num",
        render: (row) =>
          row.outstanding === "settled" ? (
            <span className="text-muted" title="Marked Paid in the source; the amount received may be net of deductions the source does not state.">Settled</span>
          ) : row.outstanding == null ? (
            <span className="text-muted">Not established</span>
          ) : (
            money(row.outstanding, row.currency)
          ),
      },
      { key: "requestedAt", header: "Requested on", render: (row) => <span className="text-muted">{shortDate(row.requestedAt)}</span> },
      {
        key: "receivedAt",
        header: "Received on",
        render: (row) => (
          <div>
            <span className="text-muted">{row.receivedAt ? formatMonthlyPaymentDatetime(row.receivedAt) : "Not recorded"}</span>
            {row.receiptNote ? <p className="text-xs text-muted">{row.receiptNote}</p> : null}
          </div>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (row) => <span className={`fin-v13-pill fin-v13-pill--${row.status.tone}`}>{row.status.label}</span>,
      },
      {
        key: "actions",
        header: "",
        className: "w-24 text-right",
        render: (row) => (
          <div className="flex flex-col items-end gap-0.5">
            {row.href ? <Link href={row.href} className="text-sm font-medium text-primary hover:underline">Open →</Link> : null}
            {row.sourceHref && row.sourceHref !== row.href ? (
              <Link href={row.sourceHref} className="text-xs text-muted hover:underline">Source entry</Link>
            ) : null}
          </div>
        ),
      },
    ],
    []
  );

  return (
    <ModeFrame mode="act">
      <div className="fin-page">
        <CostsClaimsNav />
        <div className="mb-4">
          <Link href="/finance" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back to Costs & Claims
          </Link>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <OperateHeader
            title="Contract Payments"
            description="Track contract instalments requested, received and outstanding."
            signalValue={loading ? "—" : rows.length}
            signalLabel="Instalments"
          />
          {can("finance.create") ? (
            // Raises a contract instalment REQUEST (an FM Client Payment); receipts are recorded later on the request.
            <Link className="fin-v13-btn-primary" href="/finance/client-payments/new?kind=contract_instalment">
              <Plus className="h-4 w-4" /> Raise contract instalment request
            </Link>
          ) : null}
        </div>

        <section className="fin-v13-support-metrics fin-v13-support-metrics--four mt-4" aria-label="Contract payment position">
          {[
            ["Requested", money(totals.requested, "NGN")],
            ["Received", money(totals.received, "NGN")],
            ["Outstanding", money(totals.outstanding, "NGN")],
            ["Open instalments", String(totals.open)],
          ].map(([label, value]) => (
            <div key={label} className="fin-v13-support-card">
              <div className="min-w-0">
                <p className="fin-v13-metric-label">{label}</p>
                <p className="fin-v13-support-value">{loading ? "—" : error ? "Unavailable" : value}</p>
              </div>
            </div>
          ))}
        </section>

        <StreamSurface className="mt-4">
          {error ? (
            <EmptyState icon={CalendarClock} title="Unable to load contract payments" description={error} actionLabel="Try again" onAction={load} />
          ) : (
            <DataTable
              columns={columns}
              data={rows}
              rowKey={(row) => row.key}
              loading={loading}
              emptyIcon={CalendarClock}
              emptyTitle="No contract payments recorded"
              emptyDescription="Contract instalments requested from the client, and the amounts received against them, appear here."
            />
          )}
        </StreamSurface>
      </div>
    </ModeFrame>
  );
}

export { MonthlyContractPaymentsPage as ContractPaymentsPage };
