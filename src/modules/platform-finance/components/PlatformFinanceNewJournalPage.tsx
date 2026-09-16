"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { FormField, inputClassName } from "@/components/forms/FormField";
import { SearchableSelect } from "@/components/forms/SearchableSelect";
import { Modal } from "@/components/modals/Modal";
import { Button } from "@/components/ui/Button";
import { PlatformFinanceService } from "@/services/platform-finance/PlatformFinanceService";
import { financePeriodLabel } from "@/modules/platform-finance/domain/periods";
import type {
  FinanceAccount,
  FinanceCompany,
  FinancePeriod,
} from "@/modules/platform-finance/types";

function formatAmountFieldDisplay(raw: string): string {
  let cleaned = "";
  let seenDot = false;
  for (const char of raw) {
    if (char >= "0" && char <= "9") {
      cleaned += char;
      continue;
    }
    if (char === "." && !seenDot) {
      cleaned += ".";
      seenDot = true;
    }
  }
  if (!cleaned) return "";
  const endsWithDot = cleaned.endsWith(".");
  const [intRaw = "0", ...fracParts] = cleaned.split(".");
  const intPart = intRaw.replace(/^0+(?=\d)/, "") || "0";
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = fracParts.join("").slice(0, 2);
  if (fracParts.length > 0 || endsWithDot) {
    return endsWithDot && !frac ? `${grouped}.` : `${grouped}.${frac}`;
  }
  return grouped;
}

function parseAmountInput(display: string): number {
  const cleaned = display.replace(/,/g, "").trim();
  if (!cleaned) return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function profileDisplayName(profile: {
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): string {
  const full = profile.fullName?.trim();
  if (full) return full;
  const parts = [profile.firstName, profile.lastName]
    .map((p) => p?.trim())
    .filter(Boolean);
  return parts.length ? parts.join(" ") : "Current user";
}

function accountLabel(account: FinanceAccount | null | undefined): string {
  if (!account) return "—";
  return `${account.code} — ${account.name}`;
}

export type PlatformFinanceNewJournalFormProps = {
  onCancel: () => void;
  onPosted: (result: { journalEntryId: string; reference: string }) => void;
  /** True while confirm dialog is open or a post is in flight. */
  onBusyChange?: (busy: boolean) => void;
};

/**
 * Simple two-account journal entry surface for the Journal Register side panel.
 * Maps to the existing balanced two-line postManualJournal payload.
 */
export function PlatformFinanceNewJournalForm({
  onCancel,
  onPosted,
  onBusyChange,
}: PlatformFinanceNewJournalFormProps) {
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [canPost, setCanPost] = useState(false);
  const [companies, setCompanies] = useState<FinanceCompany[]>([]);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [preparedBy, setPreparedBy] = useState("—");

  const [companyId, setCompanyId] = useState("");
  const [transactionDate, setTransactionDate] = useState("");
  const [description, setDescription] = useState("");
  const [debitAccountId, setDebitAccountId] = useState("");
  const [creditAccountId, setCreditAccountId] = useState("");
  const [amountDisplay, setAmountDisplay] = useState("");
  const [period, setPeriod] = useState<FinancePeriod | null>(null);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [periodError, setPeriodError] = useState<string | null>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    onBusyChange?.(confirmOpen || posting);
  }, [confirmOpen, posting, onBusyChange]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBooting(true);
      try {
        const [caps, cos, accts, me] = await Promise.all([
          PlatformFinanceService.getMyAccountingCapabilities(),
          PlatformFinanceService.listAccessibleCompanies(),
          PlatformFinanceService.listAccounts(),
          fetch("/api/auth/me", { credentials: "same-origin" }).then((r) =>
            r.json()
          ),
        ]);
        if (cancelled) return;
        setCanPost(Boolean(caps.createTransaction && caps.post));
        setCompanies(cos.filter((c) => c.status === "active"));
        setAccounts(accts.filter((a) => a.status === "active"));
        const profile = me?.data?.profile;
        if (profile) setPreparedBy(profileDisplayName(profile));
        if (!caps.createTransaction || !caps.post) {
          setBootError(
            "You do not have permission to create and post journal entries."
          );
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setBootError(
            err instanceof Error
              ? err.message
              : "Unable to load journal posting form."
          );
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!companyId || !transactionDate) {
        setPeriod(null);
        setPeriodError(null);
        return;
      }
      setPeriodLoading(true);
      setPeriodError(null);
      try {
        const resolved = await PlatformFinanceService.findOpenPeriodForDate({
          companyId,
          transactionDate,
        });
        if (cancelled) return;
        setPeriod(resolved);
        if (!resolved) {
          setPeriodError(
            "No open accounting period covers this transaction date for the selected company. Open or generate the period in Accounting → Periods, then return here."
          );
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setPeriod(null);
          setPeriodError(
            err instanceof Error
              ? err.message
              : "Unable to resolve accounting period."
          );
        }
      } finally {
        if (!cancelled) setPeriodLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, transactionDate]);

  const amount = parseAmountInput(amountDisplay);
  const selectedCompany = companies.find((c) => c.id === companyId) ?? null;
  const debitAccount = accounts.find((a) => a.id === debitAccountId) ?? null;
  const creditAccount = accounts.find((a) => a.id === creditAccountId) ?? null;

  const accountOptions = useMemo(
    () =>
      accounts.map((a) => ({
        value: a.id,
        label: `${a.code} — ${a.name}`,
        searchText: `${a.code} ${a.name}`,
      })),
    [accounts]
  );

  const formReady =
    Boolean(canPost) &&
    Boolean(companyId) &&
    Boolean(transactionDate) &&
    Boolean(period) &&
    Boolean(description.trim()) &&
    Boolean(debitAccountId) &&
    Boolean(creditAccountId) &&
    debitAccountId !== creditAccountId &&
    amount > 0 &&
    accounts.length > 0 &&
    !periodLoading &&
    !posting;

  function clearForm() {
    setCompanyId("");
    setTransactionDate("");
    setDescription("");
    setDebitAccountId("");
    setCreditAccountId("");
    setAmountDisplay("");
    setPeriod(null);
    setPeriodError(null);
    setFormError(null);
  }

  function validateClient(): string | null {
    if (!companyId) return "Select a company.";
    if (!transactionDate) return "Enter a transaction date.";
    if (!description.trim()) return "Enter a description.";
    if (!period) return periodError || "An open period is required.";
    if (!debitAccountId) return "Select a debit account.";
    if (!creditAccountId) return "Select a credit account.";
    if (debitAccountId === creditAccountId) {
      return "Debit and credit accounts must be different.";
    }
    if (amount <= 0) return "Enter an amount greater than zero.";
    return null;
  }

  function openConfirm() {
    const err = validateClient();
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);
    // Defer open so the Post Entry click cannot land on the newly mounted
    // modal backdrop and immediately dismiss the dialog.
    window.setTimeout(() => setConfirmOpen(true), 0);
  }

  const closeConfirm = useCallback(() => {
    if (!posting) setConfirmOpen(false);
  }, [posting]);

  async function confirmPost() {
    const err = validateClient();
    if (err) {
      setFormError(err);
      setConfirmOpen(false);
      return;
    }
    setPosting(true);
    setFormError(null);
    try {
      const result = await PlatformFinanceService.postManualJournal({
        companyId,
        transactionDate,
        description: description.trim(),
        periodId: period?.id ?? null,
        lines: [
          {
            accountId: debitAccountId,
            debit: amount,
            credit: 0,
            description: null,
          },
          {
            accountId: creditAccountId,
            debit: 0,
            credit: amount,
            description: null,
          },
        ],
      });
      setConfirmOpen(false);
      onPosted({
        journalEntryId: result.journalEntryId,
        reference: result.reference,
      });
    } catch (e: unknown) {
      setConfirmOpen(false);
      setFormError(
        e instanceof Error ? e.message : "Unable to post journal entry."
      );
    } finally {
      setPosting(false);
    }
  }

  if (booting) {
    return (
      <div className="pf-journal-entry-form">
        <p className="pf-muted">Loading journal form…</p>
      </div>
    );
  }

  if (bootError && !canPost) {
    return (
      <div className="pf-journal-entry-form">
        <p className="pf-error" role="alert">
          {bootError}
        </p>
      </div>
    );
  }

  return (
    <div className="pf-journal-entry-form">
      {bootError ? (
        <p className="pf-error" role="alert">
          {bootError}
        </p>
      ) : null}
      {formError ? (
        <p className="pf-error" role="alert">
          {formError}
        </p>
      ) : null}

      <FormField
        label="Company"
        htmlFor="mj-company"
        required
        className="pf-journal-entry-field"
      >
        <SearchableSelect
          id="mj-company"
          value={companyId}
          onChange={(v) => {
            setCompanyId(v);
            setPeriod(null);
          }}
          allowEmpty={false}
          placeholder="Select company"
          options={companies.map((c) => ({
            value: c.id,
            label: c.name,
            searchText: `${c.name} ${c.code}`,
          }))}
          searchPlaceholder="Search companies…"
        />
      </FormField>

      <div className="pf-journal-entry-row">
        <FormField
          label="Date"
          htmlFor="mj-date"
          required
          className="pf-journal-entry-field"
        >
          <input
            id="mj-date"
            type="date"
            className={inputClassName}
            value={transactionDate}
            onChange={(e) => setTransactionDate(e.target.value)}
          />
        </FormField>
        <div className="pf-journal-entry-period-inline">
          <p className="pf-journal-entry-section-title">Period</p>
          <p
            className={`pf-journal-entry-period-value${
              period
                ? " is-open"
                : companyId && transactionDate && !periodLoading
                  ? " is-missing"
                  : ""
            }`}
          >
            {periodLoading
              ? "Resolving…"
              : period
                ? financePeriodLabel(period.year, period.month)
                : companyId && transactionDate
                  ? "No open period"
                  : "—"}
          </p>
        </div>
      </div>

      {periodError ? (
        <p className="pf-journal-new-period-error">
          {periodError}{" "}
          <Link
            href="/platform-finance/accounting/periods"
            className="pf-journal-new-period-link"
          >
            Open Periods
          </Link>
        </p>
      ) : null}

      <FormField
        label="Reference"
        htmlFor="mj-ref"
        className="pf-journal-entry-field"
      >
        <input
          id="mj-ref"
          className={inputClassName}
          value="Assigned on post"
          readOnly
          disabled
        />
      </FormField>

      <FormField
        label="Description"
        htmlFor="mj-desc"
        required
        className="pf-journal-entry-field"
      >
        <input
          id="mj-desc"
          className={inputClassName}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Diesel purchase"
          maxLength={500}
        />
      </FormField>

      <section className="pf-journal-entry-section" aria-label="Accounts">
        <h3 className="pf-journal-entry-section-title">Accounts</h3>

        {accounts.length === 0 ? (
          <p className="pf-error" role="status">
            No active accounts are available for posting.
          </p>
        ) : (
          <div className="pf-journal-entry-section-body">
            <FormField
              label="Debit Account (DR)"
              htmlFor="mj-debit"
              required
              className="pf-journal-entry-field"
            >
              <SearchableSelect
                id="mj-debit"
                value={debitAccountId}
                onChange={setDebitAccountId}
                allowEmpty={false}
                placeholder="Select debit account"
                options={accountOptions}
                searchPlaceholder="Search by code or name…"
              />
            </FormField>

            <FormField
              label="Credit Account (CR)"
              htmlFor="mj-credit"
              required
              className="pf-journal-entry-field"
            >
              <SearchableSelect
                id="mj-credit"
                value={creditAccountId}
                onChange={setCreditAccountId}
                allowEmpty={false}
                placeholder="Select credit account"
                options={accountOptions}
                searchPlaceholder="Search by code or name…"
              />
            </FormField>
          </div>
        )}
      </section>

      <section className="pf-journal-entry-section" aria-label="Amount">
        <h3 className="pf-journal-entry-section-title">Amount</h3>
        <div className="pf-journal-entry-section-body">
          <FormField
            label="Amount (₦)"
            htmlFor="mj-amount"
            required
            className="pf-journal-entry-field"
          >
            <input
              id="mj-amount"
              className={`${inputClassName} is-amount`}
              inputMode="decimal"
              value={amountDisplay}
              onChange={(e) =>
                setAmountDisplay(formatAmountFieldDisplay(e.target.value))
              }
              placeholder="0.00"
            />
          </FormField>
          {amount > 0 ? (
            <p
              className="pf-journal-entry-balance-hint is-balanced"
              aria-live="polite"
            >
              <span className="pf-journal-entry-balance-mark">Balanced</span>
              Total Debit {formatNaira(amount)} · Total Credit{" "}
              {formatNaira(amount)}
            </p>
          ) : null}
        </div>
      </section>

      <section className="pf-journal-entry-meta" aria-label="Prepared by">
        <div>
          <p className="pf-journal-entry-section-title">Prepared By</p>
          <p className="pf-journal-entry-meta-value">{preparedBy}</p>
        </div>
      </section>

      <div className="pf-journal-entry-actions">
        <button
          type="button"
          className="pf-btn-secondary"
          onClick={clearForm}
          disabled={posting}
        >
          Clear
        </button>
        <button
          type="button"
          className="pf-btn-primary"
          disabled={!formReady}
          onClick={openConfirm}
        >
          Post Entry
        </button>
      </div>

      <Modal
        open={confirmOpen}
        onClose={closeConfirm}
        title="Post Journal Entry?"
        description="This will create an immutable accounting record."
        size="md"
        footer={
          <>
            <Button
              variant="outline"
              onClick={closeConfirm}
              disabled={posting}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={confirmPost} loading={posting}>
              Post Entry
            </Button>
          </>
        }
      >
        <dl className="pf-journal-new-confirm">
          <div>
            <dt>Company</dt>
            <dd>{selectedCompany?.name ?? "—"}</dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>
              {transactionDate
                ? new Date(`${transactionDate}T00:00:00`).toLocaleDateString(
                    "en-GB",
                    {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    }
                  )
                : "—"}
            </dd>
          </div>
          <div>
            <dt>Period</dt>
            <dd>
              {period ? financePeriodLabel(period.year, period.month) : "—"}
            </dd>
          </div>
          <div>
            <dt>Description</dt>
            <dd>{description.trim() || "—"}</dd>
          </div>
          <div>
            <dt>Debit Account</dt>
            <dd>{accountLabel(debitAccount)}</dd>
          </div>
          <div>
            <dt>Credit Account</dt>
            <dd>{accountLabel(creditAccount)}</dd>
          </div>
          <div>
            <dt>Amount</dt>
            <dd>{formatNaira(amount)}</dd>
          </div>
          <div>
            <dt>Total Debit</dt>
            <dd>{formatNaira(amount)}</dd>
          </div>
          <div>
            <dt>Total Credit</dt>
            <dd>{formatNaira(amount)}</dd>
          </div>
        </dl>
      </Modal>
    </div>
  );
}

export type PlatformFinanceNewJournalDrawerProps = {
  open: boolean;
  onClose: () => void;
  onPosted: (result: { journalEntryId: string; reference: string }) => void;
  onBusyChange?: (busy: boolean) => void;
};

/** Right-side accounting entry panel over the Journal Register. */
export function PlatformFinanceNewJournalDrawer({
  open,
  onClose,
  onPosted,
  onBusyChange,
}: PlatformFinanceNewJournalDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const dialogs = document.querySelectorAll(
        '[role="dialog"][aria-modal="true"]'
      );
      const top = dialogs[dialogs.length - 1];
      const drawer = document.getElementById("pf-journal-entry-drawer");
      if (top && drawer && top !== drawer) return;
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="pf-journal-entry-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        id="pf-journal-entry-drawer"
        className="pf-journal-entry-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pf-journal-entry-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="pf-journal-entry-drawer-head">
          <div>
            <h2 id="pf-journal-entry-title">New Journal Entry</h2>
            <p className="pf-journal-entry-drawer-lede">
              Double-entry · Debit must equal Credit
            </p>
          </div>
          <button
            type="button"
            className="pf-journal-entry-close"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>
        <div className="pf-journal-entry-drawer-body">
          <PlatformFinanceNewJournalForm
            onCancel={onClose}
            onPosted={onPosted}
            onBusyChange={onBusyChange}
          />
        </div>
      </aside>
    </div>
  );
}
