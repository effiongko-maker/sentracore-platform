"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FinancePaymentApiError, PlatformFinancePaymentsService } from "@/services/platform-finance/PlatformFinancePaymentsService";
import { PlatformFinanceService } from "@/services/platform-finance/PlatformFinanceService";
import type { PaymentAccountingReview, PaymentAccountingSourceFinancialAccount } from "@/modules/platform-finance/domain/paymentAccounting";
import type { FinanceAccount } from "@/modules/platform-finance/types";

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(amount);
}

function sourceAccountLabel(account: PaymentAccountingSourceFinancialAccount) {
  if (account.visibility === "restricted") return account.label;
  return `${account.name}${account.last4 ? ` · •••• ${account.last4}` : ""}`;
}

export function PlatformFinancePaymentReviewDrawer(props: {
  paymentId: string;
  onClose: () => void;
  onPosted?: () => void;
}) {
  const [review, setReview] = useState<PaymentAccountingReview | null>(null);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [debitId, setDebitId] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [next, list] = await Promise.all([
        PlatformFinancePaymentsService.getPaymentAccountingReview(props.paymentId),
        PlatformFinanceService.listAccounts(),
      ]);
      setReview(next);
      setAccounts(
        list.filter(
          (account) =>
            account.status === "active" && account.id !== next.creditAccount.id
        )
      );
      setDebitId(next.debitAccount?.id ?? "");
    } catch (cause: unknown) {
      setError(
        cause instanceof FinancePaymentApiError && cause.status === 403
          ? "You do not have authority to review this payment's accounting."
          : cause instanceof Error
            ? cause.message
            : "Unable to load accounting review."
      );
    } finally {
      setBusy(false);
    }
  }, [props.paymentId]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const selected = useMemo(() => accounts.find((a) => a.id === debitId) ?? null, [accounts, debitId]);

  async function post() {
    if (!debitId || !review) return;
    if (!window.confirm(`Post ${money(review.payment.amount, review.payment.currency)} to the ledger? This cannot be undone.`)) return;
    setBusy(true); setError(null);
    try {
      const next = await PlatformFinancePaymentsService.postPaymentAccounting(props.paymentId, debitId);
      setReview(next); props.onPosted?.();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unable to post accounting.";
      // Converge on authoritative truth: a lost response or a concurrent post may already have
      // produced the Journal Entry. Only report failure if the payment is still unposted.
      try {
        const latest = await PlatformFinancePaymentsService.getPaymentAccountingReview(props.paymentId);
        setReview(latest);
        if (latest.status === "posted") { setError(null); props.onPosted?.(); return; }
      } catch { /* keep the original failure */ }
      setError(message);
    }
    finally { setBusy(false); }
  }

  return <div className="pf-drawer-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
    <section className="pf-drawer" role="dialog" aria-modal="true" aria-label="Review and post Payment accounting">
      <header className="pf-drawer-header"><div><h2>Review &amp; Post</h2><p>Review the accounting treatment of a confirmed Payment.</p></div><button type="button" className="pf-btn is-ghost" onClick={props.onClose}>Close</button></header>
      {busy && !review ? <p className="pf-state-message">Loading accounting review…</p> : null}
      {error ? <div className="pf-vb-alert is-danger" role="alert"><p>{error}</p><button type="button" className="pf-link-btn" disabled={busy} onClick={() => void load()}>Retry</button></div> : null}
      {review ? <div className="pf-drawer-body">
        <section className="pf-rev-card"><h3>Payment lineage</h3><dl className="pf-req-dl"><div><dt>Payment status</dt><dd>Confirmed</dd></div><div><dt>Accounting status</dt><dd>{review.status === "posted" ? "Posted" : review.blockingReason ? "Blocked" : "Awaiting accounting"}</dd></div><div><dt>Payment</dt><dd>{review.payment.id}</dd></div><div><dt>Originating Payable</dt><dd><Link href={`/platform-finance/payables/${review.payable.id}`}>{review.payable.payeeName}</Link></dd></div><div><dt>Payable source</dt><dd><Link href={review.payable.sourceType === "vendor_bill" ? `/platform-finance/vendor-bills/${review.payable.sourceId}` : `/platform-finance/requests/${review.payable.sourceId}`}>{review.payable.sourceType === "vendor_bill" ? "Vendor Bill" : "Financial Request"}</Link></dd></div><div><dt>Company</dt><dd>{review.companyName}</dd></div><div><dt>Amount</dt><dd>{money(review.payment.amount, review.payment.currency)}</dd></div><div><dt>Payment date</dt><dd>{review.payment.paymentDate}</dd></div><div><dt>Source account</dt><dd>{sourceAccountLabel(review.payment.sourceFinancialAccount)}</dd></div>{review.payment.externalReference ? <div><dt>External reference</dt><dd>{review.payment.externalReference}</dd></div> : null}</dl></section>
        <section className="pf-rev-card"><h3>Accounting treatment</h3>
          <p className="pf-payd-muted">Select the authoritative debit treatment. The credit is derived from the corporate source account’s configured control GL and cannot be overridden here.</p>
          <label className="pf-field"><span>Debit account</span><select value={debitId} onChange={(e) => setDebitId(e.target.value)} disabled={review.status === "posted" || busy}><option value="">Select debit account…</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></label>
          <p><strong>{selected ? `${selected.code} — ${selected.name}` : "Debit account not selected"}</strong><br />{money(review.payment.amount, review.payment.currency)} DR</p>
          <p><strong>{review.creditAccount.code} — {review.creditAccount.name}</strong> <span className="pf-payd-muted">System-derived</span><br />{money(review.payment.amount, review.payment.currency)} CR</p>
          {review.period ? <p className="pf-payd-muted">Accounting period: {review.period.year}-{String(review.period.month).padStart(2, "0")} · Open</p> : <div className="pf-vb-alert is-danger" role="status">Accounting status: Blocked. {review.blockingReason ?? "No open accounting period covers the payment date."} <Link href="/platform-finance/accounting/periods">Manage periods</Link></div>}
        </section>
        {review.status === "posted" && review.journalEntryId ? <div className="pf-vb-alert is-success" role="status">Accounting status: Posted. <Link href={`/platform-finance/accounting/journal/${review.journalEntryId}`}>View authoritative Journal Entry</Link></div> : <button type="button" className="pf-btn is-primary" disabled={!debitId || !review.period || busy} onClick={() => void post()}>{busy ? "Posting…" : "Review & Post"}</button>}
      </div> : null}
    </section>
  </div>;
}
