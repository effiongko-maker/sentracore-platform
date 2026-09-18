"use client";

import Link from "next/link";
import { Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FinanceReceipt, ReceiptAccountingPreview } from "@/modules/platform-finance/domain/receipts";
import { PlatformFinanceReceiptsService as Service } from "@/services/platform-finance/PlatformFinanceReceiptsService";

type Context = Awaited<ReturnType<typeof Service.context>>;
const money = (amount: number, currency = "NGN") => new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(amount);

export function PlatformFinanceReceiptsPage() {
  const [rows, setRows] = useState<FinanceReceipt[]>([]);
  const [caps, setCaps] = useState<{ view: boolean; record: boolean; post: boolean } | null>(null);
  const [selected, setSelected] = useState<FinanceReceipt | null>(null);
  const [creating, setCreating] = useState(false);
  const [context, setContext] = useState<Context | null>(null);
  const [companyId, setCompanyId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [externalReference, setExternalReference] = useState("");
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ReceiptAccountingPreview | null>(null);

  const chosen = useMemo(() => (context?.receivables ?? []).filter((r) => Number(allocations[r.id] ?? 0) > 0), [allocations, context]);
  const first = chosen[0];
  const total = chosen.reduce((sum, r) => sum + Number(allocations[r.id]), 0);
  const receivables = (context?.receivables ?? []).filter((r) => r.company_id === companyId && (!first || (r.counterparty_id === first.counterparty_id && r.currency === first.currency)));
  const accounts = (context?.accounts ?? []).filter((a) => a.companyId === companyId && (!first || a.currency === first.currency));

  const reload = async () => {
    const [receipts, capabilities] = await Promise.all([Service.list(), Service.capabilities()]);
    setRows(receipts);
    setCaps(capabilities);
  };
  useEffect(() => {
    void Promise.resolve().then(reload).catch((cause) =>
      setError(cause instanceof Error ? cause.message : "Unable to load receipts."),
    );
  }, []);

  const openCreate = async () => {
    try {
      const next = await Service.context();
      setContext(next); setCompanyId(next.companies[0]?.id ?? ""); setAccountId(""); setAllocations({}); setExternalReference(""); setCreating(true); setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load the receipt form."); }
  };
  const create = async () => {
    if (!first || !accountId || total <= 0) { setError("Choose a destination account and allocate the receipt amount."); return; }
    try {
      const receipt = await Service.create({ companyId, counterpartyId: first.counterparty_id, destinationFinancialAccountId: accountId, receiptDate: new Date().toISOString().slice(0, 10), currency: first.currency, amount: total, externalReference, allocations: chosen.map((r) => ({ receivableId: r.id, amount: Number(allocations[r.id]) })) });
      setCreating(false); setSelected(receipt); setError(null); await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create receipt."); }
  };
  const act = async (action: "confirm" | "review" | "post") => {
    if (!selected) return;
    try {
      if (action === "confirm") setSelected(await Service.confirm(selected.id));
      if (action === "review") setPreview(await Service.review(selected.id));
      if (action === "post") { setSelected(await Service.post(selected.id)); setPreview(null); }
      setError(null); await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Receipt action failed."); }
  };

  return <div className="pf-page">
    <header className="pf-page-header"><div><h1>Receipts</h1><p>Record received customer money, allocate it, then review and post.</p></div>{caps?.record ? <button className="pf-btn is-primary" onClick={() => void openCreate()}><Plus size={16} />New Receipt</button> : null}</header>
    {error ? <p className="pf-form-error">{error}</p> : null}
    <div className="pf-table-wrap"><table className="pf-table"><thead><tr><th>Receipt</th><th>Customer</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>{rows.length ? rows.map((r) => <tr key={r.id} onClick={() => setSelected(r)} style={{ cursor: "pointer" }}><td>{r.reference}</td><td>{r.counterpartyDisplayName ?? "Draft"}</td><td>{r.receiptDate}</td><td>{money(r.amount, r.currency)}</td><td><span className="pf-pill is-info">{r.status}</span></td></tr>) : <tr><td colSpan={5} className="pf-empty">No receipts.</td></tr>}</tbody></table></div>
    {creating && context ? <div className="pf-drawer-backdrop"><aside className="pf-drawer"><header className="pf-drawer-header"><h2>New Receipt</h2><button className="pf-btn is-ghost" onClick={() => setCreating(false)}><X /></button></header><div className="pf-drawer-body">
      <label className="pf-field"><span>Company</span><select value={companyId} onChange={(e) => { setCompanyId(e.target.value); setAllocations({}); setAccountId(""); }}>{context.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <section className="pf-rev-card"><h3>Allocate to invoices</h3><p>Enter amounts against one or more invoices for the same customer and currency.</p>{receivables.map((r) => <label className="pf-field" key={r.id}><span>{r.invoice_reference} · {money(r.original_amount, r.currency)}</span><input type="number" min="0" step="0.01" value={allocations[r.id] ?? ""} onChange={(e) => setAllocations((current) => ({ ...current, [r.id]: e.target.value }))} placeholder="0.00" /></label>)}</section>
      <label className="pf-field"><span>Received into</span><select value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="">Select…</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.accountNumberLast4 ? ` ••••${a.accountNumberLast4}` : ""}</option>)}</select></label>
      <label className="pf-field"><span>Receipt amount</span><input readOnly value={total ? String(total) : "0.00"} /></label><label className="pf-field"><span>Bank reference</span><input value={externalReference} onChange={(e) => setExternalReference(e.target.value)} /></label><button className="pf-btn is-primary" onClick={() => void create()}>Save Draft</button>
    </div></aside></div> : null}
    {selected ? <div className="pf-drawer-backdrop" onMouseDown={() => setSelected(null)}><aside className="pf-drawer" onMouseDown={(e) => e.stopPropagation()}><header className="pf-drawer-header"><h2>{selected.reference}</h2><button className="pf-btn is-ghost" onClick={() => setSelected(null)}><X /></button></header><div className="pf-drawer-body"><section className="pf-rev-card"><p>{selected.counterpartyDisplayName ?? "Draft receipt"}</p><p>{money(selected.amount, selected.currency)} · {selected.receiptDate}</p><p>Received into: {selected.destinationAccountName ?? "Selected Financial Account"}{selected.destinationAccountLast4 ? ` ••••${selected.destinationAccountLast4}` : ""}</p><h3>Allocations</h3>{selected.allocations.map((a) => <p key={a.id}>{a.invoiceReference} — {money(a.amount, selected.currency)}</p>)}</section>
      {selected.status === "draft" && caps?.record ? <button className="pf-btn is-primary" onClick={() => void act("confirm")}>Confirm Receipt</button> : null}
      {selected.status === "confirmed" && caps?.post ? <><button className="pf-btn is-ghost" onClick={() => void act("review")}>Review Accounting</button>{preview ? <section className="pf-rev-card"><h3>Accounting consequence</h3><p>Dr {preview.debit.code} {preview.debit.name} — {money(selected.amount, selected.currency)}</p><p>Cr {preview.credit.code} {preview.credit.name} — {money(selected.amount, selected.currency)}</p><button className="pf-btn is-primary" onClick={() => void act("post")}>Review &amp; Post</button></section> : null}</> : null}
      {selected.journalEntryId ? <Link href={`/platform-finance/accounting/journal/${selected.journalEntryId}`}>View posted journal</Link> : null}
    </div></aside></div> : null}
  </div>;
}
