"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FormField, inputClassName } from "@/components/forms/FormField";
import {
  PHASE_2E_DEFAULT_CUTOVER_DATE,
  type OpeningPositionReview,
} from "@/modules/platform-finance/domain/openingPositions";
import { PlatformFinanceService } from "@/services/platform-finance/PlatformFinanceService";

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
  }).format(amount);
}

function formatCutover(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function PlatformFinanceOpeningPositionDrawer(props: {
  financialAccountId: string;
  canPrepare: boolean;
  canPost: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [review, setReview] = useState<OpeningPositionReview | null>(null);
  const [amount, setAmount] = useState("");
  const [cutoverDate, setCutoverDate] = useState(PHASE_2E_DEFAULT_CUTOVER_DATE);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    PlatformFinanceService.getOpeningPositionReview(props.financialAccountId)
      .then((next) => {
        if (cancelled) return;
        setReview(next);
        setAmount(
          next.openingPosition.amount != null
            ? String(next.openingPosition.amount)
            : ""
        );
        setCutoverDate(
          next.openingPosition.cutoverDate || PHASE_2E_DEFAULT_CUTOVER_DATE
        );
        setBusy(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load opening position."
        );
        setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [props.financialAccountId]);

  async function saveDraft() {
    if (!props.canPrepare) return;
    setBusy(true);
    setError(null);
    try {
      const next = await PlatformFinanceService.updateOpeningPositionDraft({
        financialAccountId: props.financialAccountId,
        amount: Number(amount),
        cutoverDate,
      });
      setReview(next);
      props.onChanged?.();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Unable to save opening position."
      );
    } finally {
      setBusy(false);
    }
  }

  async function post() {
    if (!props.canPost || !review) return;
    if (
      !window.confirm(
        `Post opening position of ${money(
          (review.openingPosition.amount ?? Number(amount)) || 0,
          review.openingPosition.currency
        )} to the Journal? This cannot be undone.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (review.status === "draft") {
        await PlatformFinanceService.updateOpeningPositionDraft({
          financialAccountId: props.financialAccountId,
          amount: Number(amount),
          cutoverDate,
        });
      }
      const next = await PlatformFinanceService.postOpeningPosition(
        props.financialAccountId
      );
      setReview(next);
      props.onChanged?.();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Unable to post opening position."
      );
    } finally {
      setBusy(false);
    }
  }

  const faLabel =
    review?.financialAccount.visibility === "visible"
      ? `${review.financialAccount.name}${
          review.financialAccount.last4
            ? ` · •••• ${review.financialAccount.last4}`
            : ""
        }`
      : review?.financialAccount.label ?? "Financial Account";

  const posted = review?.status === "posted";
  const previewAmount =
    review?.openingPosition.amount ??
    (Number.isFinite(Number(amount)) ? Number(amount) : null);

  return (
    <div
      className="pf-coa-drawer-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <div
        className="pf-coa-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pf-opening-title"
      >
        <div className="pf-coa-drawer-head">
          <h2 id="pf-opening-title">Opening position</h2>
          <button
            type="button"
            className="pf-icon-btn"
            aria-label="Close"
            onClick={props.onClose}
          >
            ×
          </button>
        </div>

        <div className="pf-coa-drawer-fields">
          <p className="pf-periods-hint">
            Records the balance of this financial account when it begins
            operating in SentraCore. The corresponding accounting entry will be
            created through the Journal.
          </p>

          {busy && !review ? (
            <p className="pf-empty-copy">Loading opening position…</p>
          ) : null}
          {error ? (
            <div className="pf-vb-alert is-danger" role="alert">
              {error}
            </div>
          ) : null}

          {review ? (
            <>
              <p>
                <strong>{faLabel}</strong>
                <br />
                <span className="pf-muted">{review.companyName}</span>
              </p>

              {posted ? (
                <div className="pf-rev-card">
                  <p>
                    Opening position:{" "}
                    <strong>
                      {money(
                        review.openingPosition.amount ?? 0,
                        review.openingPosition.currency
                      )}
                    </strong>
                  </p>
                  <p>As at: {formatCutover(review.openingPosition.cutoverDate)}</p>
                  <p>Status: Posted</p>
                  {review.journalEntryId ? (
                    <Link
                      className="pf-btn-primary"
                      href={`/platform-finance/accounting/journal/${review.journalEntryId}`}
                    >
                      View Journal
                    </Link>
                  ) : null}
                </div>
              ) : (
                <>
                  <FormField label="Opening amount" htmlFor="pf-opening-amount" required>
                    <input
                      id="pf-opening-amount"
                      className={inputClassName}
                      inputMode="decimal"
                      value={amount}
                      disabled={!props.canPrepare || busy}
                      onChange={(event) => setAmount(event.target.value)}
                    />
                  </FormField>
                  <FormField label="Cutover date" htmlFor="pf-opening-cutover" required>
                    <input
                      id="pf-opening-cutover"
                      className={inputClassName}
                      type="date"
                      value={cutoverDate}
                      disabled={!props.canPrepare || busy}
                      onChange={(event) => setCutoverDate(event.target.value)}
                    />
                  </FormField>
                  <p className="pf-periods-hint">
                    Defaults to 1 October 2026. The posted Journal uses this
                    reviewed date.
                  </p>

                  <div className="pf-rev-card">
                    <h3>Accounting consequence</h3>
                    <p>
                      <strong>
                        Debit: {review.debitAccount.code} ·{" "}
                        {review.debitAccount.name}
                      </strong>
                      <br />
                      {previewAmount != null && previewAmount > 0
                        ? money(previewAmount, review.openingPosition.currency)
                        : "—"}
                    </p>
                    <p>
                      <strong>
                        Credit: {review.creditAccount.code} ·{" "}
                        {review.creditAccount.name}
                      </strong>
                      <br />
                      {previewAmount != null && previewAmount > 0
                        ? money(previewAmount, review.openingPosition.currency)
                        : "—"}
                    </p>
                    <p className="pf-muted">
                      Accounting period:{" "}
                      {review.period
                        ? `${review.period.year}-${String(review.period.month).padStart(2, "0")} · Open`
                        : "No open period covers the cutover date"}
                    </p>
                  </div>

                  <div className="pf-coa-actions">
                    {props.canPrepare ? (
                      <button
                        type="button"
                        className="pf-btn-secondary"
                        disabled={busy}
                        onClick={() => void saveDraft()}
                      >
                        {busy ? "Saving…" : "Save draft"}
                      </button>
                    ) : null}
                    {props.canPost ? (
                      <button
                        type="button"
                        className="pf-btn-primary"
                        disabled={busy || !review.period || !amount}
                        onClick={() => void post()}
                      >
                        {busy ? "Posting…" : "Post to Journal"}
                      </button>
                    ) : null}
                  </div>
                </>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
