"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MonthlyPaymentsService, type MonthlyContractPayment } from "@/services/finance/MonthlyPaymentsService";
import {
  formatMonthlyPaymentAmount,
  formatMonthlyPaymentDatetime,
} from "../utils/monthlyContractPayments";

/**
 * Fixed monthly FM fee under the NCC contract — a governed, read-only projection of Platform Finance historical
 * commercial facts identified by their own source description text. Never a duplicate transaction; no value is
 * stored in FM. Self-contained (own fetch) so it doesn't touch the shared Finance Overview composition.
 *
 * This is the compact Home/overview snapshot only. The full register (sortable, one row per period, openable
 * into a detail view) lives at /finance/monthly-payments.
 */
export function MonthlyContractPaymentsSection() {
  const [rows, setRows] = useState<MonthlyContractPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    MonthlyPaymentsService.list()
      .then((data) => {
        if (!cancelled) {
          setRows(data);
          setLoading(false);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Unable to load monthly contract payments.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="fin-v13-panel">
      <div className="fin-v13-section-head">
        <div>
          <h2 className="fin-v13-section-title">Monthly contract payments</h2>
        </div>
        <Link href="/finance/monthly-payments" className="fin-v13-text-action">
          View all →
        </Link>
      </div>

      {loading ? (
        <div className="fin-v13-skel-block" />
      ) : error ? (
        <p className="fin-v13-empty">{error}</p>
      ) : rows.length > 0 ? (
        <table className="fin-v13-table fin-v13-table--compact">
          <thead>
            <tr>
              <th>Month</th>
              <th className="fin-v13-num">Requested</th>
              <th className="fin-v13-num">Received</th>
              <th>Status</th>
              <th>Payment date/time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.slug ?? row.month ?? i}>
                <td>{row.month ?? "Not established"}</td>
                <td className="fin-v13-num">{formatMonthlyPaymentAmount(row.requestedAmount, row.currency)}</td>
                <td className="fin-v13-num">{formatMonthlyPaymentAmount(row.amountReceived, row.currency)}</td>
                <td>
                  <span className={`fin-v13-pill fin-v13-pill--${row.status?.tone ?? "neutral"}`}>
                    {row.status?.label ?? "Not recorded"}
                  </span>
                </td>
                <td className="fin-v13-muted">{formatMonthlyPaymentDatetime(row.paymentDatetime)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="fin-v13-empty">No monthly contract payments recorded.</p>
      )}
    </section>
  );
}
