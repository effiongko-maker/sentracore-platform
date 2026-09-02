import type { CostRecord } from "@/lib/operational/finance/types";
import {
  COST_CATEGORY_LABELS,
  type CostCategory,
} from "@/lib/operational/finance";
import { formatFinancialAmount } from "../utils/formatFinancialAmount";
import { computeActualCostTotal } from "../utils/submissionClaim";
import { filterCostsBySearch } from "../utils/submissionEligibility";

function formatRecordedAt(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function relatedWorkLabel(record: CostRecord): string {
  if (record.workOrderId) return record.workOrderId;
  if (record.workId) return record.workId;
  return "—";
}

export function SubmissionCostSelection({
  eligible,
  needsClassification,
  excludedCount,
  selectedIds,
  search,
  onSearchChange,
  onToggle,
  onToggleAll,
}: {
  eligible: CostRecord[];
  needsClassification: CostRecord[];
  excludedCount: number;
  selectedIds: Set<string>;
  search: string;
  onSearchChange: (value: string) => void;
  onToggle: (costId: string) => void;
  onToggleAll: (costIds: string[], selected: boolean) => void;
}) {
  const filtered = filterCostsBySearch(eligible, search);
  const selectedRecords = eligible.filter((r) => selectedIds.has(r.costId));
  const selectedTotal = computeActualCostTotal(selectedRecords);
  const currency = selectedRecords[0]?.currency ?? eligible[0]?.currency ?? "NGN";
  const allVisibleSelected =
    filtered.length > 0 && filtered.every((r) => selectedIds.has(r.costId));

  return (
    <div className="fin-submission-step">
      <p className="fin-section-lede">
        Select reimbursable costs to include in this submission. Cost records
        remain the source of truth — nothing is copied or changed here.
      </p>

      <div className="fin-submission-toolbar">
        <input
          type="search"
          className="fin-submission-search"
          placeholder="Search by description, ID, location, category, or work ref…"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          aria-label="Search eligible costs"
        />
      </div>

      <div className="fin-submission-selection-summary" aria-live="polite">
        <div>
          <p className="fin-metric-kicker">Selected</p>
          <p className="fin-metric-value">
            {selectedIds.size} cost{selectedIds.size === 1 ? "" : "s"}
          </p>
        </div>
        <div>
          <p className="fin-metric-kicker">Actual cost</p>
          <p className="fin-metric-value">
            {formatFinancialAmount(selectedTotal, currency)}
          </p>
        </div>
      </div>

      {eligible.length === 0 ? (
        <div className="fin-quiet-panel mt-4">
          <p className="fin-action-title">No reimbursable costs available</p>
          <p className="fin-section-lede" style={{ marginTop: "0.5rem" }}>
            Record operational costs and classify them as reimbursable before
            building a submission.
          </p>
        </div>
      ) : (
        <div className="fin-submission-table-wrap mt-4">
          <table className="fin-submission-table">
            <thead>
              <tr>
                <th scope="col">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(event) =>
                      onToggleAll(
                        filtered.map((r) => r.costId),
                        event.target.checked
                      )
                    }
                    aria-label="Select all visible costs"
                  />
                </th>
                <th scope="col">Date</th>
                <th scope="col">Cost</th>
                <th scope="col">Category</th>
                <th scope="col">Location</th>
                <th scope="col">Actual</th>
                <th scope="col">Budgeted</th>
                <th scope="col">Work / WO</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((record) => (
                <tr key={record.costId}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(record.costId)}
                      onChange={() => onToggle(record.costId)}
                      aria-label={`Select ${record.description}`}
                    />
                  </td>
                  <td className="text-muted">
                    {formatRecordedAt(record.recordedAt)}
                  </td>
                  <td>
                    <p className="font-medium">{record.description}</p>
                    <p className="text-xs text-muted">{record.costId}</p>
                  </td>
                  <td className="text-muted">
                    {COST_CATEGORY_LABELS[record.category as CostCategory]}
                  </td>
                  <td className="text-muted">{record.location}</td>
                  <td className="font-medium">
                    {formatFinancialAmount(record.actualAmount, record.currency)}
                  </td>
                  <td className="text-muted">
                    {record.budgetedAmount != null
                      ? formatFinancialAmount(
                          record.budgetedAmount,
                          record.currency
                        )
                      : "—"}
                  </td>
                  <td className="text-muted">{relatedWorkLabel(record)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {needsClassification.length > 0 ? (
        <section className="fin-submission-alert mt-4" aria-labelledby="needs-classification">
          <h3 id="needs-classification" className="fin-action-title">
            Costs needing classification ({needsClassification.length})
          </h3>
          <p className="fin-section-lede" style={{ marginTop: "0.35rem" }}>
            These costs have unknown reimbursement status. Classify them on the
            cost record before they can be included in a submission.
          </p>
          <ul className="fin-submission-muted-list">
            {needsClassification.slice(0, 5).map((record) => (
              <li key={record.costId}>
                {record.description} ·{" "}
                {formatFinancialAmount(record.actualAmount, record.currency)}
              </li>
            ))}
            {needsClassification.length > 5 ? (
              <li>…and {needsClassification.length - 5} more</li>
            ) : null}
          </ul>
        </section>
      ) : null}

      {excludedCount > 0 ? (
        <p className="fin-section-lede mt-4">
          {excludedCount} non-reimbursable cost
          {excludedCount === 1 ? "" : "s"} excluded from selection.
        </p>
      ) : null}
    </div>
  );
}
