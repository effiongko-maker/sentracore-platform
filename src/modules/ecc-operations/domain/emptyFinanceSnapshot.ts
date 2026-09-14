import { ECC_FINANCE_CATEGORIES } from "../constants";
import type { EccFinanceSnapshot } from "../types";
import { DEFAULT_ECC_CENTRE } from "../types";

/**
 * Empty finance snapshot used only as a structural fallback.
 * Live data comes from EccFinanceRepository via the ECC API.
 */
export function emptyEccFinanceSnapshot(
  centreId = DEFAULT_ECC_CENTRE.id
): EccFinanceSnapshot {
  const now = new Date();
  const periodLabel = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(now);

  return {
    centreId,
    asOf: now.toISOString(),
    periodLabel,
    currency: "NGN",
    budget: null,
    totalExpenditure: null,
    pendingCommitmentsTotal: null,
    availableBudget: null,
    budgetPosition: {
      budget: null,
      committed: null,
      spent: null,
      remaining: null,
    },
    transactions: [],
    commitments: [],
    categories: [...ECC_FINANCE_CATEGORIES],
  };
}
