"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Landmark, Plus, Search, X } from "lucide-react";
import { FormField, inputClassName } from "@/components/forms/FormField";
import { PlatformFinanceService } from "@/services/platform-finance/PlatformFinanceService";
import type {
  FinanceAccount,
  FinanceCompany,
  FinanceFinancialAccountType,
  FinanceFinancialAccountView,
  FinanceFinancialAccountVisibility,
} from "@/modules/platform-finance/types";

const TYPE_LABELS: Record<FinanceFinancialAccountType, string> = {
  bank: "Bank",
  cash: "Cash",
  petty_cash: "Petty cash",
};

const VISIBILITY_LABELS: Record<FinanceFinancialAccountVisibility, string> = {
  company: "Company",
  restricted: "Restricted",
};

type Editor = {
  id?: string;
  companyId: string;
  accountType: FinanceFinancialAccountType;
  name: string;
  institutionName: string;
  accountNumberLast4: string;
  currency: string;
  controlGlAccountId: string;
  visibilityPolicy: FinanceFinancialAccountVisibility;
  status: "active" | "inactive";
};

export function PlatformFinanceCashBanksPage() {
  const [companies, setCompanies] = useState<FinanceCompany[]>([]);
  const [controlAccounts, setControlAccounts] = useState<FinanceAccount[]>([]);
  const [accounts, setAccounts] = useState<FinanceFinancialAccountView[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);

  const load = useCallback(async (selectedCompanyId?: string) => {
    setLoading(true);
    try {
      const context = await PlatformFinanceService.getFinancialAccountContext();
      const selected =
        selectedCompanyId &&
        context.companies.some((company) => company.id === selectedCompanyId)
          ? selectedCompanyId
          : "";
      const rows = await PlatformFinanceService.listFinancialAccounts(
        selected || null
      );
      setCompanies(context.companies);
      setControlAccounts(context.controlGlAccounts);
      setCanManage(context.canManage);
      setCompanyId(selected);
      setAccounts(rows);
      setError(null);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load corporate Financial Accounts."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function changeCompany(nextCompanyId: string) {
    setCompanyId(nextCompanyId);
    setLoading(true);
    try {
      setAccounts(
        await PlatformFinanceService.listFinancialAccounts(nextCompanyId || null)
      );
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to load accounts.");
    } finally {
      setLoading(false);
    }
  }

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return accounts;
    return accounts.filter((account) =>
      [
        account.name,
        account.companyName,
        account.institutionName ?? "",
        account.accountNumberLast4 ?? "",
        account.controlGlAccountCode,
        account.controlGlAccountName,
      ].some((value) => value.toLowerCase().includes(query))
    );
  }, [accounts, search]);

  function openCreate() {
    setEditor({
      companyId: companyId || companies[0]?.id || "",
      accountType: "bank",
      name: "",
      institutionName: "",
      accountNumberLast4: "",
      currency: "NGN",
      controlGlAccountId: "",
      visibilityPolicy: "company",
      status: "active",
    });
  }

  function openEdit(account: FinanceFinancialAccountView) {
    setEditor({
      id: account.id,
      companyId: account.companyId,
      accountType: account.accountType,
      name: account.name,
      institutionName: account.institutionName ?? "",
      accountNumberLast4: account.accountNumberLast4 ?? "",
      currency: account.currency,
      controlGlAccountId: account.controlGlAccountId,
      visibilityPolicy: account.visibilityPolicy,
      status: account.status,
    });
  }

  async function save() {
    if (!editor) return;
    setSaving(true);
    try {
      if (editor.id) {
        await PlatformFinanceService.updateFinancialAccount({
          financialAccountId: editor.id,
          ...editor,
        });
      } else {
        await PlatformFinanceService.createFinancialAccount(editor);
      }
      setEditor(null);
      await changeCompany(companyId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to save account.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(account: FinanceFinancialAccountView) {
    if (!canManage) return;
    try {
      await PlatformFinanceService.setFinancialAccountStatus(
        account.id,
        account.status === "active" ? "inactive" : "active"
      );
      await changeCompany(companyId);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Unable to change account status."
      );
    }
  }

  return (
    <div className="pf-overview pf-cash-banks">
      <header className="pf-ov-header">
        <div>
          <p className="pf-ov-eyebrow">Treasury foundation</p>
          <h1 className="pf-ov-title">Cash &amp; Banks</h1>
          <p className="pf-ov-desc">
            Corporate financial accounts only. Balances and money movements are
            not available in this phase.
          </p>
        </div>
        {canManage ? (
          <button type="button" className="pf-btn-primary" onClick={openCreate}>
            <Plus size={16} aria-hidden />
            Add Financial Account
          </button>
        ) : null}
      </header>

      <div className="pf-cash-toolbar">
        <FormField label="Company" htmlFor="pf-cash-company">
          <select
            id="pf-cash-company"
            className={inputClassName}
            value={companyId}
            onChange={(event) => void changeCompany(event.target.value)}
          >
            <option value="">All accessible companies</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Search" htmlFor="pf-cash-search">
          <div className="pf-coa-search">
            <Search size={16} aria-hidden />
            <input
              id="pf-cash-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, institution, last four or GL"
            />
          </div>
        </FormField>
      </div>

      {error ? (
        <div className="pf-vb-alert is-danger" role="alert">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="pf-empty-copy">Loading Financial Accounts…</p>
      ) : companies.length === 0 ? (
        <div className="pf-req-empty">
          <p className="pf-empty-title">No company access</p>
          <p className="pf-empty-copy">
            Finance company access is required to view corporate accounts.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="pf-req-empty">
          <Landmark size={24} aria-hidden />
          <p className="pf-empty-title">No Financial Accounts to show</p>
          <p className="pf-empty-copy">
            This count includes only accounts you are authorised to know exist.
          </p>
        </div>
      ) : (
        <div className="pf-coa-table-wrap">
          <table className="pf-coa-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Company</th>
                <th>Type</th>
                <th>Institution / Last four</th>
                <th>Currency</th>
                <th>Control GL</th>
                <th>Visibility</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((account) => (
                <tr key={account.id}>
                  <td><strong>{account.name}</strong></td>
                  <td>{account.companyName}</td>
                  <td>{TYPE_LABELS[account.accountType]}</td>
                  <td>
                    {account.institutionName ?? "—"}
                    {account.accountNumberLast4
                      ? ` · •••• ${account.accountNumberLast4}`
                      : ""}
                  </td>
                  <td>{account.currency}</td>
                  <td>
                    {account.controlGlAccountCode} · {account.controlGlAccountName}
                  </td>
                  <td>{VISIBILITY_LABELS[account.visibilityPolicy]}</td>
                  <td>
                    <span className={`pf-coa-status is-${account.status}`}>
                      {account.status === "active" ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    {canManage ? (
                      <div className="pf-coa-actions">
                        <button type="button" className="pf-link-btn" onClick={() => openEdit(account)}>
                          Edit
                        </button>
                        <button type="button" className="pf-link-btn" onClick={() => void toggleStatus(account)}>
                          {account.status === "active" ? "Deactivate" : "Reactivate"}
                        </button>
                      </div>
                    ) : (
                      <span className="pf-muted">View only</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editor ? (
        <div className="pf-coa-drawer-backdrop" role="presentation">
          <div className="pf-coa-drawer" role="dialog" aria-modal="true" aria-labelledby="pf-fa-editor-title">
            <div className="pf-coa-drawer-head">
              <h2 id="pf-fa-editor-title">
                {editor.id ? "Edit Financial Account" : "Add Financial Account"}
              </h2>
              <button type="button" className="pf-icon-btn" aria-label="Close" onClick={() => setEditor(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="pf-coa-drawer-fields">
              <FormField label="Company" htmlFor="pf-fa-company" required>
                <select
                  id="pf-fa-company"
                  className={inputClassName}
                  value={editor.companyId}
                  disabled={Boolean(editor.id)}
                  onChange={(event) => setEditor({ ...editor, companyId: event.target.value })}
                >
                  <option value="">Select company</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>{company.name}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Type" htmlFor="pf-fa-type" required>
                <select id="pf-fa-type" className={inputClassName} value={editor.accountType} onChange={(event) => setEditor({ ...editor, accountType: event.target.value as FinanceFinancialAccountType })}>
                  {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </FormField>
              <FormField label="Operational name" htmlFor="pf-fa-name" required>
                <input id="pf-fa-name" className={inputClassName} value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} />
              </FormField>
              <FormField label="Institution" htmlFor="pf-fa-institution">
                <input id="pf-fa-institution" className={inputClassName} value={editor.institutionName} onChange={(event) => setEditor({ ...editor, institutionName: event.target.value })} />
              </FormField>
              <FormField label="Account number — last four only" htmlFor="pf-fa-last4">
                <input id="pf-fa-last4" className={inputClassName} inputMode="numeric" maxLength={4} pattern="[0-9]{4}" value={editor.accountNumberLast4} onChange={(event) => setEditor({ ...editor, accountNumberLast4: event.target.value.replace(/\D/g, "").slice(0, 4) })} />
              </FormField>
              <FormField label="Currency" htmlFor="pf-fa-currency" required>
                <input id="pf-fa-currency" className={inputClassName} maxLength={3} value={editor.currency} onChange={(event) => setEditor({ ...editor, currency: event.target.value.toUpperCase() })} />
              </FormField>
              <FormField label="Control GL account" htmlFor="pf-fa-control" required>
                <select id="pf-fa-control" className={inputClassName} value={editor.controlGlAccountId} onChange={(event) => setEditor({ ...editor, controlGlAccountId: event.target.value })}>
                  <option value="">Select active current asset account</option>
                  {controlAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
                </select>
              </FormField>
              <FormField label="Visibility" htmlFor="pf-fa-visibility" required>
                <select id="pf-fa-visibility" className={inputClassName} value={editor.visibilityPolicy} onChange={(event) => setEditor({ ...editor, visibilityPolicy: event.target.value as FinanceFinancialAccountVisibility })}>
                  {Object.entries(VISIBILITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </FormField>
              <p className="pf-periods-hint">
                Restricted accounts are visible only with Finance view authority,
                company access, and an explicit account grant. The creator receives
                that grant automatically.
              </p>
            </div>
            <div className="pf-coa-drawer-actions">
              <button type="button" className="pf-btn-secondary" onClick={() => setEditor(null)}>Cancel</button>
              <button type="button" className="pf-btn-primary" disabled={saving || !editor.companyId || !editor.name.trim() || !editor.controlGlAccountId} onClick={() => void save()}>
                {saving ? "Saving…" : "Save account"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
