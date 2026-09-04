"use client";

import Link from "next/link";
import {
  COST_CATEGORY_LABELS,
  type CostCategory,
} from "@/lib/operational/finance";
import type { CostRecord } from "@/lib/operational/finance/types";
import { isCostSubmissionPackagePresent } from "@/lib/operational/finance/costSubmission";
import { FINANCE_UI_LIST_LIMIT } from "../constants";
import { formatFinancialAmount } from "../utils/formatFinancialAmount";
import type { SubmissionDetailsValues } from "./SubmissionDetailsForm";
import { detailsToPackage } from "./SubmissionDetailsForm";

function formatRecordedAt(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function SubmissionReviewPanel({
  details,
  selectedCosts,
  actualCost,
  markupAmount,
  markupRatePercent,
  claimAmount,
  currency,
}: {
  details: SubmissionDetailsValues;
  selectedCosts: CostRecord[];
  actualCost: number;
  markupAmount: number;
  markupRatePercent: number;
  claimAmount: number;
  currency: string;
}) {
  const pkg = detailsToPackage(details);
  const visibleCosts = selectedCosts.slice(0, FINANCE_UI_LIST_LIMIT);

  return (
    <div className="fin-submission-step">
      <section className="fin-submission-review-block">
        <h3 className="fin-section-title">Claim details</h3>
        <dl className="fin-submission-review-dl">
          <div>
            <dt>Claim type</dt>
            <dd>{details.submissionKind.trim() || "—"}</dd>
          </div>
          <div>
            <dt>Claim period</dt>
            <dd>{details.periodLabel.trim() || "—"}</dd>
          </div>
          <div>
            <dt>Document reference</dt>
            <dd>{details.packageReference.trim() || "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="fin-submission-review-block mt-4">
        <h3 className="fin-section-title">
          Costs ({selectedCosts.length})
        </h3>
        <p className="fin-section-lede">
          Total actual cost:{" "}
          <strong>{formatFinancialAmount(actualCost, currency)}</strong>
        </p>
        <ul className="fin-submission-cost-list">
          {visibleCosts.map((record) => (
            <li key={record.costId}>
              <span>
                <Link
                  href={`/finance/costs/${encodeURIComponent(record.costId)}`}
                  className="font-medium text-primary hover:underline"
                >
                  {record.costId}
                </Link>
                {" · "}
                {formatRecordedAt(record.recordedAt)} · {record.description}
              </span>
              <span>
                {COST_CATEGORY_LABELS[record.category as CostCategory]} ·{" "}
                {formatFinancialAmount(record.actualAmount, record.currency)}
              </span>
            </li>
          ))}
        </ul>
        {selectedCosts.length > FINANCE_UI_LIST_LIMIT ? (
          <p className="fin-section-lede mt-2">
            Showing {FINANCE_UI_LIST_LIMIT} of {selectedCosts.length} costs ·{" "}
            <Link href="/finance/costs" className="text-primary hover:underline">
              View all →
            </Link>
          </p>
        ) : null}
      </section>

      <section className="fin-submission-review-block mt-4">
        <h3 className="fin-section-title">Claim amount</h3>
        <dl className="fin-submission-review-dl">
          <div>
            <dt>Actual cost</dt>
            <dd>{formatFinancialAmount(actualCost, currency)}</dd>
          </div>
          <div>
            <dt>Markup</dt>
            <dd>
              {formatFinancialAmount(markupAmount, currency)} (
              {markupRatePercent}%)
            </dd>
          </div>
          <div>
            <dt>Claim total</dt>
            <dd>{formatFinancialAmount(claimAmount, currency)}</dd>
          </div>
        </dl>
      </section>

      <section className="fin-submission-review-block mt-4">
        <h3 className="fin-section-title">Supporting documents</h3>
        {isCostSubmissionPackagePresent(pkg) ? (
          <dl className="fin-submission-review-dl">
            <div>
              <dt>Document reference</dt>
              <dd>{pkg?.reference ?? "—"}</dd>
            </div>
            <div>
              <dt>Document type</dt>
              <dd>{pkg?.packageType ?? "—"}</dd>
            </div>
            <div>
              <dt>Document date</dt>
              <dd>{pkg?.packageDate ?? "—"}</dd>
            </div>
            <div>
              <dt>Document notes</dt>
              <dd>{pkg?.notes ?? "—"}</dd>
            </div>
          </dl>
        ) : (
          <p className="fin-section-lede">No supporting documents recorded.</p>
        )}
        {details.notes.trim() ? (
          <p className="fin-section-lede mt-2">
            Claim notes: {details.notes.trim()}
          </p>
        ) : null}
      </section>
    </div>
  );
}
