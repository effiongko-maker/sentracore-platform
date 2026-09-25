"use client";

import Link from "next/link";
import { CostsClaimsNav } from "./CostsClaimsNav";
import { ArrowLeft, CalendarClock } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ModeFrame, OperateHeader, StreamSurface } from "@/components/platform";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  MonthlyPaymentsService,
  type MonthlyContractPayment,
} from "@/services/finance/MonthlyPaymentsService";
import {
  formatMonthlyPaymentAmount,
  formatMonthlyPaymentDatetime,
} from "../utils/monthlyContractPayments";

/**
 * Read-only detail for one Monthly Contract Payment record — a single Platform
 * Finance historical commercial fact, identified only by its month slug (never the
 * source's own code/UUID; see MonthlyPaymentsService/route.ts). No editing, no
 * comments, no approvals — this surface composes a future native lifecycle
 * (Submitted → follow-up → Paid, plus Approvals) without building it yet.
 */
export function MonthlyContractPaymentDetailPage({ slug }: { slug: string }) {
  const [record, setRecord] = useState<MonthlyContractPayment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    MonthlyPaymentsService.getBySlug(slug)
      .then((data) => {
        setRecord(data);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Unable to load this monthly contract payment.");
        setLoading(false);
      });
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <ModeFrame mode="act">
        <div className="fin-v13-skel-block" style={{ maxWidth: "40rem" }} />
      </ModeFrame>
    );
  }

  if (error || !record) {
    return (
      <ModeFrame mode="act">
        <EmptyState
          icon={CalendarClock}
          title="Unable to load monthly contract payment"
          description={error ?? "This monthly contract payment could not be found."}
          actionLabel="Back to monthly contract payments"
          onAction={() => {
            window.location.href = "/finance/monthly-payments";
          }}
        />
      </ModeFrame>
    );
  }

  const status = record.status ?? { label: "Not recorded", tone: "neutral" as const };

  return (
    <ModeFrame mode="act">
      <CostsClaimsNav />
      <div className="mb-4">
        <Link
          href="/finance/monthly-payments"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to monthly contract payments
        </Link>
      </div>
      <OperateHeader
        title={record.month ?? "Monthly contract payment"}
        description="Fixed monthly FM fee under the NCC contract. Read-only projection of Platform Finance's historical commercial facts — no value is stored in FM."
      />
      <StreamSurface className="mt-4">
        <div className="rounded-md border border-border/70 bg-muted/30 px-4 py-3 text-sm" style={{ maxWidth: "40rem" }}>
          <p className="font-medium text-foreground">Commercial position</p>
          <dl className="fin-submission-review-dl mt-1">
            <div>
              <dt>Requested amount</dt>
              <dd>{formatMonthlyPaymentAmount(record.requestedAmount, record.currency)}</dd>
            </div>
            <div>
              <dt>Amount received</dt>
              <dd>{formatMonthlyPaymentAmount(record.amountReceived, record.currency)}</dd>
            </div>
            <div>
              <dt>Submission date</dt>
              {/* Not present in the source data today — never inferred from import time or any other field. */}
              <dd>Not recorded</dd>
            </div>
            <div>
              <dt>Payment date/time</dt>
              <dd>{formatMonthlyPaymentDatetime(record.paymentDatetime)}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <span className={`fin-v13-pill fin-v13-pill--${status.tone}`}>{status.label}</span>
                {record.sourcePaymentStatus ? (
                  <span className="ml-2 text-xs italic text-muted">
                    (source: &ldquo;{record.sourcePaymentStatus}&rdquo;)
                  </span>
                ) : null}
              </dd>
            </div>
            {record.commercialReference ? (
              <div>
                <dt>Commercial reference</dt>
                <dd>{record.commercialReference}</dd>
              </div>
            ) : null}
          </dl>
          <p className="mt-2 text-xs text-muted">
            Commercial values sourced from Platform Finance. This record has no comments, approvals or lifecycle
            actions yet.
          </p>
        </div>
      </StreamSurface>
    </ModeFrame>
  );
}
