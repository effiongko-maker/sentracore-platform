import type {
  FinanceAccount,
  FinanceCompany,
  FinanceFoundationStatus,
  FinanceJournalEntry,
  FinanceJournalLine,
  FinancePeriod,
  FinancePostingLineInput,
  FinanceTransaction,
} from "@/modules/platform-finance/types";
import type { FinanceOverviewSnapshot } from "@/modules/platform-finance/overviewTypes";

const API_PATH = "/api/platform-finance";

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

export const PlatformFinanceService = {
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
  }): Promise<{
    rows: Array<{
      id: string;
      journalNo: string;
      entryDate: string;
      periodId: string;
      periodLabel: string;
      companyId: string;
      companyName: string;
      description: string;
      sourceType: string | null;
      reference: string;
      totalDebit: number;
      totalCredit: number;
      status: string;
      transactionId: string;
      postedAt: string;
    }>;
    total: number;
    page: number;
    pageSize: number;
  }> {
    return postAction("listJournals", { input: input ?? {} });
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
