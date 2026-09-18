"use client";

import Link from "next/link";
import { Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FormField, inputClassName } from "@/components/forms/FormField";
import { SearchableSelect } from "@/components/forms/SearchableSelect";
import type { FinanceReceipt, ReceiptAccountingPreview } from "@/modules/platform-finance/domain/receipts";
import { PlatformFinanceReceiptsService as Service } from "@/services/platform-finance/PlatformFinanceReceiptsService";

type Context = Awaited<ReturnType<typeof Service.context>>;
const money = (amount: number, currency = "NGN") =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(amount);
const date = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const receiptStatus = {
  draft: { label: "Draft", tone: "is-muted" },
  confirmed: { label: "Awaiting Accounting", tone: "is-amber" },
  posted: { label: "Posted", tone: "is-success" },
} as const;

export function PlatformFinanceReceiptsPage() {
  const [rows, setRows] = useState<FinanceReceipt[]>([]);
  const [caps, setCaps] = useState<{ view: boolean; record: boolean; post: boolean } | null>(null);
  const [selected, setSelected] = useState<FinanceReceipt | null>(null);
  const [creating, setCreating] = useState(false);
  const [context, setContext] = useState<Context | null>(null);
  const [companyId, setCompanyId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [externalReference, setExternalReference] = useState("");
  const [receiptDate, setReceiptDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | FinanceReceipt["status"]>("all");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ReceiptAccountingPreview | null>(null);
  const [saving, setSaving] = useState(false);

  const chosen = useMemo(
    () => (context?.receivables ?? []).filter((r) => Number(allocations[r.id] ?? 0) > 0),
    [allocations, context],
  );
  const first = chosen[0];
  const total = chosen.reduce((sum, r) => sum + Number(allocations[r.id]), 0);
  const receivables = (context?.receivables ?? []).filter(
    (r) =>
      r.company_id === companyId &&
      r.available_to_allocate > 0 &&
      (!first || (r.counterparty_id === first.counterparty_id && r.currency === first.currency)),
  );
  const accounts = (context?.accounts ?? []).filter(
    (a) => a.companyId === companyId && (!first || a.currency === first.currency),
  );

  const reload = async () => {
    try {
      const [receipts, capabilities] = await Promise.all([Service.list(), Service.capabilities()]);
      setRows(receipts);
      setCaps(capabilities);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load receipts.");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [receipts, capabilities] = await Promise.all([Service.list(), Service.capabilities()]);
        if (cancelled) return;
        setRows(receipts);
        setCaps(capabilities);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Unable to load receipts.");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openCreate = async () => {
    try {
      const next = await Service.context();
      setContext(next);
      setCompanyId(next.companies[0]?.id ?? "");
      setAccountId("");
      setAllocations({});
      setExternalReference("");
      setReceiptDate(new Date().toISOString().slice(0, 10));
      setCreateError(null);
      setCreating(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load the receipt form.");
    }
  };
  const create = async () => {
    if (!first || !accountId || total <= 0) {
      setCreateError("Choose a destination account and allocate the receipt amount.");
      return;
    }
    setSaving(true);
    try {
      const receipt = await Service.create({
        companyId,
        counterpartyId: first.counterparty_id,
        destinationFinancialAccountId: accountId,
        receiptDate,
        currency: first.currency,
        amount: total,
        externalReference,
        allocations: chosen.map((r) => ({ receivableId: r.id, amount: Number(allocations[r.id]) })),
      });
      setCreating(false);
      setSelected(receipt);
      setCreateError(null);
      await reload();
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : "Unable to create receipt.");
    } finally {
      setSaving(false);
    }
  };
  const act = async (action: "confirm" | "review" | "post") => {
    if (!selected) return;
    try {
      if (action === "confirm") setSelected(await Service.confirm(selected.id));
      if (action === "review") setPreview(await Service.review(selected.id));
      if (action === "post") {
        setSelected(await Service.post(selected.id));
        setPreview(null);
      }
      setError(null);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Receipt action failed.");
    }
  };

  const filtered = rows.filter(
    (r) =>
      (status === "all" || r.status === status) &&
      (!query.trim() ||
        `${r.reference} ${r.counterpartyDisplayName ?? ""} ${r.externalReference ?? ""}`
          .toLowerCase()
          .includes(query.trim().toLowerCase())),
  );
  const counts = {
    draft: rows.filter((r) => r.status === "draft").length,
    confirmed: rows.filter((r) => r.status === "confirmed").length,
    posted: rows.filter((r) => r.status === "posted").length,
  };
  const postedValue = rows.filter((r) => r.status === "posted").reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="pf-requests">
      <header className="pf-ov-header">
        <div>
          <h1 className="pf-ov-title">Receipts</h1>
          <p className="pf-ov-desc">Record received customer money, allocate it, then review and post.</p>
        </div>
        {caps?.record ? (
          <button className="pf-btn-primary" onClick={() => void openCreate()}>
            <Plus size={16} />
            New Receipt
          </button>
        ) : null}
      </header>
      {error ? (
        <div className="pf-vb-alert is-danger" role="alert">
          {error}
        </div>
      ) : null}
      <section className="pf-req-summary">
        {(
          [
            ["Draft", counts.draft],
            ["Awaiting Accounting", counts.confirmed],
            ["Posted", counts.posted],
            ["Posted Value", money(postedValue)],
          ] as const
        ).map(([label, value]) => (
          <article className="pf-req-summary-card" key={label}>
            <p className="pf-req-summary-label">{label}</p>
            <p className="pf-req-summary-value">{value}</p>
          </article>
        ))}
      </section>
      <nav className="pf-req-tabs">
        {(["all", "draft", "confirmed", "posted"] as const).map((value) => (
          <button
            key={value}
            className={`pf-req-tab ${status === value ? "is-active" : ""}`}
            onClick={() => setStatus(value)}
          >
            {value === "all" ? "All" : receiptStatus[value].label}
          </button>
        ))}
      </nav>
      <div className="pf-req-table-card">
        <div className="pf-req-toolbar">
          <label className="pf-req-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search receipt, customer, or bank reference…"
            />
          </label>
        </div>
        {busy ? <div className="pf-req-empty">Loading receipts…</div> : null}
        {!busy ? (
          <div className="pf-req-table-wrap">
            <table className="pf-req-table">
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Destination</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length ? (
                  filtered.map((r) => (
                    <tr key={r.id} onClick={() => setSelected(r)}>
                      <td className="pf-req-primary">{r.reference}</td>
                      <td>{r.counterpartyDisplayName ?? "Customer not yet confirmed"}</td>
                      <td>{date(r.receiptDate)}</td>
                      <td className="pf-req-amount-cell">{money(r.amount, r.currency)}</td>
                      <td>
                        <span className={`pf-req-status ${receiptStatus[r.status].tone}`}>
                          {receiptStatus[r.status].label}
                        </span>
                      </td>
                      <td>
                        {r.destinationAccountName ?? "Selected account"}
                        {r.destinationAccountLast4 ? ` ••••${r.destinationAccountLast4}` : ""}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6}>
                      <div className="pf-req-empty">
                        {rows.length
                          ? "No records match the current filters."
                          : "Recorded customer receipts will appear here."}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
      {creating && context ? (
        <div className="pf-drawer-backdrop" onMouseDown={() => setCreating(false)}>
          <aside className="pf-req-drawer" onMouseDown={(e) => e.stopPropagation()}>
            <header className="pf-req-drawer-head">
              <div>
                <p className="pf-req-drawer-ref">RECEIPT</p>
                <h2 className="pf-req-drawer-title">New Receipt</h2>
              </div>
              <button className="pf-icon-btn" onClick={() => setCreating(false)} aria-label="Close">
                <X size={18} />
              </button>
            </header>
            <div className="pf-req-drawer-body">
              {createError ? (
                <div className="pf-vb-alert is-danger" role="alert">
                  {createError}
                </div>
              ) : null}
              <section className="pf-req-drawer-section">
                <h3>Receipt details</h3>
                <div className="pf-coa-drawer-fields">
                  <FormField label="Company" htmlFor="rcpt-company" required>
                    <SearchableSelect
                      id="rcpt-company"
                      aria-label="Company"
                      value={companyId}
                      onChange={(value) => {
                        setCompanyId(value);
                        setAllocations({});
                        setAccountId("");
                      }}
                      allowEmpty={false}
                      placeholder="Select company"
                      options={context.companies.map((c) => ({
                        value: c.id,
                        label: c.name,
                      }))}
                      searchPlaceholder="Search companies…"
                    />
                  </FormField>
                  <FormField label="Receipt date" htmlFor="rcpt-date" required>
                    <input
                      id="rcpt-date"
                      type="date"
                      className={inputClassName}
                      value={receiptDate}
                      onChange={(e) => setReceiptDate(e.target.value)}
                    />
                  </FormField>
                  <FormField label="Received into" htmlFor="rcpt-account" required>
                    <SearchableSelect
                      id="rcpt-account"
                      aria-label="Received into"
                      value={accountId}
                      onChange={setAccountId}
                      allowEmpty
                      emptyOptionLabel="Select…"
                      placeholder="Select…"
                      options={accounts.map((a) => ({
                        value: a.id,
                        label: `${a.name}${a.accountNumberLast4 ? ` ••••${a.accountNumberLast4}` : ""}`,
                      }))}
                      searchPlaceholder="Search accounts…"
                    />
                  </FormField>
                  <FormField label="External / bank reference" htmlFor="rcpt-external">
                    <input
                      id="rcpt-external"
                      className={inputClassName}
                      value={externalReference}
                      onChange={(e) => setExternalReference(e.target.value)}
                    />
                  </FormField>
                </div>
              </section>
              <section className="pf-req-drawer-section">
                <h3>Allocate to receivables</h3>
                <p className="pf-periods-hint">Receipt amount is the sum of these allocations.</p>
                {receivables.length ? (
                  <div className="pf-req-table-wrap">
                    <table className="pf-req-table">
                      <thead>
                        <tr>
                          <th>Invoice</th>
                          <th>Customer</th>
                          <th>Outstanding</th>
                          <th>Available</th>
                          <th>Allocate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {receivables.map((r) => (
                          <tr key={r.id}>
                            <td className="pf-req-primary">{r.invoice_reference}</td>
                            <td>{r.counterparty_display_name}</td>
                            <td className="pf-req-amount-cell">
                              {money(r.outstanding_amount, r.currency)}
                            </td>
                            <td className="pf-req-amount-cell">
                              {money(r.available_to_allocate, r.currency)}
                            </td>
                            <td>
                              <input
                                className={`${inputClassName} is-amount`}
                                type="number"
                                min="0"
                                max={r.available_to_allocate}
                                step="0.01"
                                inputMode="decimal"
                                aria-label={`Allocate to ${r.invoice_reference}`}
                                value={allocations[r.id] ?? ""}
                                onChange={(e) =>
                                  setAllocations((current) => ({
                                    ...current,
                                    [r.id]: e.target.value,
                                  }))
                                }
                                placeholder="0.00"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="pf-req-empty">
                    <p className="pf-empty-title">No receivables available</p>
                    <p className="pf-empty-copy">
                      No receivables are available to allocate for this company.
                    </p>
                  </div>
                )}
                <p className="pf-payd-strong">
                  Allocated total / Receipt amount{" "}
                  {money(total, first?.currency ?? "NGN")}
                </p>
              </section>
            </div>
            <footer className="pf-req-drawer-footer">
              <div className="pf-req-action-row">
                <button className="pf-btn-primary" disabled={saving} onClick={() => void create()}>
                  {saving ? "Saving…" : "Save Draft"}
                </button>
              </div>
            </footer>
          </aside>
        </div>
      ) : null}
      {selected ? (
        <div className="pf-drawer-backdrop" onMouseDown={() => setSelected(null)}>
          <aside className="pf-req-drawer" onMouseDown={(e) => e.stopPropagation()}>
            <header className="pf-req-drawer-head">
              <div>
                <p className="pf-req-drawer-ref">{receiptStatus[selected.status].label}</p>
                <h2 className="pf-req-drawer-title">{selected.reference}</h2>
              </div>
              <button className="pf-icon-btn" onClick={() => setSelected(null)} aria-label="Close">
                <X size={18} />
              </button>
            </header>
            <div className="pf-req-drawer-body">
              <section className="pf-rev-card">
                <p>{selected.counterpartyDisplayName ?? "Customer not yet confirmed"}</p>
                <p>
                  {money(selected.amount, selected.currency)} · {date(selected.receiptDate)}
                </p>
                <p>
                  Received into: {selected.destinationAccountName ?? "Selected account"}
                  {selected.destinationAccountLast4 ? ` ••••${selected.destinationAccountLast4}` : ""}
                </p>
                <h3>Allocations</h3>
                {selected.allocations.map((a) => (
                  <p key={a.id}>
                    {a.invoiceReference} — {money(a.amount, selected.currency)}
                  </p>
                ))}
              </section>
              {selected.status === "draft" && caps?.record ? (
                <button className="pf-btn-primary" onClick={() => void act("confirm")}>
                  Confirm Receipt
                </button>
              ) : null}
              {selected.status === "confirmed" && caps?.post ? (
                <>
                  <button className="pf-btn-secondary" onClick={() => void act("review")}>
                    Review Accounting
                  </button>
                  {preview ? (
                    <section className="pf-rev-card">
                      <h3>Accounting consequence</h3>
                      <p>
                        Dr {preview.debit.code} {preview.debit.name} —{" "}
                        {money(selected.amount, selected.currency)}
                      </p>
                      <p>
                        Cr {preview.credit.code} {preview.credit.name} —{" "}
                        {money(selected.amount, selected.currency)}
                      </p>
                      <button className="pf-btn-primary" onClick={() => void act("post")}>
                        Review &amp; Post
                      </button>
                    </section>
                  ) : null}
                </>
              ) : null}
              {selected.journalEntryId ? (
                <Link href={`/platform-finance/accounting/journal/${selected.journalEntryId}`}>
                  View posted journal
                </Link>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
