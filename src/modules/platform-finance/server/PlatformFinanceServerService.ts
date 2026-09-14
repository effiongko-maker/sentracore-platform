import { ActionError } from "@/lib/actions/errors";
import {
  PlatformFinanceRepository,
  type CreateFinancePeriodInput,
  type CreateFinanceTransactionInput,
} from "@/modules/platform-finance/server/PlatformFinanceRepository";
import {
  closeFinancePeriod,
  postFinanceTransaction,
} from "@/modules/platform-finance/server/posting";
import type {
  FinanceFoundationStatus,
  FinanceJournalEntry,
  FinanceJournalLine,
  FinancePeriod,
  FinancePostingLineInput,
  FinanceTransaction,
} from "@/modules/platform-finance/types";

export class PlatformFinanceServerService {
  private readonly repo: PlatformFinanceRepository;

  constructor(private readonly organisationId: string) {
    this.repo = new PlatformFinanceRepository(organisationId);
  }

  async getFoundationStatus(): Promise<FinanceFoundationStatus> {
    return this.repo.getFoundationStatus();
  }

  async listCompanies() {
    return this.repo.listCompanies();
  }

  async listAccounts() {
    return this.repo.listAccounts();
  }

  async getTransaction(transactionId: string) {
    return this.repo.getTransaction(transactionId);
  }

  async getPeriod(periodId: string) {
    return this.repo.getPeriod(periodId);
  }

  async listPeriods(companyId?: string) {
    return this.repo.listPeriods(companyId);
  }

  async listTransactions(companyId?: string) {
    return this.repo.listTransactions(companyId);
  }

  async createPeriod(
    input: Omit<CreateFinancePeriodInput, never>
  ): Promise<FinancePeriod> {
    if (!input.companyId) {
      throw new ActionError("VALIDATION_ERROR", "companyId is required.");
    }
    if (!input.year || !input.month || !input.startDate || !input.endDate) {
      throw new ActionError(
        "VALIDATION_ERROR",
        "year, month, startDate, and endDate are required."
      );
    }
    return this.repo.createPeriod(input);
  }

  async createTransaction(
    input: Omit<CreateFinanceTransactionInput, "createdByProfileId"> & {
      createdByProfileId: string;
    }
  ): Promise<FinanceTransaction> {
    if (!input.companyId) {
      throw new ActionError("VALIDATION_ERROR", "companyId is required.");
    }
    if (!input.reference?.trim()) {
      throw new ActionError("VALIDATION_ERROR", "reference is required.");
    }
    if (!input.transactionDate) {
      throw new ActionError("VALIDATION_ERROR", "transactionDate is required.");
    }
    if (!input.description?.trim()) {
      throw new ActionError("VALIDATION_ERROR", "description is required.");
    }
    return this.repo.createTransaction(input);
  }

  async postTransaction(input: {
    transactionId: string;
    actorProfileId: string;
    lines: FinancePostingLineInput[];
    periodId?: string | null;
    reason?: string | null;
  }): Promise<{ journalEntryId: string; transaction: FinanceTransaction }> {
    const existing = await this.repo.getTransaction(input.transactionId);
    if (!existing) {
      throw new ActionError("VALIDATION_ERROR", "Financial transaction not found.");
    }
    if (existing.status === "posted") {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Financial transaction is already posted."
      );
    }

    const journalEntryId = await postFinanceTransaction({
      transactionId: input.transactionId,
      actorProfileId: input.actorProfileId,
      lines: input.lines,
      periodId: input.periodId,
      reason: input.reason,
    });

    const transaction = await this.repo.getTransaction(input.transactionId);
    if (!transaction) {
      throw new ActionError("INTERNAL_ERROR", "Posted transaction missing.");
    }

    return { journalEntryId, transaction };
  }

  async closePeriod(input: {
    periodId: string;
    actorProfileId: string;
    reason?: string | null;
  }): Promise<FinancePeriod> {
    await closeFinancePeriod(input);
    const periods = await this.repo.listPeriods();
    const period = periods.find((p) => p.id === input.periodId);
    if (!period) {
      throw new ActionError("INTERNAL_ERROR", "Closed period missing.");
    }
    return period;
  }

  async getJournal(
    journalEntryId: string
  ): Promise<{ entry: FinanceJournalEntry; lines: FinanceJournalLine[] }> {
    const entry = await this.repo.getJournalEntry(journalEntryId);
    if (!entry) {
      throw new ActionError("VALIDATION_ERROR", "Journal entry not found.");
    }
    const lines = await this.repo.listJournalLines(journalEntryId);
    return { entry, lines };
  }
}
