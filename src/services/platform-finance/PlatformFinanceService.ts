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

  listCompanies(): Promise<FinanceCompany[]> {
    return postAction("listCompanies");
  },

  listAccounts(): Promise<FinanceAccount[]> {
    return postAction("listAccounts");
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
};
