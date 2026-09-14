export { PlatformFinanceFoundationPage } from "./components/PlatformFinanceFoundationPage";
export {
  PLATFORM_FINANCE_MODULE_SLUG,
  PLATFORM_FINANCE_WORKSPACE_ID,
  PLATFORM_FINANCE_CAPABILITIES,
  type PlatformFinanceCapability,
  type FinanceFoundationStatus,
  type FinanceCompany,
  type FinanceAccount,
  type FinancePeriod,
  type FinanceTransaction,
  type FinanceJournalEntry,
  type FinanceJournalLine,
} from "./types";
export { PLATFORM_FINANCE_CAPABILITY_LIST } from "./constants";
export {
  assertBalanced,
  assertXorDebitCredit,
  assertValidPostingLines,
  isBalanced,
  isXorDebitCredit,
  sumCredits,
  sumDebits,
} from "./domain/invariants";
export { PlatformFinanceService } from "@/services/platform-finance/PlatformFinanceService";
