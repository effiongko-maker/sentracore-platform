"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ModeFrame, OperateHeader } from "@/components/platform";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { DEFAULT_COST_SUBMISSION_CURRENCY } from "@/lib/operational/finance/costSubmission";
import type { CostSubmission } from "@/lib/operational/finance/types";
import { CostSubmissionService } from "@/services/finance/CostSubmissionService";
import { UserService } from "@/services/users/UserService";
import { useSubmissionCostPool } from "../hooks/useSubmissionCostPool";
import {
  buildMarkupRepresentation,
  computeActualCostTotal,
  computeClaimAmount,
  syncMarkupFromAmount,
  syncMarkupFromPercent,
} from "../utils/submissionClaim";
import {
  formatAmountInput,
  parseAmountInput,
  submissionUserFacingError,
} from "../utils/submissionWorkflowHelpers";
import { SubmissionClaimForm } from "./SubmissionClaimForm";
import { SubmissionCostSelection } from "./SubmissionCostSelection";
import {
  detailsFromPackage,
  detailsToPackage,
  emptySubmissionDetails,
  SubmissionDetailsForm,
  type SubmissionDetailsValues,
} from "./SubmissionDetailsForm";
import { SubmissionReviewPanel } from "./SubmissionReviewPanel";

type WorkflowStep = "select" | "details" | "claim" | "review";

const STEPS: Array<{ id: WorkflowStep; label: string }> = [
  { id: "select", label: "Choose costs" },
  { id: "details", label: "Claim details" },
  { id: "claim", label: "Claim amount" },
  { id: "review", label: "Review" },
];

function stepIndex(step: WorkflowStep): number {
  return STEPS.findIndex((item) => item.id === step);
}

export function SubmissionWorkflowPage({
  submissionId,
  initialCostId,
}: {
  submissionId?: string;
  /** Prefill selection when starting from a classified eligible cost. */
  initialCostId?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const isEdit = Boolean(submissionId);
  const costPool = useSubmissionCostPool();

  const [step, setStep] = useState<WorkflowStep>("select");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() =>
    initialCostId ? new Set([initialCostId]) : new Set()
  );
  const [search, setSearch] = useState("");
  const [details, setDetails] = useState<SubmissionDetailsValues>(
    emptySubmissionDetails()
  );
  const [markupAmountInput, setMarkupAmountInput] = useState("0");
  const [markupPercentInput, setMarkupPercentInput] = useState("0");
  const [userId, setUserId] = useState<string | null>(null);
  const [existing, setExisting] = useState<CostSubmission | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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
    if (!submissionId) return;
    let cancelled = false;
    setLoadingExisting(true);
    CostSubmissionService.getCostSubmission(submissionId)
      .then((record) => {
        if (cancelled) return;
        if (!record) {
          setExisting(null);
          setFormError("This claim could not be found.");
          return;
        }
        if (record.status !== "draft" && record.status !== "queried") {
          setExisting(record);
          setFormError(
            "Only draft or queried claims can be edited here."
          );
          return;
        }
        setExisting(record);
        setSelectedIds(new Set(record.costRecordIds));
        setDetails(
          detailsFromPackage(
            record.submissionKind,
            record.periodLabel,
            record.submissionPackage,
            record.notes
          )
        );
        const markupAmount = record.markup?.markupAmount ?? 0;
        const markupPercent = record.markup?.markupRatePercent ?? 0;
        setMarkupAmountInput(formatAmountInput(markupAmount));
        setMarkupPercentInput(formatAmountInput(markupPercent));
      })
      .catch(() => {
        if (!cancelled) {
          setFormError("Unable to load this claim.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingExisting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [submissionId]);

  const selectedCosts = useMemo(() => {
    const byId = new Map(costPool.records.map((record) => [record.costId, record]));
    return [...selectedIds]
      .map((id) => byId.get(id))
      .filter((record): record is NonNullable<typeof record> => Boolean(record));
  }, [costPool.records, selectedIds]);

  const actualCost = useMemo(
    () => computeActualCostTotal(selectedCosts),
    [selectedCosts]
  );

  const currency =
    selectedCosts[0]?.currency ??
    existing?.currency ??
    DEFAULT_COST_SUBMISSION_CURRENCY;

  const markupAmount = parseAmountInput(markupAmountInput);
  const markupRatePercent = parseAmountInput(markupPercentInput);
  const claimAmount = computeClaimAmount(
    actualCost,
    Number.isFinite(markupAmount) ? markupAmount : 0
  );

  const handleMarkupAmountChange = useCallback(
    (value: string) => {
      setMarkupAmountInput(value);
      const amount = parseAmountInput(value);
      if (!Number.isFinite(amount)) return;
      const synced = syncMarkupFromAmount(actualCost, amount);
      setMarkupPercentInput(formatAmountInput(synced.markupRatePercent));
    },
    [actualCost]
  );

  const handleMarkupPercentChange = useCallback(
    (value: string) => {
      setMarkupPercentInput(value);
      const rate = parseAmountInput(value);
      if (!Number.isFinite(rate)) return;
      const synced = syncMarkupFromPercent(actualCost, rate);
      setMarkupAmountInput(formatAmountInput(synced.markupAmount));
    },
    [actualCost]
  );

  const toggleCost = useCallback((costId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(costId)) next.delete(costId);
      else next.add(costId);
      return next;
    });
  }, []);

  const toggleAll = useCallback((costIds: string[], selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of costIds) {
        if (selected) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const canContinue = useMemo(() => {
    if (step === "select") return selectedIds.size > 0;
    if (step === "claim") {
      return (
        Number.isFinite(markupAmount) &&
        Number.isFinite(markupRatePercent) &&
        markupAmount >= 0 &&
        markupRatePercent >= 0
      );
    }
    return true;
  }, [step, selectedIds.size, markupAmount, markupRatePercent]);

  const buildPayload = useCallback(
    (status: "draft" | "submitted") => {
      const now = new Date().toISOString();
      const facilityId = selectedCosts[0]?.facilityId ?? existing?.facilityId;
      const synced = syncMarkupFromAmount(
        actualCost,
        Number.isFinite(markupAmount) ? markupAmount : 0
      );

      return {
        costRecordIds: [...selectedIds],
        status,
        currency,
        claimAmount: computeClaimAmount(actualCost, synced.markupAmount),
        markup: buildMarkupRepresentation(synced),
        facilityId,
        periodLabel: details.periodLabel.trim() || undefined,
        submissionKind: details.submissionKind.trim() || undefined,
        submissionPackage: detailsToPackage(details),
        notes: details.notes.trim() || undefined,
        ...(status === "submitted"
          ? {
              submittedAt: now,
              submittedBy: userId ?? undefined,
            }
          : {}),
      };
    },
    [
      actualCost,
      currency,
      details,
      existing?.facilityId,
      markupAmount,
      selectedCosts,
      selectedIds,
      userId,
    ]
  );

  const persist = useCallback(
    async (status: "draft" | "submitted") => {
      if (!userId) {
        setFormError("Your user session could not be verified. Sign in again.");
        return;
      }
      if (selectedIds.size === 0) {
        setFormError("Select at least one reimbursable cost.");
        setStep("select");
        return;
      }
      if (
        !Number.isFinite(markupAmount) ||
        !Number.isFinite(markupRatePercent)
      ) {
        setFormError("Enter a valid markup amount or percentage.");
        setStep("claim");
        return;
      }

      setSaving(true);
      setFormError(null);
      try {
        const payload = buildPayload(status);
        let record: CostSubmission;
        if (isEdit && submissionId) {
          record = await CostSubmissionService.updateCostSubmission(
            submissionId,
            payload
          );
        } else {
          record = await CostSubmissionService.createCostSubmission({
            ...payload,
            createdBy: userId,
          });
        }

        if (status === "submitted") {
          toast({
            type: "success",
            title: "Claim submitted",
            description: `${record.submissionId} has been submitted for reimbursement.`,
          });
          router.push(
            `/finance/submissions/${record.submissionId}?submitted=1`
          );
        } else {
          toast({
            type: "success",
            title: "Draft saved",
            description: `${record.submissionId} saved as a draft.`,
          });
          router.push(`/finance/submissions/${record.submissionId}`);
        }
      } catch (error) {
        setFormError(submissionUserFacingError(error));
      } finally {
        setSaving(false);
      }
    },
    [
      buildPayload,
      isEdit,
      markupAmount,
      markupRatePercent,
      router,
      selectedIds.size,
      submissionId,
      toast,
      userId,
    ]
  );

  const loading = costPool.loading || loadingExisting;
  const blocked =
    formError &&
    isEdit &&
    existing &&
    existing.status !== "draft" &&
    existing.status !== "queried";

  if (blocked) {
    return (
      <ModeFrame mode="act">
        <EmptyState
          title="Claim not editable"
          description={formError ?? "This claim cannot be edited."}
          actionLabel="View claim"
          onAction={() =>
            router.push(`/finance/submissions/${submissionId}`)
          }
        />
      </ModeFrame>
    );
  }

  return (
    <ModeFrame mode="act">
      <div className="fin-page">
        <div className="mb-4">
          <Link
            href={
              submissionId
                ? `/finance/submissions/${submissionId}`
                : "/finance/submissions"
            }
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            {submissionId ? "Back to claim" : "Back to claims"}
          </Link>
        </div>

        <OperateHeader
          title={isEdit ? "Edit claim" : "Create reimbursement claim"}
          description="Select the costs you want reimbursed, add claim details, then confirm the amount."
        />

        <nav className="fin-submission-steps mt-4" aria-label="Workflow steps">
          {STEPS.map((item, index) => {
            const active = item.id === step;
            const complete = index < stepIndex(step);
            return (
              <button
                key={item.id}
                type="button"
                className={
                  active
                    ? "fin-submission-step-tab fin-submission-step-tab--active"
                    : complete
                      ? "fin-submission-step-tab fin-submission-step-tab--done"
                      : "fin-submission-step-tab"
                }
                onClick={() => {
                  if (index <= stepIndex(step)) setStep(item.id);
                }}
                disabled={index > stepIndex(step)}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {formError ? (
          <div className="fin-submission-error mt-4" role="alert">
            {formError}
          </div>
        ) : null}

        {loading ? (
          <p className="fin-section-lede mt-6">Loading…</p>
        ) : costPool.error ? (
          <EmptyState
            title="Unable to load costs"
            description={costPool.error}
            actionLabel="Try again"
            onAction={() => void costPool.reload()}
          />
        ) : (
          <>
            {step === "select" ? (
              <SubmissionCostSelection
                eligible={costPool.eligible}
                needsClassification={costPool.needsClassification}
                excludedCount={costPool.excluded.length}
                selectedIds={selectedIds}
                search={search}
                onSearchChange={setSearch}
                onToggle={toggleCost}
                onToggleAll={toggleAll}
              />
            ) : null}

            {step === "details" ? (
              <SubmissionDetailsForm
                values={details}
                onChange={(patch) =>
                  setDetails((prev) => ({ ...prev, ...patch }))
                }
              />
            ) : null}

            {step === "claim" ? (
              <SubmissionClaimForm
                actualCost={actualCost}
                currency={currency}
                markupAmountInput={markupAmountInput}
                markupPercentInput={markupPercentInput}
                onMarkupAmountChange={handleMarkupAmountChange}
                onMarkupPercentChange={handleMarkupPercentChange}
              />
            ) : null}

            {step === "review" ? (
              <SubmissionReviewPanel
                details={details}
                selectedCosts={selectedCosts}
                actualCost={actualCost}
                markupAmount={
                  Number.isFinite(markupAmount) ? markupAmount : 0
                }
                markupRatePercent={
                  Number.isFinite(markupRatePercent) ? markupRatePercent : 0
                }
                claimAmount={claimAmount}
                currency={currency}
              />
            ) : null}
          </>
        )}

        <div className="fin-submission-actions mt-6">
          {step !== "select" ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                const prev = STEPS[stepIndex(step) - 1];
                if (prev) setStep(prev.id);
              }}
              disabled={saving}
            >
              Back
            </Button>
          ) : (
            <span />
          )}

          <div className="flex flex-wrap gap-2">
            {step === "review" ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={saving || loading}
                  onClick={() => void persist("draft")}
                >
                  Save draft
                </Button>
                <Button
                  type="button"
                  disabled={saving || loading || !userId}
                  onClick={() => void persist("submitted")}
                >
                  Submit
                </Button>
              </>
            ) : (
              <Button
                type="button"
                disabled={!canContinue || saving || loading}
                onClick={() => {
                  const next = STEPS[stepIndex(step) + 1];
                  if (next) setStep(next.id);
                }}
              >
                Continue
              </Button>
            )}
          </div>
        </div>
      </div>
    </ModeFrame>
  );
}
