"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, FileText, Pencil } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { findAuthorizationForSubmission } from "@/lib/operational/finance/authorization";
import type {
  CostRecord,
  CostSubmission,
  ReimbursementAuthorization,
  ReimbursementPayment,
} from "@/lib/operational/finance/types";
import { CostSubmissionService } from "@/services/finance/CostSubmissionService";
import { ReimbursementAuthorizationService } from "@/services/finance/ReimbursementAuthorizationService";
import { ReimbursementPaymentService } from "@/services/finance/ReimbursementPaymentService";
import { UserService } from "@/services/users/UserService";
import { FINANCE_UI_LIST_LIMIT } from "../constants";
import { useSubmissionCostPool } from "../hooks/useSubmissionCostPool";
import { formatFinancialAmount } from "../utils/formatFinancialAmount";
import {
  formatMonetaryFromNumber,
  parseMonetaryInput,
} from "../utils/monetaryInput";
import { detailsFromPackage } from "./SubmissionDetailsForm";
import { MonetaryInput } from "./MonetaryInput";
import { resolveSubmissionCosts } from "../utils/resolveSubmissionCosts";
import {
  canAuthorizeSubmission,
  canCorrectPaymentForSubmission,
  canEditSubmission,
  canQuerySubmission,
  canRecordPaymentForSubmission,
  canReviseAuthorization,
  canSubmitSubmission,
  SUBMISSION_LIFECYCLE_LABELS,
  submissionLifecycleDescription,
} from "../utils/submissionLifecycle";
import {
  CLAIM_WORKFLOW_STATUS_LABELS,
  deriveClaimWorkflowStatus,
  PAYMENT_OUTCOME_LABELS,
  summarizeSubmissionPayments,
  type ClaimWorkflowStatus,
} from "../utils/submissionPayment";
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

function claimNextStep(status: ClaimWorkflowStatus | null): string {
  switch (status) {
    case "draft":
      return "Continue editing, then submit this claim.";
    case "queried":
      return "Update the claim to answer the query, then resubmit.";
    case "awaiting_authorization":
    case "submitted":
      return "Authorize the reimbursement amount for this claim.";
    case "authorized":
      return "Record payment when funds are received.";
    case "partially_paid":
      return "Record further payment, or correct an existing receipt if needed.";
    case "fully_reimbursed":
      return "This claim is fully reimbursed. No further action required.";
    case "cancelled":
      return "This claim is withdrawn.";
    default:
      return "Review the claim and use the actions below.";
  }
}

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
  const [authorizations, setAuthorizations] = useState<
    ReimbursementAuthorization[]
  >([]);
  const [resolvedCosts, setResolvedCosts] = useState<CostRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const paymentSubmitLock = useRef(false);
  const [queryNotes, setQueryNotes] = useState("");
  const [showQueryForm, setShowQueryForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(
    null
  );
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [authAmount, setAuthAmount] = useState("");
  const [authAuthorityReference, setAuthAuthorityReference] = useState("");
  const [authNotes, setAuthNotes] = useState("");
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
      const [record, paymentPage, authPage] = await Promise.all([
        CostSubmissionService.getCostSubmission(submissionId),
        ReimbursementPaymentService.listPayments({
          page: 1,
          pageSize: 100,
          submissionId,
        }),
        ReimbursementAuthorizationService.listAuthorizations({
          page: 1,
          pageSize: 10,
          submissionId,
        }),
      ]);
      if (!record) {
        setSubmission(null);
        setPayments([]);
        setAuthorizations([]);
        setError("This claim could not be found.");
        return;
      }
      setSubmission(record);
      setPayments(paymentPage.data);
      setAuthorizations(authPage.data);
      setQueryNotes(record.queryNotes ?? "");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load this claim."
      );
      setSubmission(null);
      setPayments([]);
      setAuthorizations([]);
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
        ? summarizeSubmissionPayments(submission, payments, authorizations)
        : null,
    [submission, payments, authorizations]
  );

  const workflowStatus = useMemo(
    () =>
      submission && paymentSummary
        ? deriveClaimWorkflowStatus(submission, paymentSummary)
        : null,
    [submission, paymentSummary]
  );

  const authorization = useMemo(
    () =>
      submission
        ? findAuthorizationForSubmission(
            authorizations,
            submission.submissionId
          )
        : null,
    [submission, authorizations]
  );
  const currency = submission?.currency ?? "NGN";
  const markupAmount = submission?.markup?.markupAmount ?? 0;
  const markupRatePercent = submission?.markup?.markupRatePercent ?? 0;
  const claimAmount = submission?.claimAmount ?? 0;
  const editable = submission ? canEditSubmission(submission.status) : false;
  const visiblePayments = payments.slice(0, FINANCE_UI_LIST_LIMIT);

  useEffect(() => {
    if (!paymentSummary) return;
    if (
      showPaymentForm &&
      !editingPaymentId &&
      !paymentAmount &&
      paymentSummary.outstandingAmount > 0
    ) {
      setPaymentAmount(
        formatMonetaryFromNumber(paymentSummary.outstandingAmount)
      );
    }
  }, [paymentSummary, showPaymentForm, editingPaymentId, paymentAmount]);

  useEffect(() => {
    if (!submission) return;
    if (showAuthForm && !authAmount) {
      const seed =
        authorization?.authorizedAmount ?? submission.claimAmount;
      setAuthAmount(
        seed != null && Number.isFinite(seed)
          ? formatMonetaryFromNumber(seed)
          : ""
      );
    }
    if (showAuthForm && !authAuthorityReference && authorization?.authorityReference) {
      setAuthAuthorityReference(authorization.authorityReference);
    }
  }, [
    submission,
    showAuthForm,
    authAmount,
    authAuthorityReference,
    authorization,
  ]);

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
            ? "Claim resubmitted"
            : "Claim submitted",
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
        description: "Record why this claim was returned.",
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

  async function handleAuthorize() {
    if (!submission || !userId || acting) return;
    const amount = parseMonetaryInput(authAmount);
    if (amount == null || amount <= 0) {
      toast({
        type: "error",
        title: "Enter a positive authorized amount",
      });
      return;
    }
    setActing(true);
    try {
      if (authorization) {
        await ReimbursementAuthorizationService.updateAuthorization(
          authorization.authorizationId,
          {
            authorizedAmount: amount,
            authorityReference: authAuthorityReference.trim() || undefined,
            notes: authNotes.trim() || undefined,
            authorizedBy: userId,
            authorizedAt: new Date().toISOString(),
          }
        );
        toast({ type: "success", title: "Authorization updated" });
      } else {
        await ReimbursementAuthorizationService.createAuthorization({
          submissionId: submission.submissionId,
          authorizedAmount: amount,
          currency,
          authorityReference: authAuthorityReference.trim() || undefined,
          notes: authNotes.trim() || undefined,
          authorizedBy: userId,
        });
        toast({ type: "success", title: "Claim authorized" });
      }
      setShowAuthForm(false);
      setAuthAuthorityReference("");
      setAuthNotes("");
      await load();
    } catch (err) {
      toast({
        type: "error",
        title: "Unable to authorize",
        description: err instanceof Error ? err.message : "Try again.",
      });
    } finally {
      setActing(false);
    }
  }

  function closePaymentForm() {
    setShowPaymentForm(false);
    setEditingPaymentId(null);
    setPaymentAmount("");
    setPaymentReference("");
    setPaymentMethod("");
    setPaymentNotes("");
    setPaymentDate(new Date().toISOString().slice(0, 10));
  }

  function openCreatePaymentForm() {
    setShowAuthForm(false);
    setShowQueryForm(false);
    if (showPaymentForm && !editingPaymentId) {
      closePaymentForm();
      return;
    }
    setEditingPaymentId(null);
    setPaymentAmount("");
    setPaymentReference("");
    setPaymentMethod("");
    setPaymentNotes("");
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setShowPaymentForm(true);
  }

  function openPaymentCorrection(payment: ReimbursementPayment) {
    setShowAuthForm(false);
    setShowQueryForm(false);
    if (editingPaymentId === payment.paymentId && showPaymentForm) {
      closePaymentForm();
      return;
    }
    setEditingPaymentId(payment.paymentId);
    setPaymentAmount(formatMonetaryFromNumber(payment.receivedAmount));
    setPaymentDate(
      /^\d{4}-\d{2}-\d{2}/.test(payment.receivedAt)
        ? payment.receivedAt.slice(0, 10)
        : new Date().toISOString().slice(0, 10)
    );
    setPaymentReference(payment.reference ?? "");
    setPaymentNotes(payment.notes ?? "");
    setShowPaymentForm(true);
    requestAnimationFrame(() => {
      document.getElementById("fin-payment-form")?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
  }

  async function handleRecordPayment() {
    if (!submission || !userId || acting || !paymentSummary) return;
    if (paymentSubmitLock.current) return;
    paymentSubmitLock.current = true;
    const isCorrection = Boolean(editingPaymentId);
    try {
      const amount = parseMonetaryInput(paymentAmount);
      if (amount == null || amount <= 0) {
        toast({
          type: "error",
          title: "Enter a positive payment amount",
        });
        return;
      }
      if (!isCorrection && amount > paymentSummary.outstandingAmount) {
        toast({
          type: "error",
          title: "Amount exceeds outstanding",
          description: `Outstanding is ${formatFinancialAmount(
            paymentSummary.outstandingAmount,
            currency
          )}. Payments cannot exceed the authorized amount.`,
        });
        return;
      }
      if (!paymentDate.trim()) {
        toast({ type: "error", title: "Payment date is required" });
        return;
      }
      setActing(true);
      if (isCorrection && editingPaymentId) {
        await ReimbursementPaymentService.updatePayment(editingPaymentId, {
          receivedAmount: amount,
          receivedAt: new Date(paymentDate).toISOString(),
          reference: paymentReference.trim(),
          notes: paymentNotes.trim(),
          recordedBy: userId,
        });
        toast({ type: "success", title: "Payment corrected" });
      } else {
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
      }
      closePaymentForm();
      await load();
    } catch (err) {
      toast({
        type: "error",
        title: isCorrection
          ? "Unable to correct payment"
          : "Unable to record payment",
        description: err instanceof Error ? err.message : "Try again.",
      });
    } finally {
      paymentSubmitLock.current = false;
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
            <ArrowLeft className="h-4 w-4" /> Back to claims
          </Link>
        </div>

        {loading ? (
          <p className="fin-section-lede">Loading claim…</p>
        ) : error || !submission || !reviewDetails || !paymentSummary ? (
          <EmptyState
            icon={FileText}
            title="Claim unavailable"
            description={error ?? "This claim could not be found."}
            actionLabel="Back to claims"
            onAction={() => router.push("/finance/submissions")}
          />
        ) : (
          <>
            <OperateHeader
              title={submission.submissionId}
              description={
                workflowStatus
                  ? CLAIM_WORKFLOW_STATUS_LABELS[workflowStatus]
                  : submissionLifecycleDescription(submission.status)
              }
              signalValue={
                workflowStatus
                  ? CLAIM_WORKFLOW_STATUS_LABELS[workflowStatus]
                  : SUBMISSION_LIFECYCLE_LABELS[submission.status]
              }
              signalLabel="Status"
            />

            <div className="fin-claim-next mt-3" role="status">
              <p className="fin-claim-next-label">What happens next</p>
              <p className="fin-claim-next-text">
                {claimNextStep(workflowStatus)}
              </p>
            </div>

            {justSubmitted && submission.status === "submitted" ? (
              <div className="fin-submission-success mt-4" role="status">
                <p className="fin-action-title">
                  Claim {submission.submissionId} submitted
                </p>
                <p className="fin-section-lede" style={{ marginTop: "0.35rem" }}>
                  Next: authorize the reimbursement amount, then record
                  payment receipts.
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
                <p className="fin-form-kicker">Claim</p>
                <dl className="fin-submission-review-dl">
                  <div>
                    <dt>Current status</dt>
                    <dd>
                      {workflowStatus
                        ? CLAIM_WORKFLOW_STATUS_LABELS[workflowStatus]
                        : SUBMISSION_LIFECYCLE_LABELS[submission.status]}
                    </dd>
                  </div>
                  <div>
                    <dt>Claim amount</dt>
                    <dd className="tabular-nums font-semibold">
                      {formatFinancialAmount(claimAmount, currency)}
                    </dd>
                  </div>
                  <div>
                    <dt>Authorised</dt>
                    <dd className="tabular-nums">
                      {paymentSummary.authorizedAmount != null
                        ? formatFinancialAmount(
                            paymentSummary.authorizedAmount,
                            currency
                          )
                        : "Not yet authorised"}
                    </dd>
                  </div>
                  <div>
                    <dt>Received so far</dt>
                    <dd className="tabular-nums">
                      {formatFinancialAmount(
                        paymentSummary.amountPaid,
                        currency
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Remaining</dt>
                    <dd className="tabular-nums">
                      {formatFinancialAmount(
                        paymentSummary.outstandingAmount,
                        currency
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Payment</dt>
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
                  {authorization ? (
                    <div>
                      <dt>Authorised on</dt>
                      <dd>{formatTimestamp(authorization.authorizedAt)}</dd>
                    </div>
                  ) : null}
                  {authorization?.authorityReference ? (
                    <div>
                      <dt>Authority reference</dt>
                      <dd>{authorization.authorityReference}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>

              <div
                className="fin-detail-actions"
                aria-labelledby="fin-detail-actions-heading"
              >
                <h3
                  id="fin-detail-actions-heading"
                  className="fin-form-kicker"
                >
                  Actions
                </h3>
                <div className="fin-detail-actions-row">
                {editable ? (
                  <Link
                    href={`/finance/submissions/${submissionId}/edit`}
                    className="fin-detail-action fin-detail-action--primary"
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
                    className="fin-detail-action"
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
                    variant="outline"
                    className="fin-detail-action"
                    disabled={acting}
                    onClick={() => setShowQueryForm((open) => !open)}
                  >
                    Mark queried
                  </Button>
                ) : null}
                {canAuthorizeSubmission(
                  submission.status,
                  paymentSummary.isAuthorized
                ) ? (
                  <Button
                    type="button"
                    size="sm"
                    className="fin-detail-action"
                    disabled={acting}
                    onClick={() => {
                      closePaymentForm();
                      setShowAuthForm((open) => !open);
                    }}
                  >
                    Authorize claim
                  </Button>
                ) : null}
                {canReviseAuthorization(
                  submission.status,
                  paymentSummary.isAuthorized
                ) && !paymentSummary.fullyPaid ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="fin-detail-action"
                    disabled={acting}
                    onClick={() => {
                      closePaymentForm();
                      setShowAuthForm((open) => !open);
                    }}
                  >
                    Review authorization
                  </Button>
                ) : null}
                {canRecordPaymentForSubmission(
                  submission.status,
                  paymentSummary.isAuthorized
                ) && !paymentSummary.fullyPaid ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="fin-detail-action"
                    disabled={acting}
                    onClick={() => openCreatePaymentForm()}
                  >
                    Record payment
                  </Button>
                ) : null}
                </div>
              </div>

              {showAuthForm ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 max-w-2xl">
                  <p className="sm:col-span-2 fin-form-hint">
                    Reimbursement authorization sets the amount that may be
                    paid. It is separate from Work Order client authorisation.
                    Outstanding and fully reimbursed use the authorized amount.
                  </p>
                  <FormField
                    label="Authorized amount"
                    htmlFor="auth-amount"
                    required
                  >
                    <MonetaryInput
                      id="auth-amount"
                      value={authAmount}
                      disabled={acting}
                      onValueChange={setAuthAmount}
                    />
                  </FormField>
                  <FormField
                    label="Authority reference"
                    htmlFor="auth-authority-ref"
                  >
                    <input
                      id="auth-authority-ref"
                      className={inputClassName}
                      placeholder="Memo / board / approval ref"
                      value={authAuthorityReference}
                      disabled={acting}
                      onChange={(event) =>
                        setAuthAuthorityReference(event.target.value)
                      }
                    />
                  </FormField>
                  <FormField label="Notes" htmlFor="auth-notes">
                    <input
                      id="auth-notes"
                      className={inputClassName}
                      value={authNotes}
                      disabled={acting}
                      onChange={(event) => setAuthNotes(event.target.value)}
                    />
                  </FormField>
                  <div className="sm:col-span-2 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={acting || !userId}
                      onClick={() => void handleAuthorize()}
                    >
                      {authorization
                        ? "Save authorization"
                        : "Confirm authorization"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={acting}
                      onClick={() => setShowAuthForm(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}

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
                <div
                  id="fin-payment-form"
                  className="mt-4 grid gap-3 sm:grid-cols-2 max-w-2xl"
                >
                  <div className="sm:col-span-2 fin-payment-context">
                    <div>
                      <p className="fin-metric-kicker">Claim</p>
                      <p className="fin-metric-value fin-metric-value--sm">
                        {formatFinancialAmount(claimAmount, currency)}
                      </p>
                    </div>
                    <div>
                      <p className="fin-metric-kicker">Authorised</p>
                      <p className="fin-metric-value fin-metric-value--sm">
                        {paymentSummary.authorizedAmount != null
                          ? formatFinancialAmount(
                              paymentSummary.authorizedAmount,
                              currency
                            )
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="fin-metric-kicker">Received so far</p>
                      <p className="fin-metric-value fin-metric-value--sm">
                        {formatFinancialAmount(
                          paymentSummary.amountPaid,
                          currency
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="fin-metric-kicker">Remaining</p>
                      <p className="fin-metric-value fin-metric-value--sm">
                        {formatFinancialAmount(
                          paymentSummary.outstandingAmount,
                          currency
                        )}
                      </p>
                    </div>
                  </div>
                  <p className="sm:col-span-2 fin-form-hint">
                    {editingPaymentId
                      ? "Update this receipt. The payment ID stays the same."
                      : "Record what was received against this claim."}
                  </p>
                  <FormField
                    label="Amount received"
                    htmlFor="payment-amount"
                    required
                  >
                    <MonetaryInput
                      id="payment-amount"
                      value={paymentAmount}
                      disabled={acting}
                      onValueChange={setPaymentAmount}
                    />
                  </FormField>
                  {!editingPaymentId &&
                  (parseMonetaryInput(paymentAmount) ?? 0) >
                    paymentSummary.outstandingAmount ? (
                    <p className="sm:col-span-2 fin-form-hint" role="alert">
                      Amount exceeds outstanding (
                      {formatFinancialAmount(
                        paymentSummary.outstandingAmount,
                        currency
                      )}
                      ).
                    </p>
                  ) : null}
                  <FormField
                    label="Date received"
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
                    label="Reference"
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
                  {!editingPaymentId ? (
                    <FormField label="Method" htmlFor="payment-method">
                      <select
                        id="payment-method"
                        className={selectClassName}
                        value={paymentMethod}
                        disabled={acting}
                        onChange={(event) =>
                          setPaymentMethod(event.target.value)
                        }
                      >
                        <option value="">Select…</option>
                        <option value="bank_transfer">Bank transfer</option>
                        <option value="cheque">Cheque</option>
                        <option value="cash">Cash</option>
                        <option value="other">Other</option>
                      </select>
                    </FormField>
                  ) : null}
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
                      disabled={
                        acting ||
                        !userId ||
                        (!editingPaymentId &&
                          (parseMonetaryInput(paymentAmount) ?? 0) >
                            paymentSummary.outstandingAmount)
                      }
                      onClick={() => void handleRecordPayment()}
                    >
                      {editingPaymentId ? "Save correction" : "Save payment"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={acting}
                      onClick={() => closePaymentForm()}
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
                      {canCorrectPaymentForSubmission(
                        submission.status,
                        paymentSummary.isAuthorized
                      ) ? (
                        <th className="fin-v13-action-col" />
                      ) : null}
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
                        {canCorrectPaymentForSubmission(
                          submission.status,
                          paymentSummary.isAuthorized
                        ) ? (
                          <td className="fin-v13-action-col">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="fin-detail-action"
                              disabled={acting}
                              aria-pressed={
                                editingPaymentId === payment.paymentId
                              }
                              onClick={() => openPaymentCorrection(payment)}
                            >
                              Correct
                            </Button>
                          </td>
                        ) : null}
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
