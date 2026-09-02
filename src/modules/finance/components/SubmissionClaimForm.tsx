import { FormField, inputClassName } from "@/components/forms/FormField";
import { formatFinancialAmount } from "../utils/formatFinancialAmount";

export function SubmissionClaimForm({
  actualCost,
  currency,
  markupAmountInput,
  markupPercentInput,
  onMarkupAmountChange,
  onMarkupPercentChange,
}: {
  actualCost: number;
  currency: string;
  markupAmountInput: string;
  markupPercentInput: string;
  onMarkupAmountChange: (value: string) => void;
  onMarkupPercentChange: (value: string) => void;
}) {
  const markupAmount = Number(markupAmountInput.replace(/,/g, ""));
  const claimAmount =
    actualCost +
    (Number.isFinite(markupAmount) && markupAmount > 0 ? markupAmount : 0);

  return (
    <div className="fin-submission-step">
      <p className="fin-section-lede">
        Enter the markup for this submission. SentraCore calculates the
        complementary value — no default policy rate is applied.
      </p>

      <div className="fin-submission-claim-grid mt-4">
        <FormField label="Markup amount" htmlFor="markupAmount">
          <input
            id="markupAmount"
            inputMode="decimal"
            className={inputClassName}
            value={markupAmountInput}
            onChange={(event) => onMarkupAmountChange(event.target.value)}
            placeholder="0"
          />
        </FormField>

        <FormField label="Markup %" htmlFor="markupPercent">
          <input
            id="markupPercent"
            inputMode="decimal"
            className={inputClassName}
            value={markupPercentInput}
            onChange={(event) => onMarkupPercentChange(event.target.value)}
            placeholder="0"
          />
        </FormField>
      </div>

      <div className="fin-submission-claim-summary mt-6" aria-live="polite">
        <div className="fin-submission-claim-row">
          <span>Actual cost</span>
          <strong>{formatFinancialAmount(actualCost, currency)}</strong>
        </div>
        <div className="fin-submission-claim-row">
          <span>Markup</span>
          <strong>
            {formatFinancialAmount(
              Number.isFinite(markupAmount) ? markupAmount : 0,
              currency
            )}
            {markupPercentInput.trim()
              ? ` (${markupPercentInput.trim()}%)`
              : ""}
          </strong>
        </div>
        <div className="fin-submission-claim-row fin-submission-claim-row--total">
          <span>Claim amount</span>
          <strong>{formatFinancialAmount(claimAmount, currency)}</strong>
        </div>
      </div>

      <p className="fin-section-lede mt-4">
        Claim amount is always actual cost plus markup. It cannot be edited
        independently.
      </p>
    </div>
  );
}
