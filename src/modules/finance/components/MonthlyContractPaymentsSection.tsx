"use client";

import { useEffect, useState } from "react";
import { MonthlyPaymentsService, type MonthlyContractPayment } from "@/services/finance/MonthlyPaymentsService";

function formatAmount(amount: number | undefined, currency: string): string {
  if (amount == null) return "Not established";
  return `${currency} ${amount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPaymentDatetime(iso?: string): string {
  if (!iso) return "Not recorded";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "Not recorded";
  // Stored digits are already the WAT wall-clock time verbatim (see CostDetailPage.formatOrgDatetime) — read via
  // UTC, never a further Africa/Lagos shift.
  const datePart = date.toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
  const timePart = date.toLocaleTimeString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: false });
  return `${datePart} · ${timePart} WAT`;
}

/**
 * Fixed monthly FM fee under the NCC contract — a governed, read-only projection of Platform Finance historical
 * commercial facts identified by their own source description text. Never a duplicate transaction; no value is
 * stored in FM. Self-contained (own fetch) so it doesn't touch the shared Finance Overview composition.
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
          <p className="fin-v13-section-lede">
            Fixed monthly FM fee under the NCC contract, separate from Work Order / Job Order payments.
          </p>
        </div>
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
              <tr key={row.month ?? i}>
                <td>{row.month ?? "Not established"}</td>
                <td className="fin-v13-num">{formatAmount(row.requestedAmount, row.currency)}</td>
                <td className="fin-v13-num">{formatAmount(row.amountReceived, row.currency)}</td>
                <td>
                  <span className="fin-v13-pill fin-v13-pill--neutral">{row.sourcePaymentStatus ?? "Not recorded"}</span>
                </td>
                <td className="fin-v13-muted">{formatPaymentDatetime(row.paymentDatetime)}</td>
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
