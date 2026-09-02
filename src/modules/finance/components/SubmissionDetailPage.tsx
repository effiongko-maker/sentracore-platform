"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, FileText, Pencil } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FormField,
  inputClassName,
  selectClassName,
} from "@/components/forms/FormField";
import { ModeFrame, OperateHeader, StreamSurface } from "@/components/platform";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import {
  getSubmissionActualCostTotal,
  getSubmissionCostCount,
} from "@/lib/operational/finance/costSubmission";
import type {
  CostRecord,
  CostSubmission,
  ReimbursementPayment,
} from "@/lib/operational/finance/types";
import { CostSubmissionService } from "@/services/finance/CostSubmissionService";
import { ReimbursementPaymentService } from "@/services/finance/ReimbursementPaymentService";
import { UserService } from "@/services/users/UserService";
import { FINANCE_UI_LIST_LIMIT } from "../constants";
import { useSubmissionCostPool } from "../hooks/useSubmissionCostPool";
import { formatFinancialAmount } from "../utils/formatFinancialAmount";
import { resolveSubmissionCosts } from "../utils/resolveSubmissionCosts";
import {
  canEditSubmission,
  canQuerySubmission,
  canRecordPaymentForSubmission,
  canSubmitSubmission,
  SUBMISSION_LIFECYCLE_LABELS,
  submissionLifecycleDescription,
} from "../utils/submissionLifecycle";
import { summarizeSubmissionPayments } from "../utils/submissionPayment";
import { detailsFromPackage } from "./SubmissionDetailsForm";
import { SubmissionReviewPanel } from "./SubmissionReviewPanel";

function formatTimestamp(iso?: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  return date.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const PAYMENT_OUTCOME_LABELS = {
  unpaid: "Unpaid",
  partially_paid: "Partially paid",
  fully_paid: "Fully paid",
} as const;

export function SubmissionDetailPage({
  submissionId,
}: {
  submissionId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justSubmitted = searchParams.get("submitted") === "1";
  const costPool = useSubmissionCostPool();
  const { toast } = useToast();

  const [submission, setSubmission] = useState<CostSubmission | null>(null);
  const [payments, setPayments] = useState<ReimbursementPayment[]>([]);
  const [resolvedCosts, setResolvedCosts] = useState<CostRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [queryNotes, setQueryNotes] = useState("");
  const [showQueryForm, setShowQueryForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [record, paymentPage] = await Promise.all([
        CostSubmissionService.getCostSubmission(submissionId),
        ReimbursementPaymentService.listPayments({
          page: 1,
          pageSize: 100,
          submissionId,
        }),
      ]);
      if (!record) {
        setSubmission(null);
        setPayments([]);
        setError("This submission could not be found.");
        return;
      }
      setSubmission(record);
      setPayments(paymentPage.data);
      setQueryNotes(record.queryNotes ?? "");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load this submission."
      );
      setSubmission(null);
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    UserService.getCurrentUser()
      .then((user) => {
        if (!cancelled) setUserId(user.id);
      })
      .catch(() => {
        if (!cancelled) setUserId(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!submission) {
      setResolvedCosts([]);
      return;
    }
    let cancelled = false;
    void resolveSubmissionCosts(submission.costRecordIds, costPool.records).then(
      (costs) => {
        if (!cancelled) setResolvedCosts(costs);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [submission, costPool.records]);

  const reviewDetails = useMemo(
    () =>
      submission
        ? detailsFromPackage(
            submission.submissionKind,
            submission.periodLabel,
            submission.submissionPackage,
            submission.notes
          )
        : null,
    [submission]
  );

  const actualCost = useMemo(() => {
    if (resolvedCosts.length > 0) {
      return getSubmissionActualCostTotal(resolvedCosts);
    }
    return undefined;
  }, [resolvedCosts]);

  const paymentSummary = useMemo(
    () =>
      submission
        ? summarizeSubmissionPayments(submission, payments)
        : null,
    [submission, payments]
  );

  const currency = submission?.currency ?? "NGN";
  const markupAmount = submission?.markup?.markupAmount ?? 0;
  const markupRatePercent = submission?.markup?.markupRatePercent ?? 0;
  const claimAmount = submission?.claimAmount ?? 0;
  const editable = submission ? canEditSubmission(submission.status) : false;
  const visiblePayments = payments.slice(0, FINANCE_UI_LIST_LIMIT);

  useEffect(() => {
    if (!paymentSummary) return;
    if (showPaymentForm && !paymentAmount && paymentSummary.outstandingAmount > 0) {
      setPaymentAmount(String(paymentSummary.outstandingAmount));
    }
  }, [paymentSummary, showPaymentForm, paymentAmount]);

  async function handleSubmit() {
    if (!submission || !userId || acting) return;
    setActing(true);
    try {
      const now = new Date().toISOString();
      await CostSubmissionService.updateCostSubmission(submission.submissionId, {
        status: "submitted",
        submittedAt: now,
        submittedBy: userId,
      });
      toast({
        type: "success",
        title:
          submission.status === "queried"
            ? "Submission resubmitted"
            : "Submission submitted",
      });
      await load();
    } catch (err) {
      toast({
        type: "error",
        title: "Unable to submit",
        description: err instanceof Error ? err.message : "Try again.",
      });
    } finally {
      setActing(false);
    }
  }

  async function handleQuery() {
    if (!submission || acting) return;
    if (!queryNotes.trim()) {
      toast({
        type: "error",
        title: "Query notes required",
        description: "Record why the submission was returned.",
      });
      return;
    }
    setActing(true);
    try {
      await CostSubmissionService.updateCostSubmission(submission.submissionId, {
        status: "queried",
        queriedAt: new Date().toISOString(),
        queryNotes: queryNotes.trim(),
      });
      toast({ type: "success", title: "Marked as queried" });
      setShowQueryForm(false);
      await load();
    } catch (err) {
      toast({
        type: "error",
        title: "Unable to mark queried",
        description: err instanceof Error ? err.message : "Try again.",
      });
    } finally {
      setActing(false);
    }
  }

  async function handleRecordPayment() {
    if (!submission || !userId || acting || !paymentSummary) return;
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({
        type: "error",
        title: "Enter a positive payment amount",
      });
      return;
    }
    if (!paymentDate.trim()) {
      toast({ type: "error", title: "Payment date is required" });
      return;
    }
    setActing(true);
    try {
      await ReimbursementPaymentService.createPayment({
        submissionId: submission.submissionId,
        receivedAmount: amount,
        currency,
        receivedAt: new Date(paymentDate).toISOString(),
        reference: paymentReference.trim() || undefined,
        method: paymentMethod.trim() || undefined,
        notes: paymentNotes.trim() || undefined,
        recordedBy: userId,
      });
      toast({ type: "success", title: "Payment recorded" });
      setShowPaymentForm(false);
      setPaymentReference("");
      setPaymentMethod("");
      setPaymentNotes("");
      await load();
    } catch (err) {
      toast({
        type: "error",
        title: "Unable to record payment",
        description: err instanceof Error ? err.message : "Try again.",
      });
    } finally {
      setActing(false);
    }
  }

  return (
    <ModeFrame mode="act">
      <div className="fin-page">
        <div className="mb-4">
          <Link
            href="/finance/submissions"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> Back to submissions
          </Link>
        </div>

        {loading ? (
          <p className="fin-section-lede">Loading submission…</p>
        ) : error || !submission || !reviewDetails || !paymentSummary ? (
          <EmptyState
            icon={FileText}
            title="Submission unavailable"
            description={error ?? "This submission could not be found."}
            actionLabel="Back to submissions"
            onAction={() => router.push("/finance/submissions")}
          />
        ) : (
          <>
            <OperateHeader
              title={submission.submissionId}
              description={submissionLifecycleDescription(submission.status)}
              signalValue={SUBMISSION_LIFECYCLE_LABELS[submission.status]}
              signalLabel="Status"
            />

            {justSubmitted && submission.status === "submitted" ? (
              <div className="fin-submission-success mt-4" role="status">
                <p className="fin-action-title">
                  Submission {submission.submissionId} submitted
                </p>
              </div>
            ) : null}

            {submission.status === "queried" ? (
              <div className="fin-submission-alert mt-4" role="alert">
                <p className="fin-action-title">Query — action required</p>
                <p className="fin-section-lede" style={{ marginTop: "0.35rem" }}>
                  Returned for clarification
                  {submission.queriedAt
                    ? ` on ${formatTimestamp(submission.queriedAt)}`
                    : ""}
                  .
                </p>
                {submission.queryNotes?.trim() ? (
                  <p className="fin-section-lede mt-2">
                    <strong>Query note:</strong> {submission.queryNotes.trim()}
                  </p>
                ) : null}
              </div>
            ) : null}

            <StreamSurface className="mt-4">
              <div className="fin-submission-review-block">
                <p className="fin-form-kicker">Position</p>
                <dl className="fin-submission-review-dl">
                  <div>
                    <dt>Status</dt>
                    <dd>{SUBMISSION_LIFECYCLE_LABELS[submission.status]}</dd>
                  </div>
                  <div>
                    <dt>Claim amount</dt>
                    <dd className="tabular-nums font-semibold">
                      {formatFinancialAmount(claimAmount, currency)}
                    </dd>
                  </div>
                  <div>
                    <dt>Amount paid</dt>
                    <dd className="tabular-nums">
                      {formatFinancialAmount(
                        paymentSummary.amountPaid,
                        currency
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Outstanding</dt>
                    <dd className="tabular-nums">
                      {formatFinancialAmount(
                        paymentSummary.outstandingAmount,
                        currency
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Payment status</dt>
                    <dd>
                      {PAYMENT_OUTCOME_LABELS[paymentSummary.outcome]}
                    </dd>
                  </div>
                  <div>
                    <dt>Created</dt>
                    <dd>{formatTimestamp(submission.createdAt)}</dd>
                  </div>
                  {submission.submittedAt ? (
                    <div>
                      <dt>Submitted</dt>
                      <dd>{formatTimestamp(submission.submittedAt)}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {editable ? (
                  <Link
                    href={`/finance/submissions/${submissionId}/edit`}
                    className="inline-flex h-8 items-center gap-2 rounded-[12px] bg-accent px-3 text-xs font-medium text-white shadow-sc hover:bg-[#1e40af]"
                  >
                    <Pencil className="h-4 w-4" />
                    {submission.status === "queried"
                      ? "Update & resubmit"
                      : "Continue editing"}
                  </Link>
                ) : null}
                {canSubmitSubmission(submission.status) ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={acting || !userId}
                    onClick={() => void handleSubmit()}
                  >
                    {submission.status === "queried"
                      ? "Resubmit"
                      : "Submit"}
                  </Button>
                ) : null}
                {canQuerySubmission(submission.status) ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={acting}
                    onClick={() => setShowQueryForm((open) => !open)}
                  >
                    Mark queried
                  </Button>
                ) : null}
                {canRecordPaymentForSubmission(submission.status) &&
                !paymentSummary.fullyPaid ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={acting}
                    onClick={() => setShowPaymentForm((open) => !open)}
                  >
                    Record payment
                  </Button>
                ) : null}
              </div>

              {showQueryForm ? (
                <div className="mt-4 grid gap-3 max-w-xl">
                  <FormField
                    label="Query notes"
                    htmlFor="submission-query-notes"
                    required
                  >
                    <textarea
                      id="submission-query-notes"
                      rows={3}
                      className={inputClassName}
                      value={queryNotes}
                      disabled={acting}
                      onChange={(event) => setQueryNotes(event.target.value)}
                    />
                  </FormField>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={acting}
                      onClick={() => void handleQuery()}
                    >
                      Confirm queried
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={acting}
                      onClick={() => setShowQueryForm(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}

              {showPaymentForm ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 max-w-2xl">
                  <p className="sm:col-span-2 fin-form-hint">
                    Multiple receipts are allowed; outstanding is claim minus
                    sum of recorded payments. Partial payment is supported.
                  </p>
                  <FormField
                    label="Amount received"
                    htmlFor="payment-amount"
                    required
                  >
                    <input
                      id="payment-amount"
                      type="number"
                      min={0}
                      step="0.01"
                      className={inputClassName}
                      value={paymentAmount}
                      disabled={acting}
                      onChange={(event) =>
                        setPaymentAmount(event.target.value)
                      }
                    />
                  </FormField>
                  <FormField
                    label="Payment date"
                    htmlFor="payment-date"
                    required
                  >
                    <input
                      id="payment-date"
                      type="date"
                      className={inputClassName}
                      value={paymentDate}
                      disabled={acting}
                      onChange={(event) => setPaymentDate(event.target.value)}
                    />
                  </FormField>
                  <FormField
                    label="Reference number"
                    htmlFor="payment-reference"
                  >
                    <input
                      id="payment-reference"
                      className={inputClassName}
                      value={paymentReference}
                      disabled={acting}
                      onChange={(event) =>
                        setPaymentReference(event.target.value)
                      }
                    />
                  </FormField>
                  <FormField label="Method" htmlFor="payment-method">
                    <select
                      id="payment-method"
                      className={selectClassName}
                      value={paymentMethod}
                      disabled={acting}
                      onChange={(event) => setPaymentMethod(event.target.value)}
                    >
                      <option value="">Select…</option>
                      <option value="bank_transfer">Bank transfer</option>
                      <option value="cheque">Cheque</option>
                      <option value="cash">Cash</option>
                      <option value="other">Other</option>
                    </select>
                  </FormField>
                  <FormField
                    label="Notes"
                    htmlFor="payment-notes"
                    className="sm:col-span-2"
                  >
                    <input
                      id="payment-notes"
                      className={inputClassName}
                      value={paymentNotes}
                      disabled={acting}
                      onChange={(event) => setPaymentNotes(event.target.value)}
                    />
                  </FormField>
                  <div className="sm:col-span-2 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={acting || !userId}
                      onClick={() => void handleRecordPayment()}
                    >
                      Save payment
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={acting}
                      onClick={() => setShowPaymentForm(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
            </StreamSurface>

            {payments.length > 0 ? (
              <StreamSurface className="mt-4">
                <p className="fin-form-kicker">Payments</p>
                <table className="fin-v13-table fin-v13-table--compact">
                  <thead>
                    <tr>
                      <th>Payment</th>
                      <th>Date</th>
                      <th>Reference</th>
                      <th className="fin-v13-num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePayments.map((payment) => (
                      <tr key={payment.paymentId}>
                        <td className="font-mono text-xs">
                          {payment.paymentId}
                        </td>
                        <td className="fin-v13-muted">
                          {formatTimestamp(payment.receivedAt)}
                        </td>
                        <td className="fin-v13-muted">
                          {payment.reference ?? "—"}
                        </td>
                        <td className="fin-v13-num">
                          {formatFinancialAmount(
                            payment.receivedAmount,
                            payment.currency
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {payments.length > FINANCE_UI_LIST_LIMIT ? (
                  <p className="fin-v13-muted mt-2 text-xs">
                    Showing {FINANCE_UI_LIST_LIMIT} of {payments.length} payments
                  </p>
                ) : null}
              </StreamSurface>
            ) : null}

            <StreamSurface className="mt-4">
              <p className="fin-section-lede mb-4">
                {getSubmissionCostCount(submission)} cost reference
                {getSubmissionCostCount(submission) === 1 ? "" : "s"}
                {submission.approvalId ? (
                  <>
                    {" "}
                    · Optional client authorisation link:{" "}
                    <Link
                      href={`/approvals/${submission.approvalId}`}
                      className="text-primary hover:underline"
                    >
                      {submission.approvalId}
                    </Link>
                  </>
                ) : null}
              </p>

              <SubmissionReviewPanel
                details={reviewDetails}
                selectedCosts={resolvedCosts}
                actualCost={actualCost ?? 0}
                markupAmount={markupAmount}
                markupRatePercent={markupRatePercent}
                claimAmount={claimAmount}
                currency={currency}
              />
            </StreamSurface>
          </>
        )}
      </div>
    </ModeFrame>
  );
}
