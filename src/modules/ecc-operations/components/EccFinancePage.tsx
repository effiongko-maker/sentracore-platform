"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  ClipboardList,
  FileText,
  PiggyBank,
  Wallet,
} from "lucide-react";
import {
  ECC_FINANCE_CATEGORIES,
  ECC_FINANCE_CATEGORY_LABELS,
  ECC_FINANCE_COMMITMENT_STATUS_LABELS,
  ECC_FINANCE_TRANSACTION_STATUS_LABELS,
} from "../constants";
import { EccOperationsService } from "../services/EccOperationsService";
import type {
  EccFinanceCategory,
  EccFinanceCommitmentStatus,
  EccFinanceSnapshot,
  EccFinanceTransactionStatus,
} from "../types";
import { EccRecentAuditFeed } from "./EccAuditTrail";

type FinancePanel = "none" | "transaction" | "budget" | "commitment";

function formatMoney(amount: number | null, currency: string): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

function statusTone(
  status: string
): "ok" | "attention" | "critical" | "neutral" {
  if (status === "settled" || status === "recorded") return "ok";
  if (status === "pending" || status === "approved" || status === "due") {
    return "attention";
  }
  if (status === "cancelled") return "critical";
  return "neutral";
}

function utilisationPercent(spent: number, budget: number): number {
  if (budget <= 0) return 0;
  return Math.min(100, Math.round((spent / budget) * 100));
}

export function EccFinancePage() {
  const [snapshot, setSnapshot] = useState<EccFinanceSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [panel, setPanel] = useState<FinancePanel>("none");
  const [notice, setNotice] = useState<string | null>(null);
  const [recordedBy, setRecordedBy] = useState("");
  const [transactionForm, setTransactionForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    reference: "",
    description: "",
    category: "facilities" as EccFinanceCategory,
    amount: "",
    status: "recorded" as EccFinanceTransactionStatus,
  });
  const [budgetForm, setBudgetForm] = useState({
    periodLabel: "",
    amount: "",
    currency: "NGN",
  });
  const [commitmentForm, setCommitmentForm] = useState({
    description: "",
    category: "facilities" as EccFinanceCategory,
    expectedAmount: "",
    dueDate: "",
    status: "pending" as EccFinanceCommitmentStatus,
  });

  const panelRef = useRef<HTMLFormElement | null>(null);

  async function reload() {
    const data = await EccOperationsService.getFinanceSnapshot();
    setSnapshot(data);
    setBudgetForm((prev) => ({
      ...prev,
      periodLabel: prev.periodLabel || data.periodLabel,
      currency: data.currency || prev.currency,
    }));
  }

  useEffect(() => {
    queueMicrotask(() => {
      void reload().catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Unable to load finance."
        );
      });
    });
  }, []);

  useEffect(() => {
    if (panel !== "none") {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [panel]);

  const hasBudget = Boolean(snapshot?.budget);
  const hasTransactions = (snapshot?.transactions.length ?? 0) > 0;
  const hasCommitments = (snapshot?.commitments.length ?? 0) > 0;
  const position = snapshot?.budgetPosition;
  const canShowUtilisation =
    hasBudget &&
    position?.budget != null &&
    position.budget > 0 &&
    position.spent != null;

  const categoryCards = useMemo(
    () => snapshot?.categories ?? [...ECC_FINANCE_CATEGORIES],
    [snapshot]
  );

  function openPanel(next: FinancePanel) {
    setNotice(null);
    setError(null);
    setPanel(next);
  }

  function closePanel() {
    setPanel("none");
  }

  async function onSubmitTransaction(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const amount = Number(transactionForm.amount);
      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error("Enter a valid amount.");
      }
      const by = recordedBy.trim();
      if (!by) throw new Error("Recorded by is required.");
      await EccOperationsService.createFinanceTransaction({
        date: transactionForm.date,
        reference: transactionForm.reference || undefined,
        description: transactionForm.description,
        category: transactionForm.category,
        amount,
        currency: snapshot?.currency,
        status: transactionForm.status,
        recordedBy: by,
      });
      setTransactionForm({
        date: new Date().toISOString().slice(0, 10),
        reference: "",
        description: "",
        category: "facilities",
        amount: "",
        status: "recorded",
      });
      setPanel("none");
      setNotice("Transaction recorded.");
      await reload();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Unable to record transaction."
      );
    } finally {
      setSaving(false);
    }
  }

  async function onSubmitBudget(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const amount = Number(budgetForm.amount);
      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error("Enter a valid budget amount.");
      }
      const by = recordedBy.trim();
      if (!by) throw new Error("Created by is required.");
      await EccOperationsService.setFinanceBudget({
        periodLabel: budgetForm.periodLabel,
        amount,
        currency: budgetForm.currency,
        createdBy: by,
      });
      setBudgetForm((prev) => ({ ...prev, amount: "" }));
      setPanel("none");
      setNotice("Operational budget saved.");
      await reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to set budget.");
    } finally {
      setSaving(false);
    }
  }

  async function onSubmitCommitment(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const expectedAmount = Number(commitmentForm.expectedAmount);
      if (!Number.isFinite(expectedAmount) || expectedAmount < 0) {
        throw new Error("Enter a valid expected amount.");
      }
      const by = recordedBy.trim();
      if (!by) throw new Error("Recorded by is required.");
      await EccOperationsService.createFinanceCommitment({
        description: commitmentForm.description,
        category: commitmentForm.category,
        expectedAmount,
        currency: snapshot?.currency,
        dueDate: commitmentForm.dueDate || undefined,
        status: commitmentForm.status,
        recordedBy: by,
      });
      setCommitmentForm({
        description: "",
        category: "facilities",
        expectedAmount: "",
        dueDate: "",
        status: "pending",
      });
      setPanel("none");
      setNotice("Commitment recorded.");
      await reload();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Unable to record commitment."
      );
    } finally {
      setSaving(false);
    }
  }

  if (!snapshot && !error) {
    return <p className="ecc-empty">Loading finance…</p>;
  }

  if (!snapshot) {
    return <p className="ecc-empty">{error}</p>;
  }

  return (
    <div className="ecc-finance">
      <header className="ecc-page-header">
        <div className="ecc-page-header-copy">
          <p className="ecc-eyebrow">ECC Operations</p>
          <h1 className="ecc-page-title">Finance</h1>
          <p className="ecc-page-desc">
            Operational financial management for this ECC — tracking
            expenditure, obligations and financial activity.
          </p>
        </div>
        <div className="ecc-actions ecc-actions--compact">
          <button
            type="button"
            className="ecc-btn ecc-btn-primary"
            onClick={() => {
              if (panel === "transaction") closePanel();
              else openPanel("transaction");
            }}
          >
            {panel === "transaction" ? "Close" : "+ Record transaction"}
          </button>
        </div>
      </header>

      {error ? <p className="ecc-empty">{error}</p> : null}
      {notice ? (
        <p className="ecc-fin-notice" role="status">
          {notice}
        </p>
      ) : null}

      {panel === "transaction" ? (
        <form
          ref={panelRef}
          className="ecc-submit-form ecc-form"
          onSubmit={onSubmitTransaction}
        >
          <h3 className="ecc-form-block-title">Record transaction</h3>
          <p className="ecc-form-hint">
            Capture operational expenditure for this ECC. Persisted through the
            ECC Operations API.
          </p>
          <div className="ecc-form-grid ecc-form-grid-3">
            <div className="ecc-field">
              <label htmlFor="ecc-fin-tx-date">Date</label>
              <input
                id="ecc-fin-tx-date"
                type="date"
                required
                value={transactionForm.date}
                onChange={(e) =>
                  setTransactionForm((prev) => ({
                    ...prev,
                    date: e.target.value,
                  }))
                }
              />
            </div>
            <div className="ecc-field">
              <label htmlFor="ecc-fin-tx-ref">Reference</label>
              <input
                id="ecc-fin-tx-ref"
                value={transactionForm.reference}
                onChange={(e) =>
                  setTransactionForm((prev) => ({
                    ...prev,
                    reference: e.target.value,
                  }))
                }
                placeholder="Optional"
              />
            </div>
            <div className="ecc-field">
              <label htmlFor="ecc-fin-tx-amount">Amount</label>
              <input
                id="ecc-fin-tx-amount"
                type="number"
                min="0"
                step="0.01"
                required
                value={transactionForm.amount}
                onChange={(e) =>
                  setTransactionForm((prev) => ({
                    ...prev,
                    amount: e.target.value,
                  }))
                }
              />
            </div>
          </div>
          <div className="ecc-form-grid">
            <div className="ecc-field">
              <label htmlFor="ecc-fin-tx-desc">Description</label>
              <input
                id="ecc-fin-tx-desc"
                required
                value={transactionForm.description}
                onChange={(e) =>
                  setTransactionForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
              />
            </div>
            <div className="ecc-field">
              <label htmlFor="ecc-fin-tx-cat">Category</label>
              <select
                id="ecc-fin-tx-cat"
                value={transactionForm.category}
                onChange={(e) =>
                  setTransactionForm((prev) => ({
                    ...prev,
                    category: e.target.value as EccFinanceCategory,
                  }))
                }
              >
                {ECC_FINANCE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {ECC_FINANCE_CATEGORY_LABELS[category]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="ecc-form-grid">
            <div className="ecc-field">
              <label htmlFor="ecc-fin-tx-status">Status</label>
              <select
                id="ecc-fin-tx-status"
                value={transactionForm.status}
                onChange={(e) =>
                  setTransactionForm((prev) => ({
                    ...prev,
                    status: e.target.value as EccFinanceTransactionStatus,
                  }))
                }
              >
                {(
                  Object.keys(
                    ECC_FINANCE_TRANSACTION_STATUS_LABELS
                  ) as EccFinanceTransactionStatus[]
                ).map((status) => (
                  <option key={status} value={status}>
                    {ECC_FINANCE_TRANSACTION_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>
            <div className="ecc-field">
              <label htmlFor="ecc-fin-tx-by">Recorded by</label>
              <input
                id="ecc-fin-tx-by"
                required
                value={recordedBy}
                onChange={(e) => setRecordedBy(e.target.value)}
              />
            </div>
          </div>
          <div className="ecc-actions ecc-actions--compact">
            <button
              type="submit"
              className="ecc-btn ecc-btn-primary"
              disabled={saving}
            >
              {saving ? "Saving…" : "Save transaction"}
            </button>
            <button
              type="button"
              className="ecc-btn ecc-btn-secondary"
              onClick={closePanel}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {panel === "budget" ? (
        <form
          ref={panelRef}
          className="ecc-submit-form ecc-form"
          onSubmit={onSubmitBudget}
        >
          <h3 className="ecc-form-block-title">Set operational budget</h3>
          <p className="ecc-form-hint">
            Creates a new active budget for this ECC. Any previous active budget
            is superseded and retained for history.
          </p>
          <div className="ecc-form-grid ecc-form-grid-3">
            <div className="ecc-field">
              <label htmlFor="ecc-fin-bud-period">Period</label>
              <input
                id="ecc-fin-bud-period"
                required
                value={budgetForm.periodLabel}
                onChange={(e) =>
                  setBudgetForm((prev) => ({
                    ...prev,
                    periodLabel: e.target.value,
                  }))
                }
              />
            </div>
            <div className="ecc-field">
              <label htmlFor="ecc-fin-bud-amount">Budget amount</label>
              <input
                id="ecc-fin-bud-amount"
                type="number"
                min="0"
                step="0.01"
                required
                value={budgetForm.amount}
                onChange={(e) =>
                  setBudgetForm((prev) => ({
                    ...prev,
                    amount: e.target.value,
                  }))
                }
              />
            </div>
            <div className="ecc-field">
              <label htmlFor="ecc-fin-bud-currency">Currency</label>
              <input
                id="ecc-fin-bud-currency"
                required
                value={budgetForm.currency}
                onChange={(e) =>
                  setBudgetForm((prev) => ({
                    ...prev,
                    currency: e.target.value.toUpperCase(),
                  }))
                }
              />
            </div>
          </div>
          <div className="ecc-field">
            <label htmlFor="ecc-fin-bud-by">Created by</label>
            <input
              id="ecc-fin-bud-by"
              required
              value={recordedBy}
              onChange={(e) => setRecordedBy(e.target.value)}
            />
          </div>
          <div className="ecc-actions ecc-actions--compact">
            <button
              type="submit"
              className="ecc-btn ecc-btn-primary"
              disabled={saving}
            >
              {saving ? "Saving…" : "Save budget"}
            </button>
            <button
              type="button"
              className="ecc-btn ecc-btn-secondary"
              onClick={closePanel}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {panel === "commitment" ? (
        <form
          ref={panelRef}
          className="ecc-submit-form ecc-form"
          onSubmit={onSubmitCommitment}
        >
          <h3 className="ecc-form-block-title">Record commitment</h3>
          <p className="ecc-form-hint">
            Capture expenditure that is committed but not yet settled.
          </p>
          <div className="ecc-form-grid">
            <div className="ecc-field">
              <label htmlFor="ecc-fin-cm-desc">Description</label>
              <input
                id="ecc-fin-cm-desc"
                required
                value={commitmentForm.description}
                onChange={(e) =>
                  setCommitmentForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
              />
            </div>
            <div className="ecc-field">
              <label htmlFor="ecc-fin-cm-cat">Category</label>
              <select
                id="ecc-fin-cm-cat"
                value={commitmentForm.category}
                onChange={(e) =>
                  setCommitmentForm((prev) => ({
                    ...prev,
                    category: e.target.value as EccFinanceCategory,
                  }))
                }
              >
                {ECC_FINANCE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {ECC_FINANCE_CATEGORY_LABELS[category]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="ecc-form-grid ecc-form-grid-3">
            <div className="ecc-field">
              <label htmlFor="ecc-fin-cm-amount">Expected amount</label>
              <input
                id="ecc-fin-cm-amount"
                type="number"
                min="0"
                step="0.01"
                required
                value={commitmentForm.expectedAmount}
                onChange={(e) =>
                  setCommitmentForm((prev) => ({
                    ...prev,
                    expectedAmount: e.target.value,
                  }))
                }
              />
            </div>
            <div className="ecc-field">
              <label htmlFor="ecc-fin-cm-due">Due date</label>
              <input
                id="ecc-fin-cm-due"
                type="date"
                value={commitmentForm.dueDate}
                onChange={(e) =>
                  setCommitmentForm((prev) => ({
                    ...prev,
                    dueDate: e.target.value,
                  }))
                }
              />
            </div>
            <div className="ecc-field">
              <label htmlFor="ecc-fin-cm-status">Status</label>
              <select
                id="ecc-fin-cm-status"
                value={commitmentForm.status}
                onChange={(e) =>
                  setCommitmentForm((prev) => ({
                    ...prev,
                    status: e.target.value as EccFinanceCommitmentStatus,
                  }))
                }
              >
                {(
                  Object.keys(
                    ECC_FINANCE_COMMITMENT_STATUS_LABELS
                  ) as EccFinanceCommitmentStatus[]
                ).map((status) => (
                  <option key={status} value={status}>
                    {ECC_FINANCE_COMMITMENT_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="ecc-field">
            <label htmlFor="ecc-fin-cm-by">Recorded by</label>
            <input
              id="ecc-fin-cm-by"
              required
              value={recordedBy}
              onChange={(e) => setRecordedBy(e.target.value)}
            />
          </div>
          <div className="ecc-actions ecc-actions--compact">
            <button
              type="submit"
              className="ecc-btn ecc-btn-primary"
              disabled={saving}
            >
              {saving ? "Saving…" : "Save commitment"}
            </button>
            <button
              type="button"
              className="ecc-btn ecc-btn-secondary"
              onClick={closePanel}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {/* 1. Financial overview */}
      <section className="ecc-fin-kpi-grid" aria-label="Financial overview">
        <article className="ecc-fin-kpi">
          <span className="ecc-fin-kpi-icon" aria-hidden>
            <ClipboardList className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <p className="ecc-fin-kpi-label">Current period</p>
          <p className="ecc-fin-kpi-value">{snapshot.periodLabel}</p>
          <p className="ecc-fin-kpi-meta">Reporting period</p>
        </article>
        <article className="ecc-fin-kpi">
          <span className="ecc-fin-kpi-icon" aria-hidden>
            <Banknote className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <p className="ecc-fin-kpi-label">Total expenditure</p>
          <p className="ecc-fin-kpi-value">
            {formatMoney(snapshot.totalExpenditure, snapshot.currency)}
          </p>
          <p className="ecc-fin-kpi-meta">Spent this period</p>
        </article>
        <article className="ecc-fin-kpi">
          <span className="ecc-fin-kpi-icon" aria-hidden>
            <FileText className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <p className="ecc-fin-kpi-label">Pending commitments</p>
          <p className="ecc-fin-kpi-value">
            {formatMoney(snapshot.pendingCommitmentsTotal, snapshot.currency)}
          </p>
          <p className="ecc-fin-kpi-meta">Not yet settled</p>
        </article>
        <article className="ecc-fin-kpi">
          <span className="ecc-fin-kpi-icon" aria-hidden>
            <Wallet className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <p className="ecc-fin-kpi-label">Available budget</p>
          <p className="ecc-fin-kpi-value">
            {formatMoney(snapshot.availableBudget, snapshot.currency)}
          </p>
          <p className="ecc-fin-kpi-meta">Remaining operational budget</p>
        </article>
      </section>

      {/* 2. Budget position */}
      <section className="ecc-ppl-card" aria-labelledby="ecc-fin-budget-heading">
        <header className="ecc-ppl-card-head">
          <div>
            <h2 id="ecc-fin-budget-heading" className="ecc-ppl-card-title">
              Budget position
            </h2>
            <p className="ecc-ppl-card-lede">
              Current operational budget and expenditure position.
            </p>
          </div>
          {hasBudget ? (
            <button
              type="button"
              className="ecc-btn ecc-btn-secondary ecc-btn-sm"
              onClick={() => openPanel("budget")}
            >
              Update budget
            </button>
          ) : null}
        </header>

        {!hasBudget ? (
          <div className="ecc-ppl-empty">
            <span className="ecc-ppl-empty-icon" aria-hidden>
              <PiggyBank className="h-5 w-5" strokeWidth={1.6} />
            </span>
            <p className="ecc-ppl-empty-title">No budget configured</p>
            <p className="ecc-ppl-empty-copy">
              Set an ECC operational budget to begin tracking financial
              position.
            </p>
            <button
              type="button"
              className="ecc-btn ecc-btn-secondary"
              onClick={() => openPanel("budget")}
            >
              Set budget
            </button>
          </div>
        ) : (
          <div className="ecc-fin-budget-body">
            <div className="ecc-fin-budget-grid">
              <div>
                <p className="ecc-ppl-metric-label">Budget</p>
                <p className="ecc-ppl-metric-value">
                  {formatMoney(position?.budget ?? null, snapshot.currency)}
                </p>
              </div>
              <div>
                <p className="ecc-ppl-metric-label">Committed</p>
                <p className="ecc-ppl-metric-value">
                  {formatMoney(position?.committed ?? null, snapshot.currency)}
                </p>
              </div>
              <div>
                <p className="ecc-ppl-metric-label">Spent</p>
                <p className="ecc-ppl-metric-value">
                  {formatMoney(position?.spent ?? null, snapshot.currency)}
                </p>
              </div>
              <div>
                <p className="ecc-ppl-metric-label">Remaining</p>
                <p className="ecc-ppl-metric-value">
                  {formatMoney(position?.remaining ?? null, snapshot.currency)}
                </p>
              </div>
            </div>
            {canShowUtilisation ? (
              <div className="ecc-fin-util">
                <div className="ecc-fin-util-head">
                  <span>Utilisation</span>
                  <span>
                    {utilisationPercent(position!.spent!, position!.budget!)}%
                  </span>
                </div>
                <div
                  className="ecc-fin-util-track"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={utilisationPercent(
                    position!.spent!,
                    position!.budget!
                  )}
                  aria-label="Budget utilisation"
                >
                  <div
                    className="ecc-fin-util-fill"
                    style={{
                      width: `${utilisationPercent(
                        position!.spent!,
                        position!.budget!
                      )}%`,
                    }}
                  />
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {/* 3. Recent transactions */}
      <section className="ecc-ppl-card" aria-labelledby="ecc-fin-tx-heading">
        <header className="ecc-ppl-card-head">
          <div>
            <h2 id="ecc-fin-tx-heading" className="ecc-ppl-card-title">
              Recent transactions
            </h2>
            <p className="ecc-ppl-card-lede">
              Operational financial activity recorded for this ECC.
            </p>
          </div>
          {hasTransactions ? (
            <button
              type="button"
              className="ecc-btn ecc-btn-primary ecc-btn-sm"
              onClick={() => openPanel("transaction")}
            >
              + Record transaction
            </button>
          ) : null}
        </header>

        <div className="ecc-ppl-table-wrap">
          <table className="ecc-reg-table ecc-ppl-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Reference</th>
                <th>Description</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {!hasTransactions ? (
                <tr>
                  <td colSpan={6}>
                    <div className="ecc-ppl-empty ecc-ppl-empty--table">
                      <span className="ecc-ppl-empty-icon" aria-hidden>
                        <Banknote className="h-5 w-5" strokeWidth={1.6} />
                      </span>
                      <p className="ecc-ppl-empty-title">
                        No transactions recorded
                      </p>
                      <p className="ecc-ppl-empty-copy">
                        Financial activity recorded for this ECC will appear
                        here.
                      </p>
                      <button
                        type="button"
                        className="ecc-btn ecc-btn-primary"
                        onClick={() => openPanel("transaction")}
                      >
                        + Record transaction
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                snapshot.transactions.map((row) => (
                  <tr key={row.id}>
                    <td className="ecc-reg-cell-muted">{row.date}</td>
                    <td className="ecc-reg-cell-muted">
                      {row.reference.trim() || "—"}
                    </td>
                    <td>
                      <p className="ecc-reg-title">{row.description}</p>
                    </td>
                    <td className="ecc-reg-cell-muted">
                      {ECC_FINANCE_CATEGORY_LABELS[row.category]}
                    </td>
                    <td className="ecc-reg-cell-muted">
                      {formatMoney(row.amount, row.currency)}
                    </td>
                    <td>
                      <span
                        className={`ecc-people-duty is-${statusTone(row.status)}`}
                      >
                        {ECC_FINANCE_TRANSACTION_STATUS_LABELS[row.status]}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. Pending commitments */}
      <section
        className="ecc-ppl-card"
        aria-labelledby="ecc-fin-commit-heading"
      >
        <header className="ecc-ppl-card-head">
          <div>
            <h2 id="ecc-fin-commit-heading" className="ecc-ppl-card-title">
              Pending commitments
            </h2>
            <p className="ecc-ppl-card-lede">
              Expenditure that has been committed but not yet settled.
            </p>
          </div>
          <button
            type="button"
            className="ecc-btn ecc-btn-secondary ecc-btn-sm"
            onClick={() => openPanel("commitment")}
          >
            + Record commitment
          </button>
        </header>

        <div className="ecc-ppl-table-wrap">
          <table className="ecc-reg-table ecc-ppl-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Category</th>
                <th>Expected amount</th>
                <th>Due date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {!hasCommitments ? (
                <tr>
                  <td colSpan={5}>
                    <div className="ecc-ppl-empty ecc-ppl-empty--table">
                      <span className="ecc-ppl-empty-icon" aria-hidden>
                        <FileText className="h-5 w-5" strokeWidth={1.6} />
                      </span>
                      <p className="ecc-ppl-empty-title">
                        No pending commitments
                      </p>
                      <p className="ecc-ppl-empty-copy">
                        Approved or expected expenditure not yet settled will
                        appear here.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                snapshot.commitments.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <p className="ecc-reg-title">{row.description}</p>
                    </td>
                    <td className="ecc-reg-cell-muted">
                      {ECC_FINANCE_CATEGORY_LABELS[row.category]}
                    </td>
                    <td className="ecc-reg-cell-muted">
                      {formatMoney(row.expectedAmount, row.currency)}
                    </td>
                    <td className="ecc-reg-cell-muted">
                      {row.dueDate?.trim() || "—"}
                    </td>
                    <td>
                      <span
                        className={`ecc-people-duty is-${statusTone(row.status)}`}
                      >
                        {ECC_FINANCE_COMMITMENT_STATUS_LABELS[row.status]}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 5. Financial categories */}
      <section
        className="ecc-ppl-card"
        aria-labelledby="ecc-fin-cats-heading"
      >
        <header className="ecc-ppl-card-head">
          <div>
            <h2 id="ecc-fin-cats-heading" className="ecc-ppl-card-title">
              Financial categories
            </h2>
            <p className="ecc-ppl-card-lede">
              Operational spending categories used by this ECC.
            </p>
          </div>
        </header>
        <ul className="ecc-fin-cat-grid">
          {categoryCards.map((category) => (
            <li key={category} className="ecc-fin-cat">
              <span className="ecc-fin-cat-label">
                {ECC_FINANCE_CATEGORY_LABELS[category]}
              </span>
              <span className="ecc-fin-cat-meta">Operational</span>
            </li>
          ))}
        </ul>
      </section>

      <EccRecentAuditFeed
        title="Finance activity"
        entityTypes={[
          "finance_budget",
          "finance_transaction",
          "finance_commitment",
        ]}
      />
    </div>
  );
}
