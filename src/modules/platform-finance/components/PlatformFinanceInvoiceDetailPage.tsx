"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { PlatformFinanceInvoicesService } from "@/services/platform-finance/PlatformFinanceInvoicesService";
import type { FinanceInvoiceDetail } from "@/modules/platform-finance/domain/invoices";
import type { InvoiceCapabilities } from "@/modules/platform-finance/server/PlatformFinanceInvoicesServerService";
import { PlatformFinanceInvoiceReviewDrawer } from "@/modules/platform-finance/components/PlatformFinanceInvoiceReviewDrawer";

function money(amount: number, currency = "NGN") {
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(amount);
  } catch {
    return `₦${amount.toLocaleString("en-NG")}`;
  }
}
function date(value: string) { return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
const statusLabel = { draft: "Draft", under_review: "Under Review", issued: "Issued" } as const;
const statusTone = { draft: "is-muted", under_review: "is-info", issued: "is-success" } as const;

export function PlatformFinanceInvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const invoiceId = params.id;
  const [detail, setDetail] = useState<FinanceInvoiceDetail | null>(null);
  const [caps, setCaps] = useState<InvoiceCapabilities | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const reload = useCallback(async () => {
    const [next, nextCaps] = await Promise.all([
      PlatformFinanceInvoicesService.getDetail(invoiceId),
      PlatformFinanceInvoicesService.getMyCapabilities(),
    ]);
    setDetail(next);
    setCaps(nextCaps);
  }, [invoiceId]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => {
        if (!cancelled) setBusy(true);
        return reload();
      })
      .then(() => {
        if (!cancelled) setBusy(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Unable to load invoice.");
        setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  async function submit() {
    if (!detail) return;
    setBusy(true);
    setError(null);
    try {
      const next = await PlatformFinanceInvoicesService.submitForReview(detail.id);
      setDetail(next);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unable to submit.");
    } finally {
      setBusy(false);
    }
  }

  async function returnDraft() {
    if (!detail) return;
    setBusy(true);
    setError(null);
    try {
      const next = await PlatformFinanceInvoicesService.returnToDraft(detail.id);
      setDetail(next);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unable to return to draft.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pf-requests">
      <header className="pf-ov-header">
        <div>
          <Link className="pf-back" href="/platform-finance/invoices">
            <ArrowLeft size={16} /> Invoices
          </Link>
          <h1 className="pf-ov-title">{detail?.reference ?? "Invoice"}</h1>
          <p className="pf-ov-desc">
            {detail
              ? `${detail.counterpartyName} · ${detail.companyName}`
              : "Sales invoice detail"}
          </p>
        </div>
        <div className="pf-page-actions">
          {detail?.status === "draft" && (caps?.create || caps?.review) ? (
            <button type="button" className="pf-btn-primary" disabled={busy} onClick={() => void submit()}>
              Submit for review
            </button>
          ) : null}
          {detail?.status === "under_review" && (caps?.create || caps?.review) ? (
            <button type="button" className="pf-btn-secondary" disabled={busy} onClick={() => void returnDraft()}>
              Return to draft
            </button>
          ) : null}
          {detail?.status === "under_review" && caps?.issue ? (
            <button type="button" className="pf-btn-primary" disabled={busy} onClick={() => setReviewOpen(true)}>
              Review &amp; Issue
            </button>
          ) : null}
          {detail?.status === "issued" && detail.journalEntryId ? (
            <Link className="pf-btn-primary" href={`/platform-finance/accounting/journal/${detail.journalEntryId}`}>
              View Journal
            </Link>
          ) : null}
        </div>
      </header>

      {busy && !detail ? <p className="pf-state-message">Loading…</p> : null}
      {error ? (
        <p className="pf-form-error" role="alert">
          {error}
        </p>
      ) : null}

      {detail ? (
        <div className="pf-detail-stack">
          <section className="pf-rev-card">
            <h3>Summary</h3>
            <p>
              <strong>Status:</strong> <span className={`pf-req-status ${statusTone[detail.status]}`}>{statusLabel[detail.status]}</span>
            </p>
            <p>
              <strong>Amount:</strong> {money(detail.totalAmount, detail.currency)}
            </p>
            <p>
              <strong>Invoice date:</strong> {date(detail.invoiceDate)}
            </p>
            <p>
              <strong>Due date:</strong> {date(detail.dueDate)}
            </p>
            {detail.description ? <p>{detail.description}</p> : null}
            {detail.status === "issued" ? (
              <p className="pf-payd-muted">
                Issued identity: {detail.counterpartyDisplayName}
                {detail.counterpartyTaxRegistrationId
                  ? ` · Tax ID ${detail.counterpartyTaxRegistrationId}`
                  : ""}
              </p>
            ) : null}
          </section>

          <section className="pf-rev-card">
            <h3>Lines</h3>
            <div className="pf-req-table-wrap">
              <table className="pf-req-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Unit price</th>
                    <th>Amount</th>
                    <th>Revenue GL</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.lines.map((line) => (
                    <tr key={line.id}>
                      <td>{line.lineNo}</td>
                      <td>{line.description}</td>
                      <td>{line.quantity}</td>
                      <td className="pf-req-amount-cell">{money(line.unitPrice, detail.currency)}</td>
                      <td className="pf-req-amount-cell">{money(line.lineAmount, detail.currency)}</td>
                      <td>
                        {line.revenueGlAccountCode
                          ? `${line.revenueGlAccountCode} — ${line.revenueGlAccountName}`
                          : line.revenueGlAccountId}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {reviewOpen && detail ? (
        <PlatformFinanceInvoiceReviewDrawer
          invoiceId={detail.id}
          onClose={() => setReviewOpen(false)}
          onIssued={() => {
            setReviewOpen(false);
            void reload().then(() => router.refresh());
          }}
        />
      ) : null}
    </div>
  );
}
