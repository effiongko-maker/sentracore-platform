"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { FormField, inputClassName } from "@/components/forms/FormField";
import { PlatformFinanceService } from "@/services/platform-finance/PlatformFinanceService";
import {
  PLATFORM_FINANCE_ACCOUNT_STATUS_LABELS,
  PLATFORM_FINANCE_ACCOUNT_TYPE_LABELS,
} from "@/modules/platform-finance/constants";
import { FINANCE_ACCOUNT_TYPES } from "@/modules/platform-finance/domain/coa";
import type {
  FinanceAccount,
  FinanceAccountStatus,
  FinanceAccountType,
} from "@/modules/platform-finance/types";

type TypeFilter = "all" | FinanceAccountType;
type StatusFilter = "all" | FinanceAccountStatus;

type EditorState = {
  mode: "create" | "edit";
  accountId?: string;
  code: string;
  name: string;
  accountType: FinanceAccountType;
  classification: string;
  status: FinanceAccountStatus;
  lockCodeType: boolean;
};

const emptyEditor = (): EditorState => ({
  mode: "create",
  code: "",
  name: "",
  accountType: "expense",
  classification: "",
  status: "active",
  lockCodeType: false,
});

export function PlatformFinanceChartOfAccountsPage() {
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [manageCoa, setManageCoa] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, caps] = await Promise.all([
        PlatformFinanceService.listAccounts(),
        PlatformFinanceService.getMyAccountingCapabilities(),
      ]);
      setAccounts(rows);
      setManageCoa(caps.manageCoa);
      setError(null);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Unable to load chart of accounts."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((a) => {
      if (typeFilter !== "all" && a.accountType !== typeFilter) return false;
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (!q) return true;
      return (
        a.code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        (a.classification ?? "").toLowerCase().includes(q)
      );
    });
  }, [accounts, search, typeFilter, statusFilter]);

  function openCreate() {
    setFormError(null);
    setEditor(emptyEditor());
  }

  async function openEdit(account: FinanceAccount) {
    setFormError(null);
    let lockCodeType = false;
    try {
      const detail = await PlatformFinanceService.getAccount(account.id);
      lockCodeType = detail.hasPostedUsage;
    } catch {
      lockCodeType = false;
    }
    setEditor({
      mode: "edit",
      accountId: account.id,
      code: account.code,
      name: account.name,
      accountType: account.accountType,
      classification: account.classification ?? "",
      status: account.status,
      lockCodeType,
    });
  }

  async function saveEditor() {
    if (!editor) return;
    setSaving(true);
    setFormError(null);
    try {
      if (editor.mode === "create") {
        await PlatformFinanceService.createAccount({
          code: editor.code,
          name: editor.name,
          accountType: editor.accountType,
          classification: editor.classification || null,
          status: editor.status,
        });
      } else if (editor.accountId) {
        await PlatformFinanceService.updateAccount({
          accountId: editor.accountId,
          code: editor.lockCodeType ? undefined : editor.code,
          name: editor.name,
          accountType: editor.lockCodeType ? undefined : editor.accountType,
          classification: editor.classification || null,
          status: editor.status,
        });
      }
      setEditor(null);
      await load();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unable to save account.";
      if (/used in posted journals/i.test(message)) {
        setEditor((prev) => (prev ? { ...prev, lockCodeType: true } : prev));
      }
      setFormError(message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(account: FinanceAccount) {
    if (!manageCoa) return;
    const next = account.status === "active" ? "inactive" : "active";
    try {
      await PlatformFinanceService.setAccountStatus({
        accountId: account.id,
        status: next,
      });
      await load();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Unable to update account status."
      );
    }
  }

  return (
    <div className="pf-coa">
      <div className="pf-coa-toolbar">
        <div className="pf-coa-search">
          <Search size={16} aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search code or name…"
            aria-label="Search accounts"
          />
        </div>
        <select
          className={inputClassName}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
          aria-label="Filter by type"
        >
          <option value="all">All types</option>
          {FINANCE_ACCOUNT_TYPES.map((t) => (
            <option key={t} value={t}>
              {PLATFORM_FINANCE_ACCOUNT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <select
          className={inputClassName}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        {manageCoa ? (
          <button type="button" className="pf-btn-primary" onClick={openCreate}>
            <Plus size={16} aria-hidden />
            Create Account
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="pf-vb-alert is-danger" role="alert">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="pf-empty-copy">Loading accounts…</p>
      ) : filtered.length === 0 ? (
        <div className="pf-req-empty">
          <p className="pf-empty-title">No accounts match</p>
          <p className="pf-empty-copy">
            Adjust filters or create an account if you manage the chart of
            accounts.
          </p>
        </div>
      ) : (
        <div className="pf-coa-table-wrap">
          <table className="pf-coa-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Type</th>
                <th>Classification</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((account) => (
                <tr key={account.id}>
                  <td className="pf-coa-code">{account.code}</td>
                  <td>{account.name}</td>
                  <td>
                    {PLATFORM_FINANCE_ACCOUNT_TYPE_LABELS[account.accountType]}
                  </td>
                  <td className="pf-muted">
                    {account.classification?.trim() || "—"}
                  </td>
                  <td>
                    <span
                      className={`pf-coa-status is-${account.status}`}
                    >
                      {PLATFORM_FINANCE_ACCOUNT_STATUS_LABELS[account.status]}
                    </span>
                  </td>
                  <td>
                    <div className="pf-coa-actions">
                      {manageCoa ? (
                        <>
                          <button
                            type="button"
                            className="pf-link-btn"
                            onClick={() => openEdit(account)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="pf-link-btn"
                            onClick={() => void toggleStatus(account)}
                          >
                            {account.status === "active"
                              ? "Deactivate"
                              : "Activate"}
                          </button>
                        </>
                      ) : (
                        <span className="pf-muted">View only</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editor ? (
        <div className="pf-coa-drawer-backdrop" role="presentation">
          <div
            className="pf-coa-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pf-coa-editor-title"
          >
            <div className="pf-coa-drawer-head">
              <h2 id="pf-coa-editor-title">
                {editor.mode === "create" ? "Create Account" : "Edit Account"}
              </h2>
              <button
                type="button"
                className="pf-icon-btn"
                aria-label="Close"
                onClick={() => setEditor(null)}
              >
                <X size={16} />
              </button>
            </div>
            {formError ? (
              <div className="pf-vb-alert is-danger" role="alert">
                {formError}
              </div>
            ) : null}
            <div className="pf-coa-drawer-fields">
              <FormField label="Code" htmlFor="coa-code" required>
                <input
                  id="coa-code"
                  className={inputClassName}
                  value={editor.code}
                  disabled={saving || (editor.mode === "edit" && editor.lockCodeType)}
                  onChange={(e) =>
                    setEditor({ ...editor, code: e.target.value })
                  }
                />
              </FormField>
              <FormField label="Name" htmlFor="coa-name" required>
                <input
                  id="coa-name"
                  className={inputClassName}
                  value={editor.name}
                  disabled={saving}
                  onChange={(e) =>
                    setEditor({ ...editor, name: e.target.value })
                  }
                />
              </FormField>
              <FormField label="Type" htmlFor="coa-type" required>
                <select
                  id="coa-type"
                  className={inputClassName}
                  value={editor.accountType}
                  disabled={saving || (editor.mode === "edit" && editor.lockCodeType)}
                  onChange={(e) =>
                    setEditor({
                      ...editor,
                      accountType: e.target.value as FinanceAccountType,
                    })
                  }
                >
                  {FINANCE_ACCOUNT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {PLATFORM_FINANCE_ACCOUNT_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Classification" htmlFor="coa-class">
                <input
                  id="coa-class"
                  className={inputClassName}
                  value={editor.classification}
                  disabled={saving}
                  placeholder="e.g. operating_expense"
                  onChange={(e) =>
                    setEditor({ ...editor, classification: e.target.value })
                  }
                />
              </FormField>
              <FormField label="Status" htmlFor="coa-status">
                <select
                  id="coa-status"
                  className={inputClassName}
                  value={editor.status}
                  disabled={saving}
                  onChange={(e) =>
                    setEditor({
                      ...editor,
                      status: e.target.value as FinanceAccountStatus,
                    })
                  }
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </FormField>
            </div>
            <div className="pf-coa-drawer-footer">
              <button
                type="button"
                className="pf-btn-secondary"
                disabled={saving}
                onClick={() => setEditor(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="pf-btn-primary"
                disabled={saving}
                onClick={() => void saveEditor()}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
