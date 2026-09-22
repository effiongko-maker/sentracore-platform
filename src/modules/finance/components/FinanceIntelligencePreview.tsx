import { BarChart3 } from "lucide-react";
import type { FinanceOperationalCostSummary } from "../types";
import { formatFinancialAmount } from "../utils/formatFinancialAmount";

export function FinanceIntelligencePreview({
  summary,
}: {
  summary?: FinanceOperationalCostSummary | null;
}) {
  // Truthful only: no chart or breakdown is offered here that the data does not actually support (no category,
  // location or date breakdown exists for imported historical costs — they are not inferred to make one).
  const copy =
    summary && summary.totalCount > 0
      ? `${summary.totalCount} cost record${summary.totalCount === 1 ? "" : "s"} totalling ${formatFinancialAmount(summary.sampleAmount, summary.currency)}${
          summary.historicalUnrecordedReimbursabilityCount > 0
            ? ` (${summary.historicalUnrecordedReimbursabilityCount} imported historically, with no recorded classification, location or date)`
            : ""
        }. Category, location and date breakdowns are shown only where the source actually recorded them.`
      : "More financial activity is required before operational patterns can be surfaced.";

  return (
    <section className="fin-v13-intel">
      <div className="fin-v13-intel-head">
        <span className="fin-v13-intel-icon" aria-hidden>
          <BarChart3 className="h-3.5 w-3.5" strokeWidth={1.75} />
        </span>
        <h2 className="fin-v13-metric-label">Intelligence</h2>
      </div>
      <p className="fin-v13-intel-copy">{copy}</p>
    </section>
  );
}
