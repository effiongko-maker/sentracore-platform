"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PlatformFinancePaymentsService } from "@/services/platform-finance/PlatformFinancePaymentsService";
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

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      PlatformFinancePaymentsService.getPaymentAccountingReview(props.paymentId),
      PlatformFinanceService.listAccounts(),
    ]).then(([next, list]) => {
      if (cancelled) return;
      setReview(next); setAccounts(list.filter((a) => a.status === "active"));
      setDebitId(next.debitAccount?.id ?? ""); setBusy(false);
    }).catch((e: unknown) => { if (!cancelled) { setError(e instanceof Error ? e.message : "Unable to load accounting review."); setBusy(false); } });
    return () => { cancelled = true; };
  }, [props.paymentId]);

  const selected = useMemo(() => accounts.find((a) => a.id === debitId) ?? null, [accounts, debitId]);

  async function post() {
    if (!debitId || !review) return;
    if (!window.confirm(`Post ${money(review.payment.amount, review.payment.currency)} to the ledger? This cannot be undone.`)) return;
    setBusy(true); setError(null);
    try {
      const next = await PlatformFinancePaymentsService.postPaymentAccounting(props.paymentId, debitId);
      setReview(next); props.onPosted?.();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Unable to post accounting."); }
    finally { setBusy(false); }
  }

  return <div className="pf-drawer-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
    <section className="pf-drawer" role="dialog" aria-modal="true" aria-label="Review and post Payment accounting">
      <header className="pf-drawer-header"><div><h2>Review &amp; Post</h2><p>Review the accounting treatment of a confirmed Payment.</p></div><button type="button" className="pf-btn is-ghost" onClick={props.onClose}>Close</button></header>
      {busy && !review ? <p className="pf-state-message">Loading accounting review…</p> : null}
      {error ? <p className="pf-form-error" role="alert">{error}</p> : null}
      {review ? <div className="pf-drawer-body">
        <section className="pf-rev-card"><h3>Payment</h3><p className="pf-payd-strong">{money(review.payment.amount, review.payment.currency)} · {review.payable.payeeName}</p><p className="pf-payd-muted">Paid {review.payment.paymentDate} from {sourceAccountLabel(review.payment.sourceFinancialAccount)}</p>{review.payment.externalReference ? <p className="pf-payd-muted">External reference: {review.payment.externalReference}</p> : null}</section>
        <section className="pf-rev-card"><h3>Accounting treatment</h3>
          <label className="pf-field"><span>Debit account</span><select value={debitId} onChange={(e) => setDebitId(e.target.value)} disabled={review.status === "posted" || busy}><option value="">Select account…</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></label>
          <p><strong>{selected ? `${selected.code} — ${selected.name}` : "Debit account not selected"}</strong><br />{money(review.payment.amount, review.payment.currency)} DR</p>
          <p><strong>{review.creditAccount.code} — {review.creditAccount.name}</strong> <span className="pf-payd-muted">System-derived</span><br />{money(review.payment.amount, review.payment.currency)} CR</p>
          <p className="pf-payd-muted">Accounting period: {review.period ? `${review.period.year}-${String(review.period.month).padStart(2, "0")} · Open` : "No open period covers the Payment date"}</p>
        </section>
        {review.status === "posted" && review.journalEntryId ? <Link className="pf-btn is-primary" href={`/platform-finance/accounting/journal/${review.journalEntryId}`}>View Journal</Link> : <button type="button" className="pf-btn is-primary" disabled={!debitId || !review.period || busy} onClick={() => void post()}>{busy ? "Posting…" : "Post to ledger"}</button>}
      </div> : null}
    </section>
  </div>;
}
