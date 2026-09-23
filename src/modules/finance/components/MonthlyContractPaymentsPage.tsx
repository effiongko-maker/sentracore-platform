"use client";

import Link from "next/link";
import { ArrowLeft, CalendarClock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ModeFrame, OperateHeader, StreamSurface } from "@/components/platform";
import { EmptyState } from "@/components/ui/EmptyState";
import { DataTable, type Column } from "@/components/tables/DataTable";
import {
  MonthlyPaymentsService,
  type MonthlyContractPayment,
} from "@/services/finance/MonthlyPaymentsService";
import {
  formatMonthlyPaymentAmount,
  formatMonthlyPaymentDatetime,
} from "../utils/monthlyContractPayments";

/**
 * Full register for the fixed monthly FM fee under the NCC contract — a read-only
 * projection of Platform Finance historical commercial facts (see the API route's
 * own doc comment). The compact Home/overview card remains a useful snapshot; this
 * is the complete, openable-into-detail register.
 *
 * The whole (small, unpaginated) list is fetched client-side, same as the existing
 * card — there is no server-side pagination to reuse here, and none is needed yet.
 */
export function MonthlyContractPaymentsPage() {
  const [rows, setRows] = useState<MonthlyContractPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useMemo(
    () => () => {
      setLoading(true);
      setError(null);
      MonthlyPaymentsService.list()
        .then((data) => {
          setRows(data);
          setLoading(false);
        })
        .catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : "Unable to load monthly contract payments.");
          setLoading(false);
        });
    },
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  const columns = useMemo<Column<MonthlyContractPayment>[]>(
    () => [
      {
        key: "month",
        header: "Period",
        render: (row) => (
          <span className="font-medium text-foreground">{row.month ?? "Not established"}</span>
        ),
      },
      {
        key: "requestedAmount",
        header: "Requested",
        className: "fin-v13-num",
        render: (row) => formatMonthlyPaymentAmount(row.requestedAmount, row.currency),
      },
      {
        key: "amountReceived",
        header: "Received",
        className: "fin-v13-num",
        render: (row) => formatMonthlyPaymentAmount(row.amountReceived, row.currency),
      },
      {
        key: "submissionDate",
        header: "Submission date",
        // Not present in the source data today for any record — an honest "Not recorded" rather than an
        // invented request date or the import timestamp. Kept as its own column so a future native "Submitted"
        // lifecycle event (see the API route's doc comment) has somewhere truthful to land.
        render: () => <span className="text-muted">Not recorded</span>,
      },
      {
        key: "paymentDatetime",
        header: "Payment date",
        render: (row) => formatMonthlyPaymentDatetime(row.paymentDatetime),
      },
      {
        key: "status",
        header: "Status",
        render: (row) => (
          <div>
            <span className={`fin-v13-pill fin-v13-pill--${row.status?.tone ?? "neutral"}`}>
              {row.status?.label ?? "Not recorded"}
            </span>
            {row.clientPayment ? (
              // Live FM Client Payment for this instalment — its receipt state, not the historical source status.
              <p className="text-xs text-muted">
                <Link href={`/finance/submissions/${encodeURIComponent(row.clientPayment.code)}`} className="text-primary hover:underline">
                  Client payment
                </Link>
                {" · "}
                {row.clientPayment.state === "received"
                  ? "Received"
                  : `${row.clientPayment.state === "awaiting_receipt" ? "Awaiting receipt" : "Partially received"} · ${formatMonthlyPaymentAmount(row.clientPayment.outstandingAmount, row.clientPayment.currency)} outstanding`}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        key: "actions",
        header: "",
        className: "w-24 text-right",
        render: (row) =>
          row.slug ? (
            <Link
              href={`/finance/monthly-payments/${encodeURIComponent(row.slug)}`}
              className="text-sm font-medium text-primary hover:underline"
            >
              Open →
            </Link>
          ) : (
            <span className="text-xs text-muted">Not available</span>
          ),
      },
    ],
    []
  );

  return (
    <ModeFrame mode="act">
      <div className="mb-4">
        <Link
          href="/finance"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Costs & Claims
        </Link>
      </div>
      <OperateHeader
        title="Monthly contract payments"
        signalValue={loading ? "—" : rows.length}
        signalLabel="Recorded"
      />
      <StreamSurface className="mt-4">
        {error ? (
          <EmptyState
            icon={CalendarClock}
            title="Unable to load monthly contract payments"
            description={error}
            actionLabel="Try again"
            onAction={load}
          />
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            rowKey={(row) => row.slug ?? row.month ?? row.paymentDatetime ?? "row"}
            loading={loading}
            emptyIcon={CalendarClock}
            emptyTitle="No monthly contract payments recorded"
            emptyDescription="Monthly instalment payments recorded against the NCC facility management contract will appear here."
          />
        )}
      </StreamSurface>
    </ModeFrame>
  );
}
