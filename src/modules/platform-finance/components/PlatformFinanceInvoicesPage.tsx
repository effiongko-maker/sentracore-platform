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
  const counts = useMemo(() => ({
    draft: rows.filter((row) => row.status === "draft").length,
    under_review: rows.filter((row) => row.status === "under_review").length,
    issued: rows.filter((row) => row.status === "issued").length,
    issuedValue: rows.filter((row) => row.status === "issued").reduce((sum, row) => sum + row.totalAmount, 0),
  }), [rows]);

  return (
    <div className="pf-requests">
      <header className="pf-ov-header">
        <div>
          <h1 className="pf-ov-title">Invoices</h1>
          <p className="pf-ov-desc">Prepare, review, and issue customer invoices.</p>
        </div>
        <div className="pf-req-controls">
          <Link className="pf-btn-secondary" href="/platform-finance/counterparties">
            Counterparties
          </Link>
          {caps?.create ? (
            <Link className="pf-btn-primary" href="/platform-finance/invoices/new">
              <Plus size={16} /> New Invoice
            </Link>
          ) : null}
        </div>
      </header>

      <section className="pf-req-summary">
        {[["Draft", counts.draft], ["Under Review", counts.under_review], ["Issued", counts.issued], ["Issued Value", money(counts.issuedValue)]].map(([label, value]) => <article className="pf-req-summary-card" key={label}><p className="pf-req-summary-label">{label}</p><p className="pf-req-summary-value">{value}</p></article>)}
      </section>
      <nav className="pf-req-tabs" aria-label="Invoice status">
        {(["all", "draft", "under_review", "issued"] as const).map((value) => <button type="button" key={value} className={`pf-req-tab ${status === value ? "is-active" : ""}`} onClick={() => setStatus(value)}>{value === "all" ? "All" : STATUS_LABELS[value]} <span>{value === "all" ? rows.length : counts[value]}</span></button>)}
      </nav>
      <div className="pf-req-table-card"><div className="pf-req-toolbar">
        <label className="pf-req-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reference, customer, or notes…"
          />
        </label>
      </div>

      {busy ? <p className="pf-state-message">Loading invoices…</p> : null}
      {error ? (
        <p className="pf-form-error" role="alert">
          {error}
        </p>
      ) : null}

      {!busy && !error ? (
        <div className="pf-req-table-wrap">
          <table className="pf-req-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Invoice date</th>
                <th>Due date</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6}><div className="pf-req-empty">
                    {rows.length ? "No records match the current filters." : "Issued and draft customer invoices will appear here."}
                  </div>
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id}>
                    <td><Link className="pf-req-primary" href={`/platform-finance/invoices/${row.id}`}>{row.reference}</Link></td>
                    <td>{row.counterpartyDisplayName ?? "—"}</td>
                    <td>
                      <span className={`pf-req-status ${STATUS_TONE[row.status]}`}>
                        {STATUS_LABELS[row.status]}
                      </span>
                    </td>
                    <td>{formatDate(row.invoiceDate)}</td>
                    <td>{formatDate(row.dueDate)}</td>
                    <td className="pf-req-amount-cell">{money(row.totalAmount, row.currency)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
      </div>
    </div>
  );
}
