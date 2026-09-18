"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import type { FinanceReceivable } from "@/modules/platform-finance/domain/receivables";
import { PlatformFinanceReceivablesService } from "@/services/platform-finance/PlatformFinanceReceivablesService";

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(amount);
}
function date(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function PlatformFinanceReceivablesPage() {
  const [rows, setRows] = useState<FinanceReceivable[]>([]);
  const [selected, setSelected] = useState<FinanceReceivable | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    PlatformFinanceReceivablesService.list().then((data) => { if (!cancelled) { setRows(data); setBusy(false); } }).catch((reason: unknown) => { if (!cancelled) { setError(reason instanceof Error ? reason.message : "Unable to load receivables."); setBusy(false); } });
    return () => { cancelled = true; };
  }, []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => !q || row.invoiceReference.toLowerCase().includes(q) || row.counterpartyDisplayName.toLowerCase().includes(q));
  }, [query, rows]);
  return <div className="pf-page">
    <header className="pf-page-header"><div><h1>Receivables</h1><p>Authoritative obligations arising from issued sales invoices.</p></div></header>
    <div className="pf-toolbar"><label className="pf-search"><Search size={16}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search invoice or customer…"/></label></div>
    {busy ? <p className="pf-state-message">Loading receivables…</p> : null}
    {error ? <p className="pf-form-error" role="alert">{error}</p> : null}
    {!busy && !error ? <div className="pf-table-wrap"><table className="pf-table"><thead><tr><th>Invoice</th><th>Customer</th><th>Invoice Date</th><th>Due Date</th><th>Original Amount</th><th>Outstanding</th><th>Status</th></tr></thead><tbody>
      {filtered.length === 0 ? <tr><td colSpan={7} className="pf-empty">No receivables.</td></tr> : filtered.map((row) => <tr key={row.id} onClick={() => setSelected(row)} style={{ cursor: "pointer" }}><td>{row.invoiceReference}</td><td>{row.counterpartyDisplayName}</td><td>{date(row.invoiceDate)}</td><td>{date(row.dueDate)}</td><td>{money(row.originalAmount, row.currency)}</td><td>{money(row.outstandingAmount, row.currency)}</td><td><span className={`pf-pill ${row.status === "overdue" ? "is-danger" : row.status === "settled" ? "is-success" : "is-info"}`}>{row.status.replaceAll("_", " ")}</span></td></tr>)}
    </tbody></table></div> : null}
    {selected ? <div className="pf-drawer-backdrop" role="presentation" onMouseDown={() => setSelected(null)}><aside className="pf-drawer" role="dialog" aria-modal="true" aria-label="Receivable detail" onMouseDown={(e) => e.stopPropagation()}><header className="pf-drawer-header"><div><p className="pf-ov-eyebrow">Receivable</p><h2>{selected.invoiceReference}</h2></div><button className="pf-btn is-ghost" onClick={() => setSelected(null)} aria-label="Close"><X size={18}/></button></header><div className="pf-drawer-body"><section className="pf-rev-card"><h3>{selected.counterpartyDisplayName}</h3><p>{selected.companyName}</p><p>Original: {money(selected.originalAmount, selected.currency)}</p><p>Outstanding: {money(selected.outstandingAmount, selected.currency)}</p><p>Available to allocate: {money(selected.availableToAllocate, selected.currency)}</p><p>Due: {date(selected.dueDate)}</p></section><section className="pf-rev-card"><h3>Source &amp; accounting</h3><p><Link href={`/platform-finance/invoices/${selected.invoiceId}`}>Invoice {selected.invoiceReference}</Link></p><p>→ Recognition transaction</p><p>→ <Link href={`/platform-finance/accounting/journal/${selected.journalEntryId}`}>Posted journal</Link></p></section></div></aside></div> : null}
  </div>;
}
