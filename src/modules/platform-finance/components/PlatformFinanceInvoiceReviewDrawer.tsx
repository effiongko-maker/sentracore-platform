"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PlatformFinanceInvoicesService } from "@/services/platform-finance/PlatformFinanceInvoicesService";
import type { InvoiceAccountingPreview } from "@/modules/platform-finance/domain/invoices";

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(amount);
}
function date(value: string) { return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }

export function PlatformFinanceInvoiceReviewDrawer(props: {
  invoiceId: string;
  onClose: () => void;
  onIssued?: () => void;
}) {
  const [preview, setPreview] = useState<InvoiceAccountingPreview | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    PlatformFinanceInvoicesService.getAccountingPreview(props.invoiceId)
      .then((next) => {
        if (cancelled) return;
        setPreview(next);
        setBusy(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Unable to load accounting preview.");
        setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [props.invoiceId]);

  async function issue() {
    if (!preview) return;
    if (
      !window.confirm(
        `Issue and post ${money(preview.totalAmount, preview.currency)}? This creates one journal entry and cannot be undone.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await PlatformFinanceInvoicesService.issueAndPost(props.invoiceId);
      props.onIssued?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unable to issue invoice.");
      setBusy(false);
    }
  }

  return (
    <div
      className="pf-drawer-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <section
        className="pf-req-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Review and issue invoice accounting"
      >
        <header className="pf-req-drawer-head">
          <div>
            <h2>Review &amp; Issue</h2>
            <p>System-derived compound journal. Revenue classification comes from invoice lines.</p>
          </div>
          <button type="button" className="pf-btn-secondary" onClick={props.onClose}>
            Close
          </button>
        </header>
        {busy && !preview ? <p className="pf-state-message">Loading accounting preview…</p> : null}
        {error ? (
          <p className="pf-form-error" role="alert">
            {error}
          </p>
        ) : null}
        {preview ? (
          <div className="pf-req-drawer-body">
            <section className="pf-rev-card">
              <h3>Invoice</h3>
              <p className="pf-payd-strong">
                {money(preview.totalAmount, preview.currency)} · {date(preview.invoiceDate)}
              </p>
              <p className="pf-payd-muted">Status: {preview.status.replace("_", " ")}</p>
              <p className="pf-payd-muted">
                Accounting period:{" "}
                {preview.periodLabel ? `${preview.periodLabel} · Open` : "No open period covers the invoice date"}
              </p>
            </section>
            <section className="pf-rev-card">
              <h3>Accounting consequence</h3>
              <p className="pf-payd-muted">AR control is system-derived. Journal lines are not editable here.</p>
              <div className="pf-req-table-wrap">
                <table className="pf-req-table">
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Debit</th>
                      <th>Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.lines.map((line) => (
                      <tr key={`${line.accountId}-${line.debit}-${line.credit}`}>
                        <td>
                          {line.accountCode} — {line.accountName}
                        </td>
                        <td>{line.debit ? money(line.debit, preview.currency) : "—"}</td>
                        <td>{line.credit ? money(line.credit, preview.currency) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            {preview.status === "issued" ? (
              <Link className="pf-btn-primary" href="/platform-finance/invoices">
                Done
              </Link>
            ) : (
              <button
                type="button"
                className="pf-btn-primary"
                disabled={!preview.periodId || busy || preview.status !== "under_review"}
                onClick={() => void issue()}
              >
                {busy ? "Issuing…" : "Issue & post to ledger"}
              </button>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
