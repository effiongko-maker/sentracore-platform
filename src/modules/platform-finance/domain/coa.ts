/**
 * Chart of Accounts domain helpers — organisation-scoped shared COA.
 * No hierarchy/parent/normal-balance in Slice 1 (schema already sufficient).
 */

import type { FinanceAccountType } from "@/modules/platform-finance/types";

export const FINANCE_ACCOUNT_TYPES = [
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
] as const satisfies readonly FinanceAccountType[];

export function isFinanceAccountType(value: unknown): value is FinanceAccountType {
  return (
    typeof value === "string" &&
    (FINANCE_ACCOUNT_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Proposed v1 COA expansion (NOT seeded in Slice 1).
 * Derived from Financial Request categories + obligation/cash model.
 * Seed only after product sign-off — do not invent filler accounts.
 */
export const FINANCE_COA_V1_PROPOSAL = [
  { code: "1000", name: "Cash", accountType: "asset", classification: "current_asset", rationale: "Cash at bank/on hand" },
  { code: "1100", name: "Bank", accountType: "asset", classification: "current_asset", rationale: "Operating bank accounts (Cash & Banks later)" },
  { code: "1200", name: "Accounts Receivable", accountType: "asset", classification: "current_asset", rationale: "Inflows until cash received" },
  { code: "1300", name: "Staff Advances", accountType: "asset", classification: "current_asset", rationale: "Advances / reimbursements outstanding" },
  { code: "2000", name: "Accounts Payable", accountType: "liability", classification: "current_liability", rationale: "Vendor Bill / Request obligations" },
  { code: "3000", name: "Equity", accountType: "equity", classification: "equity", rationale: "Opening equity" },
  { code: "4000", name: "Revenue", accountType: "revenue", classification: "operating_revenue", rationale: "Operating revenue" },
  { code: "5100", name: "Diesel / Fuel Expense", accountType: "expense", classification: "operating_expense", rationale: "Request category diesel_fuel" },
  { code: "5200", name: "Travel Expense", accountType: "expense", classification: "operating_expense", rationale: "Request category travel" },
  { code: "5300", name: "Accommodation Expense", accountType: "expense", classification: "operating_expense", rationale: "Request category accommodation" },
  { code: "5400", name: "Procurement Expense", accountType: "expense", classification: "operating_expense", rationale: "Request category procurement" },
  { code: "5500", name: "Petty Cash Expense", accountType: "expense", classification: "operating_expense", rationale: "Request category petty_cash" },
  { code: "5600", name: "Vendor Payment Expense", accountType: "expense", classification: "operating_expense", rationale: "Request/vendor settlement expense at cash" },
  { code: "5700", name: "Project Expenditure", accountType: "expense", classification: "operating_expense", rationale: "Request category project_expenditure" },
  { code: "5800", name: "Training Expense", accountType: "expense", classification: "operating_expense", rationale: "Request category training" },
  { code: "5900", name: "Event Expense", accountType: "expense", classification: "operating_expense", rationale: "Request category event" },
  { code: "5990", name: "Other Operating Expense", accountType: "expense", classification: "operating_expense", rationale: "Request category other_operational_expense" },
] as const;

export function normalizeAccountCode(code: string): string {
  return code.trim().toUpperCase();
}

export function normalizeAccountName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}
