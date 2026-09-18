"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { FormField, inputClassName } from "@/components/forms/FormField";
import { SearchableSelect } from "@/components/forms/SearchableSelect";
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

function money(amount: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
  }).format(amount);
}

function lineTotal(line: DraftLine) {
  const qty = Number(line.quantity);
  const price = Number(line.unitPrice);
  if (!(qty > 0) || !(price >= 0)) return 0;
  return computeInvoiceLineAmount(qty, price);
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
    return roundMoney2(lines.reduce((sum, line) => sum + lineTotal(line), 0));
  }, [lines]);

  const revenueOptions = useMemo(
    () =>
      revenueAccounts.map((account) => ({
        value: account.id,
        label: `${account.code} — ${account.name}`,
        searchText: `${account.code} ${account.name}`,
      })),
    [revenueAccounts],
  );

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
    <div className="pf-new-request pf-vb-create">
      <Link href="/platform-finance/invoices" className="pf-link-btn">
        <ArrowLeft size={16} aria-hidden />
        Back to Invoices
      </Link>

      <header className="pf-vb-create-header">
        <h1 className="pf-vb-create-title">New Invoice</h1>
        <p className="pf-vb-create-desc">
          Draft a customer invoice with one or more revenue lines.
        </p>
      </header>

      {busy ? <p className="pf-state-message">Loading…</p> : null}
      {error ? (
        <div className="pf-vb-alert is-danger" role="alert">
          {error}
        </div>
      ) : null}

      {!busy ? (
        <>
          <div className="pf-vb-create-sheet">
            <section className="pf-vb-create-section">
              <h2 className="pf-vb-create-section-title">Invoice details</h2>
              <div className="pf-vb-create-fields pf-invoice-details">
                <FormField label="Company" htmlFor="inv-company" required>
                  <SearchableSelect
                    id="inv-company"
                    aria-label="Company"
                    value={companyId}
                    onChange={setCompanyId}
                    allowEmpty={false}
                    placeholder="Select company"
                    options={companies.map((c) => ({
                      value: c.id,
                      label: c.name,
                      searchText: `${c.name} ${c.code ?? ""}`,
                    }))}
                    searchPlaceholder="Search companies…"
                  />
                </FormField>
                <FormField label="Customer" htmlFor="inv-customer" required>
                  <SearchableSelect
                    id="inv-customer"
                    aria-label="Customer"
                    value={counterpartyId}
                    onChange={setCounterpartyId}
                    allowEmpty
                    emptyOptionLabel="Select customer…"
                    placeholder="Select customer…"
                    options={counterparties.map((c) => ({
                      value: c.id,
                      label: c.displayName,
                      searchText: `${c.displayName} ${c.legalName ?? ""} ${c.taxRegistrationId ?? ""}`,
                    }))}
                    searchPlaceholder="Search customers…"
                  />
                </FormField>
                <FormField label="Invoice date" htmlFor="inv-date" required>
                  <input
                    id="inv-date"
                    type="date"
                    className={inputClassName}
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                  />
                </FormField>
                <FormField label="Due date" htmlFor="inv-due" required>
                  <input
                    id="inv-due"
                    type="date"
                    className={inputClassName}
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </FormField>
                <FormField
                  label="Notes"
                  htmlFor="inv-notes"
                  className="pf-invoice-details-notes"
                >
                  <textarea
                    id="inv-notes"
                    className={`${inputClassName} pf-new-textarea`}
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </FormField>
              </div>
            </section>

            <section className="pf-vb-create-section">
              <div className="pf-invoice-lines-head-row">
                <h2 className="pf-vb-create-section-title">Invoice lines</h2>
                <button
                  type="button"
                  className="pf-btn-secondary"
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
                  <Plus size={16} aria-hidden />
                  Add line
                </button>
              </div>
              <div className="pf-invoice-lines">
                <div className="pf-invoice-lines-head" aria-hidden>
                  <span>Description</span>
                  <span>Qty</span>
                  <span>Unit price</span>
                  <span>Revenue GL</span>
                  <span>Line total</span>
                  <span />
                </div>
                {lines.map((line) => (
                  <div key={line.key} className="pf-invoice-lines-row">
                    <input
                      className={inputClassName}
                      aria-label="Description"
                      value={line.description}
                      onChange={(e) =>
                        updateLine(line.key, { description: e.target.value })
                      }
                    />
                    <input
                      className={`${inputClassName} is-amount`}
                      aria-label="Qty"
                      inputMode="decimal"
                      value={line.quantity}
                      onChange={(e) =>
                        updateLine(line.key, { quantity: e.target.value })
                      }
                    />
                    <input
                      className={`${inputClassName} is-amount`}
                      aria-label="Unit price"
                      inputMode="decimal"
                      value={line.unitPrice}
                      onChange={(e) =>
                        updateLine(line.key, { unitPrice: e.target.value })
                      }
                    />
                    <SearchableSelect
                      aria-label="Revenue GL"
                      value={line.revenueGlAccountId}
                      onChange={(value) =>
                        updateLine(line.key, { revenueGlAccountId: value })
                      }
                      allowEmpty
                      emptyOptionLabel="Select…"
                      placeholder="Select…"
                      options={revenueOptions}
                      searchPlaceholder="Search revenue GL…"
                    />
                    <p className="pf-invoice-lines-total-value">
                      {money(lineTotal(line))}
                    </p>
                    {lines.length > 1 ? (
                      <button
                        type="button"
                        className="pf-icon-btn"
                        onClick={() =>
                          setLines((prev) => prev.filter((l) => l.key !== line.key))
                        }
                        aria-label="Remove line"
                      >
                        <Trash2 size={16} />
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                ))}
              </div>
              <p className="pf-invoice-lines-invoice-total">
                Invoice total <strong>{money(total)}</strong>
              </p>
            </section>
          </div>

          <footer className="pf-vb-create-footer">
            <button
              type="button"
              className="pf-btn-primary"
              disabled={saving || !companyId || !counterpartyId}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save draft"}
            </button>
          </footer>
        </>
      ) : null}
    </div>
  );
}
