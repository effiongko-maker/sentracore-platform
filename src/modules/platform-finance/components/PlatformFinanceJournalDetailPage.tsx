"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, AlertTriangle } from "lucide-react";
import { PlatformFinanceService } from "@/services/platform-finance/PlatformFinanceService";
import {
  PLATFORM_FINANCE_ACCOUNT_TYPE_LABELS,
  PLATFORM_FINANCE_JOURNAL_STATUS_LABELS,
  PLATFORM_FINANCE_TRANSACTION_TYPE_LABELS,
} from "@/modules/platform-finance/constants";

type JournalDetail = Awaited<
  ReturnType<typeof PlatformFinanceService.getJournalDetail>
>;

function formatNaira(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  return `₦${amount.toLocaleString("en-NG", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : `${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function sourceTypeLabel(value: string | null): string {
  if (!value) return "—";
  const known =
    PLATFORM_FINANCE_TRANSACTION_TYPE_LABELS[
      value as keyof typeof PLATFORM_FINANCE_TRANSACTION_TYPE_LABELS
    ];
  return (known ?? value).toUpperCase();
}

function amountOrDash(amount: number): string {
  return amount > 0 ? formatNaira(amount) : "—";
}

export function PlatformFinanceJournalDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [detail, setDetail] = useState<JournalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await PlatformFinanceService.getJournalDetail(id);
        if (!cancelled) {
          setDetail(data);
          setError(null);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setDetail(null);
          setError(
            err instanceof Error ? err.message : "Unable to load journal."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return <p className="pf-empty-copy">Loading journal…</p>;
  }

  if (error || !detail) {
    return (
      <div className="pf-journal-detail">
        <Link
          href="/platform-finance/accounting/journal"
          className="pf-link-btn"
        >
          <ArrowLeft size={16} aria-hidden />
          Back to Journal
        </Link>
        <div className="pf-req-empty">
          <p className="pf-empty-title">Journal not found</p>
          <p className="pf-empty-copy">{error ?? "Unable to load this journal."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pf-journal-detail">
      <Link
        href="/platform-finance/accounting/journal"
        className="pf-link-btn"
      >
        <ArrowLeft size={16} aria-hidden />
        Back to Journal
      </Link>

      <header className="pf-journal-detail-header">
        <div>
          <div className="pf-journal-detail-title-row">
            <h1 className="pf-journal-title">{detail.journalNo}</h1>
            <span className={`pf-journal-status is-${detail.status}`}>
              {PLATFORM_FINANCE_JOURNAL_STATUS_LABELS[
                detail.status as keyof typeof PLATFORM_FINANCE_JOURNAL_STATUS_LABELS
              ] ?? detail.status}
            </span>
          </div>
          <p className="pf-journal-desc">{detail.description}</p>
        </div>
      </header>

      <div className="pf-journal-detail-grid">
        <section className="pf-journal-card">
          <h2 className="pf-journal-card-title">Journal Information</h2>
          <dl className="pf-journal-meta-grid">
            <div>
              <dt>Journal No.</dt>
              <dd>{detail.journalNo}</dd>
            </div>
            <div>
              <dt>Company</dt>
              <dd>{detail.companyName}</dd>
            </div>
            <div>
              <dt>Description</dt>
              <dd>{detail.description}</dd>
            </div>
            <div>
              <dt>Period</dt>
              <dd>{detail.periodLabel}</dd>
            </div>
            <div>
              <dt>Source Type</dt>
              <dd className="pf-journal-source">
                {sourceTypeLabel(detail.sourceType)}
              </dd>
            </div>
            <div>
              <dt>Posting Date</dt>
              <dd>{formatDate(detail.entryDate)}</dd>
            </div>
            <div>
              <dt>Reference</dt>
              <dd>{detail.reference}</dd>
            </div>
            <div>
              <dt>Created By</dt>
              <dd>{detail.createdByName ?? "—"}</dd>
            </div>
            <div>
              <dt>Related Transaction</dt>
              <dd>
                {detail.transactionHref ? (
                  <Link href={detail.transactionHref} className="pf-journal-link">
                    {detail.transactionReference}
                  </Link>
                ) : (
                  <span title="Financial transaction detail is not available as a route yet.">
                    {detail.transactionReference}
                  </span>
                )}
              </dd>
            </div>
            {detail.sourceId ? (
              <div>
                <dt>Source Record</dt>
                <dd>
                  {detail.sourceHref ? (
                    <Link href={detail.sourceHref} className="pf-journal-link">
                      {detail.sourceLabel ?? detail.sourceId}
                    </Link>
                  ) : (
                    detail.sourceLabel ?? detail.sourceId
                  )}
                </dd>
              </div>
            ) : null}
            <div>
              <dt>Created At</dt>
              <dd>{formatDateTime(detail.createdAt)}</dd>
            </div>
            <div>
              <dt>Posted At</dt>
              <dd>{formatDateTime(detail.postedAt)}</dd>
            </div>
            <div>
              <dt>Posted By</dt>
              <dd>{detail.postedByName ?? "—"}</dd>
            </div>
          </dl>
        </section>

        <section className="pf-journal-card pf-journal-totals">
          <h2 className="pf-journal-card-title">Totals</h2>
          <div className="pf-journal-totals-row">
            <div>
              <span>Total Debit</span>
              <strong>{formatNaira(detail.totalDebit)}</strong>
            </div>
            <div>
              <span>Total Credit</span>
              <strong>{formatNaira(detail.totalCredit)}</strong>
            </div>
          </div>
          {detail.balanced ? (
            <div className="pf-journal-balance is-ok" role="status">
              <CheckCircle2 size={18} aria-hidden />
              <div>
                <strong>Journal is balanced</strong>
                <p>Total debits equal total credits.</p>
              </div>
            </div>
          ) : (
            <div className="pf-journal-balance is-bad" role="alert">
              <AlertTriangle size={18} aria-hidden />
              <div>
                <strong>Journal is not balanced</strong>
                <p>
                  Debit {formatNaira(detail.totalDebit)} does not equal credit{" "}
                  {formatNaira(detail.totalCredit)}. This violates the posting
                  invariant and should be investigated.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="pf-journal-card">
        <h2 className="pf-journal-card-title">Journal Lines</h2>
        <div className="pf-journal-table-wrap">
          <table className="pf-journal-table pf-journal-lines-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Account Code</th>
                <th>Account Name</th>
                <th>Type</th>
                <th>Description</th>
                <th className="is-num">Debit (₦)</th>
                <th className="is-num">Credit (₦)</th>
              </tr>
            </thead>
            <tbody>
              {detail.lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.lineNo}</td>
                  <td className="pf-coa-code">{line.accountCode}</td>
                  <td>{line.accountName}</td>
                  <td>
                    {PLATFORM_FINANCE_ACCOUNT_TYPE_LABELS[
                      line.accountType as keyof typeof PLATFORM_FINANCE_ACCOUNT_TYPE_LABELS
                    ] ?? line.accountType}
                  </td>
                  <td>{line.description?.trim() || "—"}</td>
                  <td className="is-num">{amountOrDash(line.debit)}</td>
                  <td className="is-num">{amountOrDash(line.credit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
