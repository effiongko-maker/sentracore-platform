import type {
  FinanceAccount,
  FinanceCompany,
  FinanceFinancialAccount,
  FinanceFinancialAccountView,
  FinanceFoundationStatus,
  FinanceJournalEntry,
  FinanceJournalLine,
  FinancePeriod,
  FinancePostingLineInput,
  FinanceTransaction,
} from "@/modules/platform-finance/types";
import type { FinanceOverviewSnapshot } from "@/modules/platform-finance/overviewTypes";
import type { FinanceJournalRegisterResult } from "@/modules/platform-finance/journalTypes";
import type { FinanceGeneralLedgerResult } from "@/modules/platform-finance/domain/generalLedger";
import type { FinanceTrialBalanceResult } from "@/modules/platform-finance/domain/trialBalance";
import type {
  FinanceProfitAndLossResult,
  FinanceProfitAndLossScope,
} from "@/modules/platform-finance/domain/profitAndLoss";
import type { FinanceBalanceSheetResult } from "@/modules/platform-finance/domain/balanceSheet";
import type {
  OpeningPositionListItem,
  OpeningPositionReview,
} from "@/modules/platform-finance/domain/openingPositions";

const API_PATH = "/api/platform-finance";
const FINANCIAL_ACCOUNTS_API_PATH =
  "/api/platform-finance/financial-accounts";

type ApiSuccess<T> = { success: true; data: T };
type ApiFailure = { success: false; message?: string; code?: string };

async function postAction<T>(
  action: string,
  body: Record<string, unknown> = {}
): Promise<T> {
  const response = await fetch(API_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
    credentials: "same-origin",
  });
  const json = (await response.json()) as ApiSuccess<T> | ApiFailure;
  if (!response.ok || !json.success) {
    throw new Error(
      ("message" in json && json.message) ||
        `Platform Finance request failed (${action}).`
    );
  }
  return json.data;
}

async function postFinancialAccountAction<T>(
  action: string,
  body: Record<string, unknown> = {}
): Promise<T> {
  const response = await fetch(FINANCIAL_ACCOUNTS_API_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
    credentials: "same-origin",
  });
  const json = (await response.json()) as ApiSuccess<T> | ApiFailure;
  if (!response.ok || !json.success) {
    throw new Error(
      ("message" in json && json.message) ||
        `Financial Account request failed (${action}).`
    );
  }
  return json.data;
}

export const PlatformFinanceService = {
  getFinancialAccountContext(): Promise<{
    companies: FinanceCompany[];
    controlGlAccounts: FinanceAccount[];
    canView: boolean;
    canManage: boolean;
    canPrepareOpening: boolean;
    canPostOpening: boolean;
  }> {
    return postFinancialAccountAction("getContext");
  },

  listFinancialAccounts(companyId?: string | null): Promise<FinanceFinancialAccountView[]> {
    return postFinancialAccountAction("list", {
      companyId: companyId ?? undefined,
    });
  },

  listOpeningPositions(companyId?: string | null): Promise<OpeningPositionListItem[]> {
    return postFinancialAccountAction("listOpeningPositions", {
      companyId: companyId ?? undefined,
    });
  },

  getOpeningPositionReview(financialAccountId: string): Promise<OpeningPositionReview> {
    return postFinancialAccountAction("getOpeningPositionReview", {
      financialAccountId,
    });
  },

  updateOpeningPositionDraft(input: {
    financialAccountId: string;
    amount: number;
    cutoverDate?: string | null;
  }): Promise<OpeningPositionReview> {
    return postFinancialAccountAction("updateOpeningPositionDraft", {
      financialAccountId: input.financialAccountId,
      input: {
        amount: input.amount,
        cutoverDate: input.cutoverDate ?? null,
      },
    });
  },

  postOpeningPosition(financialAccountId: string): Promise<OpeningPositionReview> {
    return postFinancialAccountAction("postOpeningPosition", {
      financialAccountId,
    });
  },

  getFinancialAccount(id: string): Promise<FinanceFinancialAccountView> {
    return postFinancialAccountAction("get", { id });
  },

  createFinancialAccount(input: {
    companyId: string;
    accountType: string;
    name: string;
    institutionName?: string | null;
    accountNumberLast4?: string | null;
    currency: string;
    controlGlAccountId: string;
    visibilityPolicy: string;
  }): Promise<FinanceFinancialAccount> {
    return postFinancialAccountAction("create", { input });
  },

  updateFinancialAccount(input: {
    financialAccountId: string;
    companyId: string;
    accountType: string;
    name: string;
    institutionName?: string | null;
    accountNumberLast4?: string | null;
    currency: string;
    controlGlAccountId: string;
    visibilityPolicy: string;
    status: "active" | "inactive";
  }): Promise<FinanceFinancialAccount> {
    return postFinancialAccountAction("update", {
      id: input.financialAccountId,
      input,
    });
  },

  setFinancialAccountStatus(
    financialAccountId: string,
    status: "active" | "inactive"
  ): Promise<FinanceFinancialAccount> {
    return postFinancialAccountAction("setStatus", {
      id: financialAccountId,
      input: { status },
    });
  },

  async getFoundationStatus(): Promise<FinanceFoundationStatus> {
    const response = await fetch(API_PATH, { credentials: "same-origin" });
    const json = (await response.json()) as
      | ApiSuccess<FinanceFoundationStatus>
      | ApiFailure;
    if (!response.ok || !json.success) {
      throw new Error(
        ("message" in json && json.message) ||
          "Unable to load Platform Finance foundation status."
      );
    }
    return json.data;
  },

  getOverview(input?: {
    companyId?: string | null;
    periodId?: string | null;
  }): Promise<FinanceOverviewSnapshot> {
    return postAction("getOverview", {
      companyId: input?.companyId ?? undefined,
      input: {
        companyId: input?.companyId ?? null,
        periodId: input?.periodId ?? null,
      },
    });
  },

  listCompanies(): Promise<FinanceCompany[]> {
    return postAction("listCompanies");
  },

  listAccessibleCompanies(): Promise<FinanceCompany[]> {
    return postAction("listAccessibleCompanies");
  },

  getMyAccountingCapabilities(): Promise<{
    view: boolean;
    manageCoa: boolean;
    managePeriods: boolean;
    manageSetup: boolean;
    createTransaction: boolean;
    post: boolean;
  }> {
    return postAction("getMyAccountingCapabilities");
  },

  listAccounts(): Promise<FinanceAccount[]> {
    return postAction("listAccounts");
  },

  getAccount(accountId: string): Promise<{
    account: FinanceAccount;
    hasPostedUsage: boolean;
  }> {
    return postAction("getAccount", { id: accountId });
  },

  createAccount(input: {
    code: string;
    name: string;
    accountType: string;
    classification?: string | null;
    status?: "active" | "inactive";
  }): Promise<FinanceAccount> {
    return postAction("createAccount", { input });
  },

  updateAccount(input: {
    accountId: string;
    code?: string;
    name?: string;
    accountType?: string;
    classification?: string | null;
    status?: "active" | "inactive";
  }): Promise<FinanceAccount> {
    return postAction("updateAccount", { input });
  },

  setAccountStatus(input: {
    accountId: string;
    status: "active" | "inactive";
  }): Promise<FinanceAccount> {
    return postAction("setAccountStatus", { input });
  },

  listPeriods(companyId?: string): Promise<FinancePeriod[]> {
    return postAction("listPeriods", { companyId });
  },

  listTransactions(companyId?: string): Promise<FinanceTransaction[]> {
    return postAction("listTransactions", { companyId });
  },

  createPeriod(input: {
    companyId: string;
    year: number;
    month: number;
    startDate: string;
    endDate: string;
  }): Promise<FinancePeriod> {
    return postAction("createPeriod", { input });
  },

  generatePeriodCalendar(input: {
    companyId: string;
    year: number;
  }): Promise<{
    companyId: string;
    year: number;
    createdCount: number;
    existingCount: number;
    periods: FinancePeriod[];
  }> {
    return postAction("generatePeriodCalendar", { input });
  },

  createTransaction(input: {
    companyId: string;
    reference: string;
    transactionDate: string;
    description: string;
    transactionType?: string;
    amount?: number | null;
    currency?: string;
  }): Promise<FinanceTransaction> {
    return postAction("createTransaction", { input });
  },

  postTransaction(input: {
    transactionId: string;
    lines: FinancePostingLineInput[];
    periodId?: string | null;
    reason?: string | null;
  }): Promise<{ journalEntryId: string; transaction: FinanceTransaction }> {
    return postAction("postTransaction", { input });
  },

  findOpenPeriodForDate(input: {
    companyId: string;
    transactionDate: string;
  }): Promise<FinancePeriod | null> {
    return postAction("findOpenPeriodForDate", {
      companyId: input.companyId,
      input: {
        companyId: input.companyId,
        transactionDate: input.transactionDate,
      },
    });
  },

  postManualJournal(input: {
    companyId: string;
    transactionDate: string;
    description: string;
    lines: FinancePostingLineInput[];
    periodId?: string | null;
    reason?: string | null;
  }): Promise<{
    journalEntryId: string;
    transaction: FinanceTransaction;
    period: FinancePeriod;
    reference: string;
  }> {
    return postAction("postManualJournal", {
      companyId: input.companyId,
      input,
    });
  },

  closePeriod(input: {
    periodId: string;
    reason?: string | null;
  }): Promise<FinancePeriod> {
    return postAction("closePeriod", { input });
  },

  getJournal(
    journalEntryId: string
  ): Promise<{ entry: FinanceJournalEntry; lines: FinanceJournalLine[] }> {
    return postAction("getJournal", { id: journalEntryId });
  },

  listJournals(input?: {
    companyId?: string | null;
    periodId?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
    status?: string | null;
    sourceType?: string | null;
    search?: string | null;
    page?: number;
    pageSize?: number;
  }): Promise<FinanceJournalRegisterResult> {
    return postAction("listJournals", { input: input ?? {} });
  },

  listGeneralLedger(input: {
    companyId: string;
    accountId: string;
    periodId?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
    search?: string | null;
    page?: number;
    pageSize?: number;
  }): Promise<FinanceGeneralLedgerResult> {
    return postAction("listGeneralLedger", { input });
  },

  getTrialBalance(input: {
    companyId: string;
    periodId: string;
  }): Promise<FinanceTrialBalanceResult> {
    return postAction("getTrialBalance", { input });
  },

  getProfitAndLoss(input: {
    companyId: string;
    periodId: string;
    scope?: FinanceProfitAndLossScope;
  }): Promise<FinanceProfitAndLossResult> {
    return postAction("getProfitAndLoss", { input });
  },

  getBalanceSheet(input: {
    companyId: string;
    periodId: string;
  }): Promise<FinanceBalanceSheetResult> {
    return postAction("getBalanceSheet", { input });
  },

  getJournalDetail(journalEntryId: string): Promise<{
    id: string;
    journalNo: string;
    description: string;
    status: string;
    sourceType: string | null;
    reference: string;
    transactionId: string;
    transactionReference: string;
    transactionHref: string | null;
    sourceId: string | null;
    sourceLabel: string | null;
    sourceHref: string | null;
    companyId: string;
    companyName: string;
    periodId: string;
    periodLabel: string;
    entryDate: string;
    createdByName: string | null;
    createdAt: string;
    postedByName: string | null;
    postedAt: string;
    lines: Array<{
      id: string;
      lineNo: number;
      accountId: string;
      accountCode: string;
      accountName: string;
      accountType: string;
      description: string | null;
      debit: number;
      credit: number;
    }>;
    totalDebit: number;
    totalCredit: number;
    balanced: boolean;
  }> {
    return postAction("getJournalDetail", { id: journalEntryId });
  },
};
