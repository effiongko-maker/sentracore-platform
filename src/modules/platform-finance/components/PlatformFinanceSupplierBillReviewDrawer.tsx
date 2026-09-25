"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  FinanceAccountingReviewApiError,
  PlatformFinanceAccountingReviewService,
} from "@/services/platform-finance/PlatformFinanceAccountingReviewService";
import type { SupplierBillAccountingReview } from "@/modules/platform-finance/domain/accountingReview";

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(amount);
}

const GROUP_LABEL: Record<string, string> = {
  expense: "Expense",
  current_asset: "Current asset (e.g. prepayment)",
  non_current_asset: "Non-current asset",
};

/**
 * Review & Post a supplier bill's recognition: every fact comes from the vendor bill and its obligation; Finance only
 * confirms the debit classification. Credit is Trade Accounts Payable (2000), derived and not overridable.
 */
export function PlatformFinanceSupplierBillReviewDrawer(props: { vendorBillId: string; onClose: () => void; onPosted?: () => void }) {
  const [review, setReview] = useState<SupplierBillAccountingReview | null>(null);
  const [debitId, setDebitId] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await PlatformFinanceAccountingReviewService.getSupplierBillReview(props.vendorBillId);
      setReview(next);
      setDebitId(next.debitAccount?.id ?? "");
    } catch (cause: unknown) {
      setError(
        cause instanceof FinanceAccountingReviewApiError && cause.status === 403
          ? "You do not have authority to review this supplier bill's accounting."
          : cause instanceof Error
            ? cause.message
            : "Unable to load accounting review."
      );
    } finally {
      setBusy(false);
    }
  }, [props.vendorBillId]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function post() {
    if (!review || !debitId) return;
    if (!window.confirm(`Recognise ${money(review.amount, review.currency)} as owed to ${review.vendorBill.payeeName}? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      setReview(await PlatformFinanceAccountingReviewService.postSupplierBill(props.vendorBillId, debitId));
      props.onPosted?.();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unable to post accounting.";
      try {
        const latest = await PlatformFinanceAccountingReviewService.getSupplierBillReview(props.vendorBillId);
        setReview(latest);
        if (latest.status === "posted") {
          setError(null);
          props.onPosted?.();
          return;
        }
      } catch {
        /* keep the original failure */
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  const groups = review
    ? (["expense", "current_asset", "non_current_asset"] as const).map((key) => ({
        key,
        accounts: review.eligibleDebitAccounts.filter((a) => (key === "expense" ? a.accountType === "expense" : a.accountType === "asset" && a.classification === key)),
      }))
    : [];
  const selected = review?.eligibleDebitAccounts.find((a) => a.id === debitId) ?? null;
  const bill = review?.vendorBill;

  return (
    <div className="pf-drawer-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <section className="pf-drawer" role="dialog" aria-modal="true" aria-label="Review and post supplier bill accounting">
        <header className="pf-drawer-header">
          <div>
            <h2>Review &amp; Post</h2>
            <p>Recognise an approved supplier bill as Trade Accounts Payable.</p>
          </div>
          <button type="button" className="pf-btn is-ghost" onClick={props.onClose}>Close</button>
        </header>
        {busy && !review ? <p className="pf-state-message">Loading accounting review…</p> : null}
        {error ? <div className="pf-vb-alert is-danger" role="alert"><p>{error}</p><button type="button" className="pf-link-btn" disabled={busy} onClick={() => void load()}>Retry</button></div> : null}
        {review && bill ? (
          <div className="pf-drawer-body">
            <section className="pf-rev-card">
              <h3>Supplier obligation</h3>
              <dl className="pf-req-dl">
                <div><dt>Accounting status</dt><dd>{review.status === "posted" ? "Posted" : review.blockingReason ? "Blocked" : "Awaiting accounting"}</dd></div>
                <div><dt>Supplier</dt><dd><Link href={`/platform-finance/vendor-bills/${bill.id}`}>{bill.payeeName}</Link></dd></div>
                <div><dt>Supplier invoice</dt><dd>{bill.invoiceReference ?? "—"}</dd></div>
                <div><dt>Invoice date (accounting date)</dt><dd>{bill.invoiceDate ?? "Not recorded"}</dd></div>
                <div><dt>Purpose</dt><dd>{bill.purpose}</dd></div>
                {bill.projectContractRef ? <div><dt>Project / contract</dt><dd>{bill.projectContractRef}</dd></div> : null}
                <div><dt>Goods / services received</dt><dd>{bill.goodsServicesReceived ? "Yes" : "No — consider a prepayment classification"}</dd></div>
                <div><dt>Approved amount</dt><dd>{money(review.amount, review.currency)}{bill.approvedAmount < bill.billedAmount ? ` (billed ${money(bill.billedAmount, review.currency)})` : ""}</dd></div>
                <div><dt>Company</dt><dd>{review.companyName}</dd></div>
                {review.payable.id ? <div><dt>Payable</dt><dd><Link href={`/platform-finance/payables/${review.payable.id}`}>Open payable</Link></dd></div> : null}
              </dl>
            </section>
            <section className="pf-rev-card">
              <h3>Accounting treatment</h3>
              <p className="pf-payd-muted">Confirm what this cost is: an expense, a prepayment or another current asset, or a non-current asset. Revenue, equity, liabilities and control accounts are not offered.</p>
              <label className="pf-field">
                <span>Debit classification</span>
                <select value={debitId} onChange={(e) => setDebitId(e.target.value)} disabled={review.status === "posted" || busy || Boolean(review.blockingReason)}>
                  <option value="">Select debit account…</option>
                  {groups.map((g) => (g.accounts.length ? (
                    <optgroup key={g.key} label={GROUP_LABEL[g.key]}>
                      {g.accounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                    </optgroup>
                  ) : null))}
                </select>
              </label>
              <p><strong>{selected ? `${selected.code} — ${selected.name}` : "Debit classification not selected"}</strong><br />{money(review.amount, review.currency)} DR</p>
              <p><strong>{review.creditAccount ? `${review.creditAccount.code} — ${review.creditAccount.name}` : "Trade Accounts Payable unavailable"}</strong> <span className="pf-payd-muted">System-derived</span><br />{money(review.amount, review.currency)} CR</p>
              {review.status !== "posted" && review.blockingReason ? (
                <div className="pf-vb-alert is-danger" role="status">Accounting status: Blocked. {review.blockingReason}{/period/i.test(review.blockingReason) ? <> <Link href="/platform-finance/accounting/periods">Manage periods</Link></> : null}</div>
              ) : review.period ? (
                <p className="pf-payd-muted">Accounting period: {review.period.year}-{String(review.period.month).padStart(2, "0")} · Open</p>
              ) : null}
            </section>
            {review.status === "posted" && review.journalEntryId ? (
              <div className="pf-vb-alert is-success" role="status">Accounting status: Posted. <Link href={`/platform-finance/accounting/journal/${review.journalEntryId}`}>View authoritative Journal Entry</Link></div>
            ) : (
              <button type="button" className="pf-btn is-primary" disabled={!debitId || !review.period || Boolean(review.blockingReason) || busy} onClick={() => void post()}>
                {busy ? "Posting…" : "Review & Post"}
              </button>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}

/** Forward provenance on the supplier bill: its accounting state and journal, derived — never stored on the bill. */
export function PlatformFinanceSupplierBillAccountingCard(props: { vendorBillId: string }) {
  const [review, setReview] = useState<SupplierBillAccountingReview | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "restricted" | "error">("loading");
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setReview(await PlatformFinanceAccountingReviewService.getSupplierBillAccountingStatus(props.vendorBillId));
      setState("ready");
    } catch (cause: unknown) {
      setState(cause instanceof FinanceAccountingReviewApiError && cause.status === 403 ? "restricted" : "error");
    }
  }, [props.vendorBillId]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  if (state === "restricted") return null;
  return (
    <section className="pf-rev-card">
      <h2 className="pf-rev-card-title">Accounting</h2>
      {state === "loading" ? <p className="pf-state-message">Loading accounting status…</p> : null}
      {state === "error" ? <p className="pf-form-error">Accounting status could not be loaded.</p> : null}
      {review ? (
        <>
          <p className="pf-ov-desc">
            {review.status === "posted"
              ? "Recognised in the books: Trade Accounts Payable was credited when this bill was reviewed and posted."
              : review.blockingReason
                ? `Not yet recognised. ${review.blockingReason}`
                : "Approved and payable, but not yet recognised in the books. Finance recognises it through Review & Post."}
          </p>
          {review.status === "posted" && review.journalEntryId ? (
            <Link href={`/platform-finance/accounting/journal/${review.journalEntryId}`} className="pf-btn-primary">View Journal Entry</Link>
          ) : (
            <button type="button" className="pf-btn-primary" onClick={() => setOpen(true)}>Review &amp; Post</button>
          )}
        </>
      ) : null}
      {open ? <PlatformFinanceSupplierBillReviewDrawer vendorBillId={props.vendorBillId} onClose={() => { setOpen(false); void load(); }} onPosted={() => void load()} /> : null}
    </section>
  );
}
