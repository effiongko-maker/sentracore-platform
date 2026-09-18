"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { PlatformFinanceInvoicesService } from "@/services/platform-finance/PlatformFinanceInvoicesService";
import { PlatformFinanceCounterpartiesService } from "@/services/platform-finance/PlatformFinanceCounterpartiesService";
import type { OrganisationCounterparty } from "@/modules/platform-finance/domain/counterparties";
import type { FinanceAccount, FinanceCompany } from "@/modules/platform-finance/types";
import { computeInvoiceLineAmount, roundMoney2 } from "@/modules/platform-finance/domain/invoices";

type DraftLine = {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
  revenueGlAccountId: string;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function PlatformFinanceNewInvoicePage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<FinanceCompany[]>([]);
  const [counterparties, setCounterparties] = useState<OrganisationCounterparty[]>([]);
  const [revenueAccounts, setRevenueAccounts] = useState<FinanceAccount[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [counterpartyId, setCounterpartyId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState(addDaysIso(30));
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([
    { key: "1", description: "", quantity: "1", unitPrice: "", revenueGlAccountId: "" },
  ]);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      PlatformFinanceInvoicesService.getMyCapabilities(),
      PlatformFinanceInvoicesService.listAccessibleCompanies(),
      PlatformFinanceInvoicesService.listRevenueAccounts(),
      PlatformFinanceCounterpartiesService.list({ status: "active", role: "customer" }),
    ])
      .then(([caps, cos, accounts, cps]) => {
        if (cancelled) return;
        if (!caps.create) {
          setError("You do not have authority to create invoices.");
          setBusy(false);
          return;
        }
        setCompanies(cos);
        setRevenueAccounts(accounts);
        setCounterparties(cps);
        if (cos[0]) setCompanyId(cos[0].id);
        setBusy(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Unable to load form.");
        setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const total = useMemo(() => {
    return roundMoney2(
      lines.reduce((sum, line) => {
        const qty = Number(line.quantity);
        const price = Number(line.unitPrice);
        if (!(qty > 0) || !(price >= 0)) return sum;
        return sum + computeInvoiceLineAmount(qty, price);
      }, 0)
    );
  }, [lines]);

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const created = await PlatformFinanceInvoicesService.create({
        companyId,
        counterpartyId,
        invoiceDate,
        dueDate,
        description: description.trim() || null,
        lines: lines.map((l) => ({
          description: l.description,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
          revenueGlAccountId: l.revenueGlAccountId,
        })),
      });
      router.push(`/platform-finance/invoices/${created.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unable to create invoice.");
      setSaving(false);
    }
  }

  return (
    <div className="pf-page">
      <header className="pf-page-header">
        <div>
          <Link className="pf-back" href="/platform-finance/invoices">
            <ArrowLeft size={16} /> Invoices
          </Link>
          <h1>New Invoice</h1>
          <p>Draft a sales invoice with one or more revenue lines.</p>
        </div>
      </header>

      {busy ? <p className="pf-state-message">Loading…</p> : null}
      {error ? (
        <p className="pf-form-error" role="alert">
          {error}
        </p>
      ) : null}

      {!busy ? (
        <div className="pf-form-stack">
          <label className="pf-field">
            <span>Company</span>
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="pf-field">
            <span>Counterparty (customer)</span>
            <select value={counterpartyId} onChange={(e) => setCounterpartyId(e.target.value)}>
              <option value="">Select counterparty…</option>
              {counterparties.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName}
                </option>
              ))}
            </select>
          </label>
          <div className="pf-form-grid">
            <label className="pf-field">
              <span>Invoice date</span>
              <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </label>
            <label className="pf-field">
              <span>Due date</span>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
          </div>
          <label className="pf-field">
            <span>Notes</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </label>

          <section className="pf-rev-card">
            <div className="pf-page-actions" style={{ justifyContent: "space-between" }}>
              <h3>Lines</h3>
              <button
                type="button"
                className="pf-btn is-ghost"
                onClick={() =>
                  setLines((prev) => [
                    ...prev,
                    {
                      key: String(Date.now()),
                      description: "",
                      quantity: "1",
                      unitPrice: "",
                      revenueGlAccountId: "",
                    },
                  ])
                }
              >
                <Plus size={16} /> Add line
              </button>
            </div>
            {lines.map((line, idx) => (
              <div key={line.key} className="pf-form-grid" style={{ marginBottom: 12 }}>
                <label className="pf-field" style={{ gridColumn: "1 / -1" }}>
                  <span>Line {idx + 1} description</span>
                  <input
                    value={line.description}
                    onChange={(e) => updateLine(line.key, { description: e.target.value })}
                  />
                </label>
                <label className="pf-field">
                  <span>Qty</span>
                  <input
                    value={line.quantity}
                    onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                  />
                </label>
                <label className="pf-field">
                  <span>Unit price</span>
                  <input
                    value={line.unitPrice}
                    onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })}
                  />
                </label>
                <label className="pf-field">
                  <span>Revenue GL</span>
                  <select
                    value={line.revenueGlAccountId}
                    onChange={(e) => updateLine(line.key, { revenueGlAccountId: e.target.value })}
                  >
                    <option value="">Select…</option>
                    {revenueAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} — {a.name}
                      </option>
                    ))}
                  </select>
                </label>
                {lines.length > 1 ? (
                  <button
                    type="button"
                    className="pf-btn is-ghost"
                    onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                    aria-label="Remove line"
                  >
                    <Trash2 size={16} />
                  </button>
                ) : null}
              </div>
            ))}
            <p className="pf-payd-strong">Total: ₦{total.toLocaleString("en-NG", { minimumFractionDigits: 2 })}</p>
          </section>

          <div className="pf-page-actions">
            <button
              type="button"
              className="pf-btn is-primary"
              disabled={saving || !companyId || !counterpartyId}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save draft"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
