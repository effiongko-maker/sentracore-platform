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
 * PayChex Finance Officer-supplied Chart of Accounts.
 * Source: "Chart of Account- Paychex 041225.pdf" (60 accounts).
 *
 * `classification` preserves the meaningful source grouping without inventing
 * a parent/child hierarchy that finance_accounts does not support.
 */
export const PAYCHEX_AUTHORITATIVE_COA = [
  { code: "1000", name: "Land & Permanent Structures", accountType: "asset", classification: "non_current_asset" },
  { code: "1010", name: "Office Furnishings & Administrative Assets", accountType: "asset", classification: "non_current_asset" },
  { code: "1020", name: "Information Technology Infrastructure", accountType: "asset", classification: "non_current_asset" },
  { code: "1030", name: "Office Electronics & Utility Appliances", accountType: "asset", classification: "non_current_asset" },
  { code: "1040", name: "Motor Vehicles", accountType: "asset", classification: "non_current_asset" },
  { code: "1050", name: "Other Specialized Non-Current Assets", accountType: "asset", classification: "non_current_asset" },
  { code: "1060", name: "Cash & Bank Balances", accountType: "asset", classification: "current_asset" },
  { code: "1070", name: "Trade Accounts Receivable (Client Billings)", accountType: "asset", classification: "current_asset" },
  { code: "1080", name: "Due From Related Parties", accountType: "asset", classification: "current_asset" },
  { code: "1090", name: "Prepaid Project & Overhead Expenses", accountType: "asset", classification: "current_asset" },
  { code: "2000", name: "Trade Accounts Payable (Subcontractors & Suppliers)", accountType: "liability", classification: "current_liability" },
  { code: "2010", name: "Client Advances & Unearned Revenue", accountType: "liability", classification: "current_liability" },
  { code: "2020", name: "Due to Related Parties", accountType: "liability", classification: "current_liability" },
  { code: "2030", name: "Statutory & Tax Liabilities", accountType: "liability", classification: "current_liability" },
  { code: "2040", name: "Dividends Declared Payable", accountType: "liability", classification: "current_liability" },
  { code: "3000", name: "Share Capital / Owner Contributions", accountType: "equity", classification: "equity" },
  { code: "3010", name: "Accumulated Earnings (Profit/Loss)", accountType: "equity", classification: "equity" },
  // Phase 2E transitional cutover control — not permanent owner equity.
  { code: "3020", name: "Opening Balance Clearing", accountType: "equity", classification: "equity" },
  { code: "4000", name: "Facility Management Service Revenue", accountType: "revenue", classification: "project_revenue" },
  { code: "4010", name: "Construction Project Revenue", accountType: "revenue", classification: "project_revenue" },
  { code: "4020", name: "Procurement & Supply Chain Management Fees", accountType: "revenue", classification: "project_revenue" },
  { code: "4030", name: "Management Advisory & Consulting Services", accountType: "revenue", classification: "project_revenue" },
  { code: "4040", name: "Other Income", accountType: "revenue", classification: "other_income" },
  { code: "5000", name: "Direct Service Staff Wages & Benefits", accountType: "expense", classification: "direct_expense_facility_management" },
  { code: "5010", name: "Direct Subcontracted Services", accountType: "expense", classification: "direct_expense_facility_management" },
  { code: "5020", name: "Service Materials & Consumables", accountType: "expense", classification: "direct_expense_facility_management" },
  { code: "5030", name: "Technical Vehicle & Logistics Costs", accountType: "expense", classification: "direct_expense_facility_management" },
  { code: "5040", name: "Job-Specific Repair & Remediation", accountType: "expense", classification: "direct_expense_facility_management" },
  { code: "5050", name: "Project Renovation & Upgrades", accountType: "expense", classification: "direct_expense_facility_management" },
  { code: "5060", name: "On-Site Equipment & Appliance Costs", accountType: "expense", classification: "direct_expense_facility_management" },
  { code: "5070", name: "Diesel & Generator Fuel Costs", accountType: "expense", classification: "direct_expense_facility_management" },
  { code: "5080", name: "Client Site Utility Payments", accountType: "expense", classification: "direct_expense_facility_management" },
  { code: "5090", name: "Other Direct Service Costs", accountType: "expense", classification: "direct_expense_facility_management" },
  { code: "5100", name: "Direct Procurement Cost - Furniture & Fittings", accountType: "expense", classification: "direct_expense_procurement" },
  { code: "5110", name: "Direct Procurement Cost - IT Equipment & Peripherals", accountType: "expense", classification: "direct_expense_procurement" },
  { code: "5120", name: "Direct Procurement Cost - Network & Server Hardware", accountType: "expense", classification: "direct_expense_procurement" },
  { code: "5130", name: "Direct Procurement Cost - ISP Gadgets/Equipment", accountType: "expense", classification: "direct_expense_procurement" },
  { code: "5140", name: "Logistics & Delivery Expenses (Client-Specific)", accountType: "expense", classification: "direct_expense_procurement" },
  { code: "5150", name: "Onsite Supervision & Installation Labour", accountType: "expense", classification: "direct_expense_procurement" },
  { code: "5160", name: "Other Direct Procurement Costs", accountType: "expense", classification: "direct_expense_procurement" },
  { code: "5170", name: "Direct Job Costs - Construction Materials", accountType: "expense", classification: "direct_expense_construction" },
  { code: "5180", name: "Direct Job Costs - Subcontracted Labour", accountType: "expense", classification: "direct_expense_construction" },
  { code: "5190", name: "Direct Job Costs - Project Supervision & Management", accountType: "expense", classification: "direct_expense_construction" },
  { code: "5200", name: "Direct Job Costs - Equipment Rental & Usage", accountType: "expense", classification: "direct_expense_construction" },
  { code: "5210", name: "Direct Job Costs - Permits, Fees & Logistics", accountType: "expense", classification: "direct_expense_construction" },
  { code: "6000", name: "Administrative Office Rent Expense", accountType: "expense", classification: "operating_expense_general_office" },
  { code: "6010", name: "Office Utilities Expense", accountType: "expense", classification: "operating_expense_general_office" },
  { code: "6020", name: "Office Supplies Expense", accountType: "expense", classification: "operating_expense_general_office" },
  { code: "6030", name: "Office Equipment Repair & Maintenance", accountType: "expense", classification: "operating_expense_general_office" },
  { code: "6040", name: "Postage & Courier Expense", accountType: "expense", classification: "operating_expense_general_office" },
  { code: "6050", name: "Administrative Staff Salaries & Wages", accountType: "expense", classification: "operating_expense_personnel_staff" },
  { code: "6060", name: "Staff Bonuses & Allowances", accountType: "expense", classification: "operating_expense_personnel_staff" },
  { code: "6070", name: "Employee Professional Development", accountType: "expense", classification: "operating_expense_personnel_staff" },
  { code: "6080", name: "Business Ground Transportation Expense", accountType: "expense", classification: "operating_expense_travel_communication" },
  { code: "6090", name: "Business Airfare & Accommodation", accountType: "expense", classification: "operating_expense_travel_communication" },
  { code: "6100", name: "Telecommunication & Data Expense", accountType: "expense", classification: "operating_expense_travel_communication" },
  { code: "6110", name: "Accounting & Audit Fees", accountType: "expense", classification: "operating_expense_professional_other_services" },
  { code: "6120", name: "Software Subscriptions Expense", accountType: "expense", classification: "operating_expense_professional_other_services" },
  { code: "6130", name: "Business Meetings & Hospitality", accountType: "expense", classification: "operating_expense_professional_other_services" },
  { code: "6140", name: "Office Security & Protection Expense", accountType: "expense", classification: "operating_expense_professional_other_services" },
  { code: "6150", name: "Miscellaneous General Expenses", accountType: "expense", classification: "operating_expense_professional_other_services" },
] as const satisfies ReadonlyArray<{
  code: string;
  name: string;
  accountType: FinanceAccountType;
  classification: string;
}>;

export function normalizeAccountCode(code: string): string {
  return code.trim().toUpperCase();
}

export function normalizeAccountName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}
