import { FormField, inputClassName } from "@/components/forms/FormField";
import { MonetaryInput } from "./MonetaryInput";
import { formatFinancialAmount } from "../utils/formatFinancialAmount";
import { parseMonetaryInput } from "../utils/monetaryInput";

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
  const markupAmount = parseMonetaryInput(markupAmountInput) ?? 0;
  const claimAmount =
    actualCost +
    (Number.isFinite(markupAmount) && markupAmount > 0 ? markupAmount : 0);

  return (
    <div className="fin-submission-step">
      <p className="fin-section-lede">
        Confirm the claim amount. Selected costs stay as recorded — add markup
        only if needed.
      </p>

      <div className="fin-submission-claim-grid mt-4">
        <FormField label="Markup amount" htmlFor="markupAmount">
          <MonetaryInput
            id="markupAmount"
            value={markupAmountInput}
            onValueChange={onMarkupAmountChange}
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
          <span>Selected costs</span>
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
    </div>
  );
}
