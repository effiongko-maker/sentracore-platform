import { DEFAULT_APPROVAL_CURRENCY } from "@/modules/approvals/constants";

export function formatFinancialAmount(
  amount: number | null | undefined,
  currency = DEFAULT_APPROVAL_CURRENCY
): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  return `${currency} ${amount.toLocaleString("en-NG")}`;
}

export function sumAmounts(
  rows: Array<{ amount?: number }>
): number {
  return rows.reduce((total, row) => {
    if (row.amount == null || !Number.isFinite(row.amount)) return total;
    return total + row.amount;
  }, 0);
}
