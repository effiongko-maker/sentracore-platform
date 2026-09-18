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
import {
  isFinanceAccountType,
  normalizeAccountCode,
  normalizeAccountName,
} from "@/modules/platform-finance/domain/coa";
import { yearMonthBounds } from "@/modules/platform-finance/domain/periods";
import { assertValidPostingLines } from "@/modules/platform-finance/domain/invariants";
import type {
  FinanceAccount,
  FinanceAccountStatus,
  FinanceAccountType,
  FinanceCompany,
  FinanceFoundationStatus,
  FinanceJournalEntry,
  FinanceJournalLine,
  FinancePeriod,
  FinancePostingLineInput,
  FinanceTransaction,
  PlatformFinanceCapability,
} from "@/modules/platform-finance/types";
import { PLATFORM_FINANCE_CAPABILITIES } from "@/modules/platform-finance/types";
import { randomBytes } from "node:crypto";
import { PLATFORM_FINANCE_OVERVIEW_LIST_LIMIT } from "@/modules/platform-finance/constants";
import type { FinanceOverviewSnapshot } from "@/modules/platform-finance/overviewTypes";
import type {
  FinanceJournalDetail,
  FinanceJournalListFilters,
  FinanceJournalRegisterResult,
  FinanceJournalRegisterRow,
} from "@/modules/platform-finance/journalTypes";
import { PlatformFinanceRequestsRepository } from "@/modules/platform-finance/server/PlatformFinanceRequestsRepository";
import { PlatformFinanceVendorBillsRepository } from "@/modules/platform-finance/server/PlatformFinanceVendorBillsRepository";
import { createAdminClient } from "@/utils/supabase/admin";
import { financePeriodLabel } from "@/modules/platform-finance/domain/periods";

function roundMoney2(value: number): number {
  return Math.round(value * 100) / 100;
}

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function periodLabel(year: number, month: number): string {
  return `${MONTH_LABELS[month - 1] ?? month} ${year}`;
}

/** Sort key: year*12 + month (1–12). */
function periodOrdinal(year: number, month: number): number {
  return year * 12 + month;
}

/**
 * Default Overview period from existing open/closed periods — prefer the open
 * period for the current calendar month, else the most recent open period at or
 * before the current month, else the most recent period at or before current.
 * Future-only periods (e.g. verify fixtures) are listed but not auto-selected.
 * Does not hard-code a product month/year.
 */
export function selectDefaultFinancePeriod(
  periods: readonly FinancePeriod[],
  asOf: Date = new Date()
): FinancePeriod | null {
  if (periods.length === 0) return null;
  const currentOrdinal =
    asOf.getUTCFullYear() * 12 + (asOf.getUTCMonth() + 1);

  const relevant = periods.filter(
    (p) => periodOrdinal(p.year, p.month) <= currentOrdinal
  );
  if (relevant.length === 0) return null;

  const open = relevant.filter((p) => p.status === "open");
  const currentOpen = open.find(
    (p) => periodOrdinal(p.year, p.month) === currentOrdinal
  );
  if (currentOpen) return currentOpen;

  const openNewestFirst = [...open].sort(
    (a, b) =>
      periodOrdinal(b.year, b.month) - periodOrdinal(a.year, a.month)
  );
  if (openNewestFirst[0]) return openNewestFirst[0];

  return [...relevant].sort(
    (a, b) =>
      periodOrdinal(b.year, b.month) - periodOrdinal(a.year, a.month)
  )[0];
}

function sumBucket(
  amounts: number[]
): { count: number; totalAmount: number } {
  return {
    count: amounts.length,
    totalAmount: amounts.reduce((s, n) => s + n, 0),
  };
}

function auditActivityLabel(action: string): string {
  if (action === "finance.transaction.posted") return "Journal posted";
  if (action === "finance.period.closed") return "Accounting period closed";
  if (action === "finance.request.submitted") return "Financial request submitted";
  if (action === "finance.request.approved") return "Request approved";
  if (action === "finance.request.partially_approved") {
    return "Request partially approved";
  }
  if (action === "finance.request.rejected") return "Request rejected";
  return action.replace(/^finance\./, "").replace(/\./g, " ");
}

export class PlatformFinanceServerService {
  private readonly repo: PlatformFinanceRepository;
  private readonly requestsRepo: PlatformFinanceRequestsRepository;

  constructor(private readonly organisationId: string) {
    this.repo = new PlatformFinanceRepository(organisationId);
    this.requestsRepo = new PlatformFinanceRequestsRepository(organisationId);
  }

  async getFoundationStatus(): Promise<FinanceFoundationStatus> {
    return this.repo.getFoundationStatus();
  }

  async listCompanies() {
    return this.repo.listCompanies();
  }

  async listAccessibleCompanies(profileId: string): Promise<FinanceCompany[]> {
    const [companies, accessibleIds] = await Promise.all([
      this.repo.listCompanies(),
      this.repo.listAccessibleCompanyIds(profileId),
    ]);
    const allowed = new Set(accessibleIds);
    return companies.filter(
      (c) => allowed.has(c.id) && c.status === "active"
    );
  }

  async getMyAccountingCapabilities(profileId: string): Promise<{
    view: boolean;
    manageCoa: boolean;
    managePeriods: boolean;
    manageSetup: boolean;
    createTransaction: boolean;
    post: boolean;
  }> {
    const admin = createAdminClient();
    const wanted = [
      PLATFORM_FINANCE_CAPABILITIES.view,
      PLATFORM_FINANCE_CAPABILITIES.manage_coa,
      PLATFORM_FINANCE_CAPABILITIES.manage_periods,
      PLATFORM_FINANCE_CAPABILITIES.manage_setup,
      PLATFORM_FINANCE_CAPABILITIES.create_transaction,
      PLATFORM_FINANCE_CAPABILITIES.post,
    ] as const;
    const { data, error } = await admin
      .from("finance_capability_grants")
      .select("capability")
      .eq("organisation_id", this.organisationId)
      .eq("profile_id", profileId)
      .in("capability", [...wanted]);
    if (error) {
      throw new ActionError(
        "INTERNAL_ERROR",
        "Unable to load accounting capabilities."
      );
    }
    const granted = new Set(
      (data ?? []).map((row) => row.capability as PlatformFinanceCapability)
    );
    return {
      view: granted.has(PLATFORM_FINANCE_CAPABILITIES.view),
      manageCoa: granted.has(PLATFORM_FINANCE_CAPABILITIES.manage_coa),
      managePeriods: granted.has(PLATFORM_FINANCE_CAPABILITIES.manage_periods),
      manageSetup: granted.has(PLATFORM_FINANCE_CAPABILITIES.manage_setup),
      createTransaction: granted.has(
        PLATFORM_FINANCE_CAPABILITIES.create_transaction
      ),
      post: granted.has(PLATFORM_FINANCE_CAPABILITIES.post),
    };
  }

  /**
   * Resolve the open company period covering a transaction date.
   * Used for UI period preview and server-side period pinning before post.
   */
  async findOpenPeriodForDate(
    companyId: string,
    transactionDate: string
  ): Promise<FinancePeriod | null> {
    if (!companyId || !/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)) {
      return null;
    }
    const periods = await this.repo.listPeriods(companyId);
    return (
      periods.find(
        (p) =>
          p.status === "open" &&
          p.startDate <= transactionDate &&
          p.endDate >= transactionDate
      ) ?? null
    );
  }

  async listAccounts() {
    return this.repo.listAccounts();
  }

  async getAccount(accountId: string): Promise<{
    account: FinanceAccount;
    hasPostedUsage: boolean;
  }> {
    const account = await this.repo.getAccount(accountId);
    if (!account) {
      throw new ActionError("VALIDATION_ERROR", "Account not found.");
    }
    const hasPostedUsage = await this.repo.accountHasPostedUsage(accountId);
    return { account, hasPostedUsage };
  }

  async createAccount(input: {
    code: string;
    name: string;
    accountType: FinanceAccountType;
    classification?: string | null;
    status?: FinanceAccountStatus;
  }): Promise<FinanceAccount> {
    const code = normalizeAccountCode(input.code);
    const name = normalizeAccountName(input.name);
    if (!code) {
      throw new ActionError("VALIDATION_ERROR", "Account code is required.");
    }
    if (!name) {
      throw new ActionError("VALIDATION_ERROR", "Account name is required.");
    }
    if (!isFinanceAccountType(input.accountType)) {
      throw new ActionError("VALIDATION_ERROR", "Invalid account type.");
    }
    const status = input.status ?? "active";
    if (status !== "active" && status !== "inactive") {
      throw new ActionError("VALIDATION_ERROR", "Invalid account status.");
    }
    const existing = await this.repo.getAccountByCode(code);
    if (existing) {
      throw new ActionError(
        "VALIDATION_ERROR",
        `Account code ${code} already exists.`
      );
    }
    return this.repo.createAccount({
      code,
      name,
      accountType: input.accountType,
      classification: input.classification?.trim() || null,
      status,
    });
  }

  async updateAccount(input: {
    accountId: string;
    name?: string;
    accountType?: FinanceAccountType;
    classification?: string | null;
    status?: FinanceAccountStatus;
    code?: string;
  }): Promise<FinanceAccount> {
    const existing = await this.repo.getAccount(input.accountId);
    if (!existing) {
      throw new ActionError("VALIDATION_ERROR", "Account not found.");
    }

    const hasPosted = await this.repo.accountHasPostedUsage(input.accountId);
    const patch: {
      name?: string;
      accountType?: FinanceAccountType;
      classification?: string | null;
      status?: FinanceAccountStatus;
      code?: string;
    } = {};

    if (input.name !== undefined) {
      const name = normalizeAccountName(input.name);
      if (!name) {
        throw new ActionError("VALIDATION_ERROR", "Account name is required.");
      }
      patch.name = name;
    }
    if (input.classification !== undefined) {
      patch.classification = input.classification?.trim() || null;
    }
    if (input.status !== undefined) {
      if (input.status !== "active" && input.status !== "inactive") {
        throw new ActionError("VALIDATION_ERROR", "Invalid account status.");
      }
      patch.status = input.status;
    }
    if (input.code !== undefined) {
      if (hasPosted) {
        throw new ActionError(
          "VALIDATION_ERROR",
          "Cannot change code of an account used in posted journals. Deactivate instead."
        );
      }
      const code = normalizeAccountCode(input.code);
      if (!code) {
        throw new ActionError("VALIDATION_ERROR", "Account code is required.");
      }
      const clash = await this.repo.getAccountByCode(code);
      if (clash && clash.id !== existing.id) {
        throw new ActionError(
          "VALIDATION_ERROR",
          `Account code ${code} already exists.`
        );
      }
      patch.code = code;
    }
    if (input.accountType !== undefined) {
      if (hasPosted) {
        throw new ActionError(
          "VALIDATION_ERROR",
          "Cannot change type of an account used in posted journals."
        );
      }
      if (!isFinanceAccountType(input.accountType)) {
        throw new ActionError("VALIDATION_ERROR", "Invalid account type.");
      }
      patch.accountType = input.accountType;
    }

    return this.repo.updateAccount(input.accountId, patch);
  }

  async setAccountStatus(input: {
    accountId: string;
    status: FinanceAccountStatus;
  }): Promise<FinanceAccount> {
    return this.updateAccount({
      accountId: input.accountId,
      status: input.status,
    });
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
    const company = await this.repo.getCompany(input.companyId);
    if (!company || company.status !== "active") {
      throw new ActionError("VALIDATION_ERROR", "Company not found or inactive.");
    }
    const existing = await this.repo.findPeriodByCompanyYearMonth(
      input.companyId,
      input.year,
      input.month
    );
    if (existing) {
      throw new ActionError(
        "VALIDATION_ERROR",
        `Period ${input.year}-${input.month} already exists for this company.`
      );
    }
    return this.repo.createPeriod(input);
  }

  /**
   * Idempotent monthly calendar for one company + year.
   * Creates missing open periods; leaves existing (open or closed) untouched.
   */
  async generatePeriodCalendar(input: {
    companyId: string;
    year: number;
  }): Promise<{
    companyId: string;
    year: number;
    createdCount: number;
    existingCount: number;
    periods: FinancePeriod[];
  }> {
    if (!input.companyId) {
      throw new ActionError("VALIDATION_ERROR", "companyId is required.");
    }
    if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2100) {
      throw new ActionError(
        "VALIDATION_ERROR",
        "year must be an integer between 2000 and 2100."
      );
    }
    const company = await this.repo.getCompany(input.companyId);
    if (!company || company.status !== "active") {
      throw new ActionError("VALIDATION_ERROR", "Company not found or inactive.");
    }

    let createdCount = 0;
    let existingCount = 0;
    const periods: FinancePeriod[] = [];
    for (const bounds of yearMonthBounds(input.year)) {
      const result = await this.repo.ensureOpenPeriod({
        companyId: input.companyId,
        year: bounds.year,
        month: bounds.month,
        startDate: bounds.startDate,
        endDate: bounds.endDate,
      });
      if (result.created) createdCount += 1;
      else existingCount += 1;
      periods.push(result.period);
    }

    periods.sort((a, b) => a.month - b.month);
    return {
      companyId: input.companyId,
      year: input.year,
      createdCount,
      existingCount,
      periods,
    };
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

  /**
   * Controlled manual journal: create draft FT then atomically post via
   * finance_post_transaction. Reference is server-generated (authoritative).
   * Does not invent a second posting engine or draft journal-line store.
   */
  async postManualJournal(input: {
    companyId: string;
    transactionDate: string;
    description: string;
    lines: FinancePostingLineInput[];
    actorProfileId: string;
    periodId?: string | null;
    reason?: string | null;
  }): Promise<{
    journalEntryId: string;
    transaction: FinanceTransaction;
    period: FinancePeriod;
    reference: string;
  }> {
    const companyId = input.companyId?.trim();
    if (!companyId) {
      throw new ActionError("VALIDATION_ERROR", "Company is required.");
    }

    const companies = await this.repo.listCompanies();
    const company = companies.find((c) => c.id === companyId);
    if (!company || company.status !== "active") {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Company is not available for posting."
      );
    }

    const transactionDate = input.transactionDate?.trim();
    if (!transactionDate || !/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)) {
      throw new ActionError(
        "VALIDATION_ERROR",
        "A valid transaction date is required."
      );
    }

    const description = input.description?.trim();
    if (!description) {
      throw new ActionError("VALIDATION_ERROR", "Description is required.");
    }

    const lines = (input.lines ?? []).map((line) => ({
      accountId: String(line.accountId ?? "").trim(),
      debit: roundMoney2(Number(line.debit) || 0),
      credit: roundMoney2(Number(line.credit) || 0),
      description:
        typeof line.description === "string"
          ? line.description.trim() || null
          : null,
    }));

    try {
      assertValidPostingLines(lines);
    } catch (err) {
      throw new ActionError(
        "VALIDATION_ERROR",
        err instanceof Error ? err.message : "Journal lines are invalid."
      );
    }

    const accounts = await this.repo.listAccounts();
    const byId = new Map(accounts.map((a) => [a.id, a]));
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]!;
      const account = byId.get(line.accountId);
      if (!account) {
        throw new ActionError(
          "VALIDATION_ERROR",
          `line ${i + 1}: account not found.`
        );
      }
      if (account.status !== "active") {
        throw new ActionError(
          "VALIDATION_ERROR",
          `line ${i + 1}: account ${account.code} is inactive.`
        );
      }
    }

    let period: FinancePeriod | null = null;
    if (input.periodId) {
      period = await this.repo.getPeriod(input.periodId);
      if (!period || period.companyId !== companyId) {
        throw new ActionError(
          "VALIDATION_ERROR",
          "Period does not belong to the selected company."
        );
      }
      if (period.status !== "open") {
        throw new ActionError(
          "VALIDATION_ERROR",
          "Cannot post into a closed period."
        );
      }
      if (
        period.startDate > transactionDate ||
        period.endDate < transactionDate
      ) {
        throw new ActionError(
          "VALIDATION_ERROR",
          "Transaction date is outside the selected period."
        );
      }
    } else {
      period = await this.findOpenPeriodForDate(companyId, transactionDate);
      if (!period) {
        throw new ActionError(
          "VALIDATION_ERROR",
          "No open accounting period covers this transaction date."
        );
      }
    }

    const totalDebit = lines.reduce((sum, line) => sum + line.debit, 0);

    let transaction: FinanceTransaction | null = null;
    let reference = "";
    for (let attempt = 0; attempt < 8; attempt += 1) {
      reference = this.generateManualJournalReference();
      try {
        transaction = await this.repo.createTransaction({
          companyId,
          reference,
          transactionDate,
          description,
          transactionType: "adjustment",
          amount: totalDebit,
          currency: "NGN",
          sourceType: "manual_journal",
          sourceId: null,
          metadata: { channel: "platform_finance.manual_journal" },
          createdByProfileId: input.actorProfileId,
        });
        break;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!/duplicate|unique|already exists/i.test(message) || attempt === 7) {
          throw err instanceof ActionError
            ? err
            : new ActionError("VALIDATION_ERROR", message);
        }
      }
    }
    if (!transaction) {
      throw new ActionError(
        "INTERNAL_ERROR",
        "Unable to allocate a unique journal reference."
      );
    }

    let journalEntryId: string;
    try {
      journalEntryId = await postFinanceTransaction({
        transactionId: transaction.id,
        actorProfileId: input.actorProfileId,
        lines,
        periodId: period.id,
        reason: input.reason ?? null,
      });
    } catch (err) {
      throw new ActionError(
        "VALIDATION_ERROR",
        err instanceof Error
          ? err.message
          : "Failed to post journal through the accounting engine."
      );
    }

    const posted = await this.repo.getTransaction(transaction.id);
    if (!posted || posted.status !== "posted") {
      throw new ActionError(
        "INTERNAL_ERROR",
        "Posting completed without a posted financial transaction."
      );
    }
    if (posted.companyId !== companyId) {
      throw new ActionError(
        "INTERNAL_ERROR",
        "Posted transaction company does not match selection."
      );
    }

    return {
      journalEntryId,
      transaction: posted,
      period,
      reference: posted.reference,
    };
  }

  private generateManualJournalReference(): string {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const suffix = randomBytes(3).toString("hex").toUpperCase();
    return `MJ-${day}-${suffix}`;
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

  async listJournals(
    profileId: string,
    filters: FinanceJournalListFilters = {}
  ): Promise<FinanceJournalRegisterResult> {
    const accessibleIds = await this.repo.listAccessibleCompanyIds(profileId);
    if (filters.companyId && !accessibleIds.includes(filters.companyId)) {
      throw new ActionError(
        "FORBIDDEN",
        "You do not have access to this finance company."
      );
    }

    const page = Math.max(1, filters.page ?? 1);
    const pageSize = filters.pageSize === 50 ? 50 : 20;

    const { rows, total } = await this.repo.queryJournalRegister({
      companyIds: accessibleIds,
      companyId: filters.companyId ?? null,
      periodId: filters.periodId ?? null,
      dateFrom: filters.dateFrom ?? null,
      dateTo: filters.dateTo ?? null,
      status: filters.status ?? "posted",
      sourceType: filters.sourceType ?? null,
      search: filters.search ?? null,
      page,
      pageSize,
    });

    const periods = filters.companyId
      ? await this.repo.listPeriods(filters.companyId)
      : (
          await Promise.all(
            accessibleIds.map((id) => this.repo.listPeriods(id))
          )
        ).flat();
    const periodLabel = new Map(
      periods.map((p) => [p.id, financePeriodLabel(p.year, p.month)])
    );

    const preparerIds = rows
      .map((row) => row.preparedByProfileId)
      .filter(Boolean) as string[];
    const preparerNames = await this.repo.getProfilesByIds(preparerIds);

    const mapped: FinanceJournalRegisterRow[] = rows.map((row) => ({
      id: row.line.id,
      journalEntryId: row.entry.id,
      lineNo: row.line.lineNo,
      reference: row.entry.reference,
      entryDate: row.entry.entryDate,
      periodId: row.entry.periodId,
      periodLabel: periodLabel.get(row.entry.periodId) ?? "—",
      companyId: row.entry.companyId,
      description: row.entry.description,
      accountCode: row.accountCode,
      accountName: row.accountName,
      debit: row.line.debit,
      credit: row.line.credit,
      preparedByName: row.preparedByProfileId
        ? preparerNames.get(row.preparedByProfileId) ?? null
        : null,
      transactionId: row.entry.transactionId,
    }));

    const pageDebitTotal = mapped.reduce((sum, row) => sum + row.debit, 0);
    const pageCreditTotal = mapped.reduce((sum, row) => sum + row.credit, 0);

    return {
      rows: mapped,
      total,
      page,
      pageSize,
      pageDebitTotal,
      pageCreditTotal,
    };
  }

  async getJournalDetail(
    profileId: string,
    journalEntryId: string
  ): Promise<FinanceJournalDetail> {
    const entry = await this.repo.getJournalEntry(journalEntryId);
    if (!entry) {
      throw new ActionError("VALIDATION_ERROR", "Journal entry not found.");
    }

    const accessibleIds = await this.repo.listAccessibleCompanyIds(profileId);
    if (!accessibleIds.includes(entry.companyId)) {
      throw new ActionError(
        "FORBIDDEN",
        "You do not have access to this finance company."
      );
    }

    const [linesWithAccounts, company, period, transaction] = await Promise.all([
      this.repo.listJournalLinesWithAccounts(entry.id),
      this.repo.getCompany(entry.companyId),
      this.repo.getPeriod(entry.periodId),
      this.repo.getTransaction(entry.transactionId),
    ]);

    const profileIds = [
      entry.postedByProfileId,
      transaction?.createdByProfileId,
    ].filter(Boolean) as string[];
    const names = await this.repo.getProfilesByIds(profileIds);

    const totalDebit = linesWithAccounts.reduce(
      (s, row) => s + row.line.debit,
      0
    );
    const totalCredit = linesWithAccounts.reduce(
      (s, row) => s + row.line.credit,
      0
    );
    // Exact equality for foundation decimal amounts (numeric(18,2)).
    const balanced =
      linesWithAccounts.length >= 2 &&
      Math.round(totalDebit * 100) === Math.round(totalCredit * 100);

    return {
      id: entry.id,
      journalNo: entry.reference,
      description: entry.description,
      status: entry.status,
      sourceType: (transaction?.transactionType ??
        null) as FinanceJournalDetail["sourceType"],
      reference: entry.reference,
      transactionId: entry.transactionId,
      transactionReference: transaction?.reference ?? entry.reference,
      transactionHref: null,
      companyId: entry.companyId,
      companyName: company?.name ?? "—",
      periodId: entry.periodId,
      periodLabel: period
        ? financePeriodLabel(period.year, period.month)
        : "—",
      entryDate: entry.entryDate,
      createdByName: transaction?.createdByProfileId
        ? names.get(transaction.createdByProfileId) ?? null
        : null,
      createdAt: transaction?.createdAt ?? entry.createdAt,
      postedByName: names.get(entry.postedByProfileId) ?? null,
      postedAt: entry.postedAt,
      lines: linesWithAccounts.map((row) => ({
        id: row.line.id,
        lineNo: row.line.lineNo,
        accountId: row.line.accountId,
        accountCode: row.accountCode,
        accountName: row.accountName,
        accountType: row.accountType as FinanceJournalDetail["lines"][number]["accountType"],
        description: row.line.description,
        debit: row.line.debit,
        credit: row.line.credit,
      })),
      totalDebit,
      totalCredit,
      balanced,
    };
  }

  /**
   * Finance Overview aggregates — reads existing companies/periods/journals/requests.
   * Does not invent cash, payables, receivables, or free-cash figures.
   */
  async getOverview(input: {
    profileId: string;
    companyId?: string | null;
    periodId?: string | null;
  }): Promise<FinanceOverviewSnapshot> {
    return this.getOverviewForCompanyScope(input);
  }

  /**
   * Organisation-wide executive projection. The domain service re-verifies the
   * Command Centre grant; callers cannot opt into this scope with a flag.
   */
  async getCommandCentreOverview(input: {
    profileId: string;
  }): Promise<FinanceOverviewSnapshot> {
    const admin = createAdminClient();
    const { data: grant, error } = await admin
      .from("platform_capability_grants")
      .select("id")
      .eq("organisation_id", this.organisationId)
      .eq("profile_id", input.profileId)
      .eq("capability", "platform.command_centre.view")
      .maybeSingle();
    if (error || !grant) {
      throw new ActionError("FORBIDDEN", "Command Centre composition is not authorised.");
    }
    return this.getOverviewForCompanyScope(input, true);
  }

  private async getOverviewForCompanyScope(
    input: {
      profileId: string;
      companyId?: string | null;
      periodId?: string | null;
    },
    organisationWide = false
  ): Promise<FinanceOverviewSnapshot> {
    const asOf = new Date().toISOString();
    const allCompanies = await this.repo.listCompanies();
    const accessibleIds = new Set(
      organisationWide
        ? allCompanies.map((company) => company.id)
        : await this.repo.listAccessibleCompanyIds(input.profileId)
    );
    const companies = allCompanies.filter((c) => accessibleIds.has(c.id));

    const selectedCompanyId =
      input.companyId && accessibleIds.has(input.companyId)
        ? input.companyId
        : null;

    const periodsRaw = selectedCompanyId
      ? await this.repo.listPeriods(selectedCompanyId)
      : (
          await Promise.all(
            companies.map((c) => this.repo.listPeriods(c.id))
          )
        ).flat();

    // Deduplicate year-month for All Companies view by picking one period id per label
    const periodKey = (p: FinancePeriod) => `${p.year}-${p.month}`;
    const periodsUnique: FinancePeriod[] = [];
    const seen = new Set<string>();
    for (const p of periodsRaw) {
      const key = selectedCompanyId ? p.id : periodKey(p);
      if (seen.has(key)) continue;
      seen.add(key);
      periodsUnique.push(p);
    }

    let selectedPeriod =
      periodsUnique.find((p) => p.id === input.periodId) ?? null;
    if (!selectedPeriod) {
      selectedPeriod = selectDefaultFinancePeriod(periodsUnique, new Date(asOf));
    }

    const companyIdsForRequests = selectedCompanyId
      ? [selectedCompanyId]
      : companies.map((c) => c.id);
    const admin = createAdminClient();
    const { data: receivableGrant } = await admin
      .from("finance_capability_grants")
      .select("id")
      .eq("organisation_id", this.organisationId)
      .eq("profile_id", input.profileId)
      .eq("capability", "platform_finance.receivable.view")
      .maybeSingle();
    let receivables: FinanceOverviewSnapshot["receivables"] = null;
    if (receivableGrant && companyIdsForRequests.length) {
      const { data: receivableRows, error: receivableError } = await admin
        .from("finance_receivables")
        .select("due_date,original_amount")
        .eq("organisation_id", this.organisationId)
        .in("company_id", companyIdsForRequests);
      if (receivableError) throw new ActionError("INTERNAL_ERROR", receivableError.message);
      const today = asOf.slice(0, 10);
      const overdueRows = (receivableRows ?? []).filter((row) => row.due_date < today);
      receivables = {
        open: sumBucket((receivableRows ?? []).map((row) => Number(row.original_amount))),
        overdue: sumBucket(overdueRows.map((row) => Number(row.original_amount))),
      };
    }
    const requests =
      await this.requestsRepo.listRequestsForCompanies(companyIdsForRequests);
    const vendorBills = organisationWide
      ? await new PlatformFinanceVendorBillsRepository(
          this.organisationId
        ).listApprovalQueue(companyIdsForRequests)
      : [];

    const awaiting = requests.filter(
      (r) =>
        r.status === "submitted" ||
        r.status === "under_review" ||
        r.status === "resubmitted"
    );
    const pendingCeo = requests.filter(
      (r) => r.status === "pending_ceo_approval"
    );
    const queried = requests.filter((r) => r.status === "query");
    const now = new Date(asOf);
    const approvedThisMonth = requests.filter((r) => {
      if (r.status !== "approved" && r.status !== "partially_approved") {
        return false;
      }
      if (!r.decidedAt) return false;
      const d = new Date(r.decidedAt);
      return (
        d.getUTCFullYear() === now.getUTCFullYear() &&
        d.getUTCMonth() === now.getUTCMonth()
      );
    });

    const awaitingReview = sumBucket(awaiting.map((r) => r.requestedAmount));
    const needsAttention = (
      awaitingReview.count > 0
        ? [
            {
              id: "financial_requests_awaiting_review",
              kind: "financial_requests_awaiting_review" as const,
              label: "Financial requests awaiting review",
              detail: `${formatOverviewNaira(awaitingReview.totalAmount)} total`,
              count: awaitingReview.count,
              tone: "critical" as const,
            },
          ]
        : []
    ).slice(0, PLATFORM_FINANCE_OVERVIEW_LIST_LIMIT);

    const tb = await this.repo.getTrialBalanceRows({
      companyId: selectedCompanyId,
      periodId: selectedPeriod?.id ?? null,
    });
    let revenue: number | null = null;
    let expenses: number | null = null;
    if (tb.length > 0) {
      revenue = 0;
      expenses = 0;
      for (const row of tb) {
        if (row.accountType === "revenue") {
          revenue += row.totalCredit - row.totalDebit;
        } else if (row.accountType === "expense") {
          expenses += row.totalDebit - row.totalCredit;
        }
      }
    }

    const journals = await this.repo.listJournalEntries({
      companyId: selectedCompanyId,
      periodId: selectedPeriod?.id ?? null,
    });
    const transactions = selectedCompanyId
      ? await this.repo.listTransactions(selectedCompanyId)
      : await this.repo.listTransactions();
    const confirmedPaymentIds = await this.repo.listConfirmedPaymentIds(
      selectedCompanyId ? [selectedCompanyId] : companies.map((c) => c.id)
    );
    const paymentFtBySource = new Map(
      transactions
        .filter((t) => t.sourceType === "payment" && t.sourceId)
        .map((t) => [t.sourceId!, t])
    );
    const paymentAccountingPending = confirmedPaymentIds.filter(
      (id) => paymentFtBySource.get(id)?.status !== "posted"
    ).length;
    const unrelatedDrafts = transactions.filter(
      (t) => t.status === "draft" && t.sourceType !== "payment"
    ).length;
    const unpostedItems = paymentAccountingPending + unrelatedDrafts;

    const audits = await this.repo.listRecentAuditEvents(input.profileId, 10);
    const requestEvents = await this.requestsRepo.listRecentRequestEvents(10);
    const recentActivity = [
      ...audits.map((a) => ({
        id: `audit-${a.id}`,
        at: a.createdAt,
        label: auditActivityLabel(a.action),
        detail: a.reason,
        tone:
          a.action.includes("approved") || a.action.includes("posted")
            ? ("success" as const)
            : ("info" as const),
      })),
      ...requestEvents
        .filter((e) =>
          [
            "submitted",
            "approved",
            "partially_approved",
            "rejected",
            "sent_to_ceo",
          ].includes(e.eventType)
        )
        .map((e) => ({
          id: `reqevt-${e.id}`,
          at: e.createdAt,
          label:
            e.eventType === "submitted"
              ? "Financial request submitted"
              : e.eventType === "approved"
                ? "Request approved"
                : e.eventType === "partially_approved"
                  ? "Request partially approved"
                  : e.eventType === "rejected"
                    ? "Request rejected"
                    : "Request sent to CEO",
          detail: null,
          tone:
            e.eventType === "approved" || e.eventType === "partially_approved"
              ? ("success" as const)
              : ("info" as const),
        })),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, PLATFORM_FINANCE_OVERVIEW_LIST_LIMIT);

    const selectedCompanyLabel = selectedCompanyId
      ? (companies.find((c) => c.id === selectedCompanyId)?.name ??
        "Selected company")
      : "All Companies";

    return {
      asOf,
      companies: companies.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        status: c.status,
      })),
      selectedCompanyId,
      periods: periodsUnique.map((p) => ({
        id: p.id,
        companyId: p.companyId,
        year: p.year,
        month: p.month,
        status: p.status,
        label: periodLabel(p.year, p.month),
      })),
      selectedPeriodId: selectedPeriod?.id ?? null,
      selectedCompanyLabel,
      requests: {
        awaitingReview,
        pendingCeoApproval: sumBucket(
          pendingCeo.map((r) => r.requestedAmount)
        ),
        queried: sumBucket(queried.map((r) => r.requestedAmount)),
        approvedThisMonth: sumBucket(
          approvedThisMonth.map((r) => r.approvedAmount)
        ),
      },
      pendingCeoDecisions: sumBucket([
        ...pendingCeo.map((r) => r.requestedAmount),
        ...vendorBills.map((bill) => bill.billedAmount),
      ]),
      receivables,
      needsAttention,
      accounting: {
        revenue,
        expenses,
        netProfit:
          revenue != null && expenses != null ? revenue - expenses : null,
        journalEntries: journals.length,
        unpostedItems,
        periodStatus: selectedPeriod?.status ?? "none",
        periodLabel: selectedPeriod
          ? periodLabel(selectedPeriod.year, selectedPeriod.month)
          : null,
      },
      recentActivity,
    };
  }
}

function formatOverviewNaira(amount: number): string {
  if (!Number.isFinite(amount)) return "₦0";
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) {
    return `₦${(amount / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  }
  if (abs >= 1_000) {
    return `₦${(amount / 1_000).toFixed(0)}k`;
  }
  return `₦${amount.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}
