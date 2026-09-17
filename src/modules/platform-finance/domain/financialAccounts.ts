import type {
  FinanceFinancialAccountType,
  FinanceFinancialAccountVisibility,
} from "@/modules/platform-finance/types";

export const FINANCE_FINANCIAL_ACCOUNT_TYPES = [
  "bank",
  "cash",
  "petty_cash",
] as const satisfies readonly FinanceFinancialAccountType[];

export const FINANCE_FINANCIAL_ACCOUNT_VISIBILITIES = [
  "company",
  "restricted",
] as const satisfies readonly FinanceFinancialAccountVisibility[];

export function isFinanceFinancialAccountType(
  value: unknown
): value is FinanceFinancialAccountType {
  return (
    typeof value === "string" &&
    (FINANCE_FINANCIAL_ACCOUNT_TYPES as readonly string[]).includes(value)
  );
}

export function isFinanceFinancialAccountVisibility(
  value: unknown
): value is FinanceFinancialAccountVisibility {
  return (
    typeof value === "string" &&
    (FINANCE_FINANCIAL_ACCOUNT_VISIBILITIES as readonly string[]).includes(
      value
    )
  );
}

export function normalizeFinancialAccountName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeInstitutionName(value?: string | null): string | null {
  const normalized = value?.trim().replace(/\s+/g, " ") ?? "";
  return normalized || null;
}

export function normalizeCurrency(value: string): string {
  return value.trim().toUpperCase();
}

export function isCurrencyCode(value: string): boolean {
  return /^[A-Z]{3}$/.test(value);
}

export function isAccountNumberLast4(value?: string | null): boolean {
  return value == null || value === "" || /^[0-9]{4}$/.test(value);
}

export function financialAccountIsVisible(input: {
  hasViewCapability: boolean;
  hasCompanyAccess: boolean;
  visibilityPolicy: FinanceFinancialAccountVisibility;
  hasRestrictedAccountGrant: boolean;
}): boolean {
  return (
    input.hasViewCapability &&
    input.hasCompanyAccess &&
    (input.visibilityPolicy === "company" ||
      input.hasRestrictedAccountGrant)
  );
}

/**
 * Corporate restricted accounts remain in company books and Platform Finance.
 * A future private, user-owned Finance domain (internally "Batcave") must not
 * use this entity, its GL control account, its visibility grants, or reporting.
 */
export const CORPORATE_FINANCIAL_ACCOUNT_BOUNDARY =
  "Company-owned Platform Finance account; never a private user-owned account.";
