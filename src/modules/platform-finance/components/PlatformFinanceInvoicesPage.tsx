"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { PlatformFinanceInvoicesService } from "@/services/platform-finance/PlatformFinanceInvoicesService";
import type { FinanceInvoice, InvoiceStatus } from "@/modules/platform-finance/domain/invoices";
import type { InvoiceCapabilities } from "@/modules/platform-finance/server/PlatformFinanceInvoicesServerService";

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  under_review: "Under Review",
  issued: "Issued",
};

const STATUS_TONE: Record<InvoiceStatus, string> = {
  draft: "is-muted",
  under_review: "is-info",
  issued: "is-success",
};

function money(amount: number, currency = "NGN") {
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(amount);
  } catch {
    return `₦${amount.toLocaleString("en-NG")}`;
  }
}

function formatDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function PlatformFinanceInvoicesPage() {
  const [rows, setRows] = useState<FinanceInvoice[]>([]);
  const [caps, setCaps] = useState<InvoiceCapabilities | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | InvoiceStatus>("all");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      PlatformFinanceInvoicesService.list(),
      PlatformFinanceInvoicesService.getMyCapabilities(),
    ])
      .then(([list, nextCaps]) => {
        if (cancelled) return;
        setRows(list);
        setCaps(nextCaps);
        setBusy(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Unable to load invoices.");
        setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!q) return true;
      return (
        row.reference.toLowerCase().includes(q) ||
        (row.counterpartyDisplayName ?? "").toLowerCase().includes(q) ||
        (row.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, query, status]);

  return (
    <div className="pf-page">
      <header className="pf-page-header">
        <div>
          <h1>Invoices</h1>
          <p>Prepare, review, and issue sales invoices with compound journal recognition.</p>
        </div>
        <div className="pf-page-actions">
          <Link className="pf-btn is-ghost" href="/platform-finance/counterparties">
            Counterparties
          </Link>
          {caps?.create ? (
            <Link className="pf-btn is-primary" href="/platform-finance/invoices/new">
              <Plus size={16} /> New Invoice
            </Link>
          ) : null}
        </div>
      </header>

      <div className="pf-toolbar">
        <label className="pf-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reference or notes…"
          />
        </label>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="under_review">Under Review</option>
          <option value="issued">Issued</option>
        </select>
      </div>

      {busy ? <p className="pf-state-message">Loading invoices…</p> : null}
      {error ? (
        <p className="pf-form-error" role="alert">
          {error}
        </p>
      ) : null}

      {!busy && !error ? (
        <div className="pf-table-wrap">
          <table className="pf-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Status</th>
                <th>Counterparty</th>
                <th>Invoice date</th>
                <th>Due date</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="pf-empty">
                    No invoices yet.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link href={`/platform-finance/invoices/${row.id}`}>{row.reference}</Link>
                    </td>
                    <td>
                      <span className={`pf-pill ${STATUS_TONE[row.status]}`}>
                        {STATUS_LABELS[row.status]}
                      </span>
                    </td>
                    <td>{row.counterpartyDisplayName ?? "—"}</td>
                    <td>{formatDate(row.invoiceDate)}</td>
                    <td>{formatDate(row.dueDate)}</td>
                    <td>{money(row.totalAmount, row.currency)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
