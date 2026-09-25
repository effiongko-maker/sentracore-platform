import { createAdminClient } from "@/utils/supabase/admin";
import type {
  FinanceAccount,
  FinanceAccountType,
  FinanceCompany,
  FinanceFoundationStatus,
  FinanceJournalEntry,
  FinanceJournalLine,
  FinancePeriod,
  FinanceTransaction,
  FinanceTransactionType,
  PlatformFinanceModuleSlug,
} from "@/modules/platform-finance/types";
import { PLATFORM_FINANCE_MODULE_SLUG } from "@/modules/platform-finance/types";
import { isFinanceAccountType } from "@/modules/platform-finance/domain/coa";
import type { PostedAccountMovement } from "@/modules/platform-finance/domain/accountingReadModels";
import { roundMoney2 } from "@/modules/platform-finance/domain/accountingReadModels";
import { PlatformFinanceFinancialAccountsRepository } from "@/modules/platform-finance/server/PlatformFinanceFinancialAccountsRepository";

function db() {
  return createAdminClient();
}

function throwDb(
  error: { message?: string; code?: string } | null,
  fallback: string
): never {
  throw new Error(error?.message?.trim() || fallback);
}

export type PostedMovementRow = {
  period_id: string;
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  total_debit: number | string | null;
  total_credit: number | string | null;
};

/** The minimal PostgREST query surface the posted-movement scan uses (lets the scan be verified against Postgres). */
type PostedMovementQuery = {
  eq(column: string, value: string): PostedMovementQuery;
  order(column: string, options: { ascending: boolean }): PostedMovementQuery;
  range(from: number, to: number): PromiseLike<{ data: unknown[] | null; error: { message?: string } | null }>;
};
export type PostedMovementClient = {
  from(relation: "finance_trial_balance_v"): { select(columns: string): PostedMovementQuery };
};

export const POSTED_MOVEMENT_PAGE_SIZE = 1000;

/**
 * Every posted period × account movement row for a company, exactly once.
 *
 * finance_trial_balance_v groups by (company, period, account), so (period_id, account_id) is unique within a company.
 * Ordering by both gives a TOTAL order: offset pages are deterministic and a page boundary can never skip or repeat a
 * row, however many accounts share a period. Ordering changes nothing about which rows exist or their amounts.
 */
export async function fetchPostedMovementRows(
  client: PostedMovementClient,
  input: { organisationId: string; companyId: string; pageSize?: number }
): Promise<PostedMovementRow[]> {
  const pageSize = input.pageSize ?? POSTED_MOVEMENT_PAGE_SIZE;
  const raw: PostedMovementRow[] = [];
  for (let offset = 0; ; offset += pageSize) {
    if (offset >= 1_000_000) {
      throw new Error("Posted account movement scan exceeded the v1 limit.");
    }
    const { data, error } = await client
      .from("finance_trial_balance_v")
      .select(
        "period_id, account_id, account_code, account_name, account_type, total_debit, total_credit"
      )
      .eq("organisation_id", input.organisationId)
      .eq("company_id", input.companyId)
      .order("period_id", { ascending: true })
      .order("account_id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throwDb(error, "Failed to load posted account movements.");
    const batch = (data ?? []) as PostedMovementRow[];
    raw.push(...batch);
    if (batch.length < pageSize) break;
  }
  return raw;
}

type CompanyRow = {
  id: string;
  organisation_id: string;
  code: string;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type AccountRow = {
  id: string;
  organisation_id: string;
  code: string;
  name: string;
  account_type: string;
  classification: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type PeriodRow = {
  id: string;
  organisation_id: string;
  company_id: string;
  year: number;
  month: number;
  start_date: string;
  end_date: string;
  status: string;
  closed_at: string | null;
  closed_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

type TransactionRow = {
  id: string;
  organisation_id: string;
  company_id: string;
  reference: string;
  transaction_date: string;
  transaction_type: string;
  description: string;
  amount: number | string | null;
  currency: string;
  status: string;
  source_type: string | null;
  source_id: string | null;
  metadata: Record<string, unknown> | null;
  journal_entry_id: string | null;
  created_by_profile_id: string;
  posted_at: string | null;
  posted_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

type JournalEntryRow = {
  id: string;
  organisation_id: string;
  company_id: string;
  period_id: string;
  transaction_id: string;
  entry_date: string;
  reference: string;
  description: string;
  status: string;
  posted_at: string;
  posted_by_profile_id: string;
  created_at: string;
};

type JournalLineRow = {
  id: string;
  journal_entry_id: string;
  account_id: string;
  line_no: number;
  description: string | null;
  debit: number | string;
  credit: number | string;
  created_at: string;
};

function mapCompany(row: CompanyRow): FinanceCompany {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    code: row.code,
    name: row.name,
    status: row.status as FinanceCompany["status"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAccount(row: AccountRow): FinanceAccount {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    code: row.code,
    name: row.name,
    accountType: row.account_type as FinanceAccount["accountType"],
    classification: row.classification,
    status: row.status as FinanceAccount["status"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPeriod(row: PeriodRow): FinancePeriod {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    companyId: row.company_id,
    year: row.year,
    month: row.month,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status as FinancePeriod["status"],
    closedAt: row.closed_at,
    closedByProfileId: row.closed_by_profile_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTransaction(row: TransactionRow): FinanceTransaction {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    companyId: row.company_id,
    reference: row.reference,
    transactionDate: row.transaction_date,
    transactionType: row.transaction_type as FinanceTransaction["transactionType"],
    description: row.description,
    amount: row.amount == null ? null : Number(row.amount),
    currency: row.currency,
    status: row.status as FinanceTransaction["status"],
    sourceType: row.source_type,
    sourceId: row.source_id,
    metadata: row.metadata ?? {},
    journalEntryId: row.journal_entry_id,
    createdByProfileId: row.created_by_profile_id,
    postedAt: row.posted_at,
    postedByProfileId: row.posted_by_profile_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapJournalEntry(row: JournalEntryRow): FinanceJournalEntry {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    companyId: row.company_id,
    periodId: row.period_id,
    transactionId: row.transaction_id,
    entryDate: row.entry_date,
    reference: row.reference,
    description: row.description,
    status: row.status as FinanceJournalEntry["status"],
    postedAt: row.posted_at,
    postedByProfileId: row.posted_by_profile_id,
    createdAt: row.created_at,
  };
}

function mapJournalLine(row: JournalLineRow): FinanceJournalLine {
  return {
    id: row.id,
    journalEntryId: row.journal_entry_id,
    accountId: row.account_id,
    lineNo: row.line_no,
    description: row.description,
    debit: Number(row.debit),
    credit: Number(row.credit),
    createdAt: row.created_at,
  };
}

export type CreateFinanceTransactionInput = {
  companyId: string;
  reference: string;
  transactionDate: string;
  transactionType?: FinanceTransactionType;
  description: string;
  amount?: number | null;
  currency?: string;
  sourceType?: string | null;
  sourceId?: string | null;
  metadata?: Record<string, unknown>;
  createdByProfileId: string;
};

export type CreateFinancePeriodInput = {
  companyId: string;
  year: number;
  month: number;
  startDate: string;
  endDate: string;
};

export type CreateFinanceAccountInput = {
  code: string;
  name: string;
  accountType: FinanceAccount["accountType"];
  classification?: string | null;
  status?: FinanceAccount["status"];
};

export type UpdateFinanceAccountInput = {
  name?: string;
  accountType?: FinanceAccount["accountType"];
  classification?: string | null;
  status?: FinanceAccount["status"];
  code?: string;
};

export class PlatformFinanceRepository {
  constructor(private readonly organisationId: string) {}

  async listCompanies(): Promise<FinanceCompany[]> {
    const { data, error } = await db()
      .from("finance_companies")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .order("code", { ascending: true });
    if (error) throwDb(error, "Failed to list finance companies.");
    return (data as CompanyRow[] | null)?.map(mapCompany) ?? [];
  }

  async getCompany(companyId: string): Promise<FinanceCompany | null> {
    const { data, error } = await db()
      .from("finance_companies")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .eq("id", companyId)
      .maybeSingle();
    if (error) throwDb(error, "Failed to load finance company.");
    return data ? mapCompany(data as CompanyRow) : null;
  }

  async listAccounts(): Promise<FinanceAccount[]> {
    const { data, error } = await db()
      .from("finance_accounts")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .order("code", { ascending: true });
    if (error) throwDb(error, "Failed to list finance accounts.");
    return (data as AccountRow[] | null)?.map(mapAccount) ?? [];
  }

  async getAccount(accountId: string): Promise<FinanceAccount | null> {
    const { data, error } = await db()
      .from("finance_accounts")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .eq("id", accountId)
      .maybeSingle();
    if (error) throwDb(error, "Failed to load finance account.");
    return data ? mapAccount(data as AccountRow) : null;
  }

  async getAccountByCode(code: string): Promise<FinanceAccount | null> {
    const { data, error } = await db()
      .from("finance_accounts")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .eq("code", code)
      .maybeSingle();
    if (error) throwDb(error, "Failed to load finance account by code.");
    return data ? mapAccount(data as AccountRow) : null;
  }

  async createAccount(
    input: CreateFinanceAccountInput
  ): Promise<FinanceAccount> {
    const { data, error } = await db()
      .from("finance_accounts")
      .insert({
        organisation_id: this.organisationId,
        code: input.code,
        name: input.name,
        account_type: input.accountType,
        classification: input.classification ?? null,
        status: input.status ?? "active",
      })
      .select("*")
      .single();
    if (error) throwDb(error, "Failed to create finance account.");
    return mapAccount(data as AccountRow);
  }

  async updateAccount(
    accountId: string,
    input: UpdateFinanceAccountInput
  ): Promise<FinanceAccount> {
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (input.name !== undefined) patch.name = input.name;
    if (input.accountType !== undefined) patch.account_type = input.accountType;
    if (input.classification !== undefined) {
      patch.classification = input.classification;
    }
    if (input.status !== undefined) patch.status = input.status;
    if (input.code !== undefined) patch.code = input.code;

    const { data, error } = await db()
      .from("finance_accounts")
      .update(patch)
      .eq("organisation_id", this.organisationId)
      .eq("id", accountId)
      .select("*")
      .single();
    if (error) throwDb(error, "Failed to update finance account.");
    return mapAccount(data as AccountRow);
  }

  /**
   * True when the account appears on any journal line belonging to a posted
   * journal entry in this organisation (historical integrity lock).
   */
  async accountHasPostedUsage(accountId: string): Promise<boolean> {
    const { data: lines, error } = await db()
      .from("finance_journal_lines")
      .select("id, journal_entry_id")
      .eq("account_id", accountId)
      .limit(50);
    if (error) throwDb(error, "Failed to check account journal usage.");
    if (!lines?.length) return false;

    const entryIds = [
      ...new Set(lines.map((row) => row.journal_entry_id as string)),
    ];
    const { data: entries, error: entryErr } = await db()
      .from("finance_journal_entries")
      .select("id")
      .eq("organisation_id", this.organisationId)
      .eq("status", "posted")
      .in("id", entryIds)
      .limit(1);
    if (entryErr) throwDb(entryErr, "Failed to check posted journal usage.");
    return (entries?.length ?? 0) > 0;
  }

  async getPeriod(periodId: string): Promise<FinancePeriod | null> {
    const { data, error } = await db()
      .from("finance_periods")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .eq("id", periodId)
      .maybeSingle();
    if (error) throwDb(error, "Failed to load finance period.");
    return data ? mapPeriod(data as PeriodRow) : null;
  }

  async listPeriods(companyId?: string): Promise<FinancePeriod[]> {
    let query = db()
      .from("finance_periods")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .order("year", { ascending: false })
      .order("month", { ascending: false });
    if (companyId) {
      query = query.eq("company_id", companyId);
    }
    const { data, error } = await query;
    if (error) throwDb(error, "Failed to list finance periods.");
    return (data as PeriodRow[] | null)?.map(mapPeriod) ?? [];
  }

  async createPeriod(input: CreateFinancePeriodInput): Promise<FinancePeriod> {
    const { data, error } = await db()
      .from("finance_periods")
      .insert({
        organisation_id: this.organisationId,
        company_id: input.companyId,
        year: input.year,
        month: input.month,
        start_date: input.startDate,
        end_date: input.endDate,
        status: "open",
      })
      .select("*")
      .single();
    if (error) throwDb(error, "Failed to create finance period.");
    return mapPeriod(data as PeriodRow);
  }

  /**
   * Idempotent insert for a company month. Returns existing row if present.
   * Does not reopen closed periods.
   */
  async ensureOpenPeriod(
    input: CreateFinancePeriodInput
  ): Promise<{ period: FinancePeriod; created: boolean }> {
    const existing = await this.findPeriodByCompanyYearMonth(
      input.companyId,
      input.year,
      input.month
    );
    if (existing) {
      return { period: existing, created: false };
    }

    const { data, error } = await db()
      .from("finance_periods")
      .insert({
        organisation_id: this.organisationId,
        company_id: input.companyId,
        year: input.year,
        month: input.month,
        start_date: input.startDate,
        end_date: input.endDate,
        status: "open",
      })
      .select("*")
      .single();

    if (error) {
      // Race: unique constraint — reload existing
      if (error.code === "23505") {
        const raced = await this.findPeriodByCompanyYearMonth(
          input.companyId,
          input.year,
          input.month
        );
        if (raced) return { period: raced, created: false };
      }
      throwDb(error, "Failed to ensure finance period.");
    }
    return { period: mapPeriod(data as PeriodRow), created: true };
  }

  async findPeriodByCompanyYearMonth(
    companyId: string,
    year: number,
    month: number
  ): Promise<FinancePeriod | null> {
    const { data, error } = await db()
      .from("finance_periods")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .eq("company_id", companyId)
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();
    if (error) throwDb(error, "Failed to find finance period.");
    return data ? mapPeriod(data as PeriodRow) : null;
  }

  async listTransactions(companyId?: string): Promise<FinanceTransaction[]> {
    let query = db()
      .from("finance_transactions")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (companyId) {
      query = query.eq("company_id", companyId);
    }
    const { data, error } = await query;
    if (error) throwDb(error, "Failed to list finance transactions.");
    return (data as TransactionRow[] | null)?.map(mapTransaction) ?? [];
  }

  async listConfirmedPaymentIds(companyIds: string[]): Promise<string[]> {
    if (companyIds.length === 0) return [];
    const { data, error } = await db()
      .from("finance_payments")
      .select("id")
      .eq("organisation_id", this.organisationId)
      .eq("status", "confirmed")
      .in("company_id", companyIds);
    if (error) throwDb(error, "Failed to list confirmed payments for accounting.");
    return (data ?? []).map((row) => row.id as string);
  }

  async getTransaction(
    transactionId: string
  ): Promise<FinanceTransaction | null> {
    const { data, error } = await db()
      .from("finance_transactions")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .eq("id", transactionId)
      .maybeSingle();
    if (error) throwDb(error, "Failed to load finance transaction.");
    return data ? mapTransaction(data as TransactionRow) : null;
  }

  async createTransaction(
    input: CreateFinanceTransactionInput
  ): Promise<FinanceTransaction> {
    const { data, error } = await db()
      .from("finance_transactions")
      .insert({
        organisation_id: this.organisationId,
        company_id: input.companyId,
        reference: input.reference,
        transaction_date: input.transactionDate,
        transaction_type: input.transactionType ?? "foundation",
        description: input.description,
        amount: input.amount ?? null,
        currency: input.currency ?? "NGN",
        status: "draft",
        source_type: input.sourceType ?? null,
        source_id: input.sourceId ?? null,
        metadata: input.metadata ?? {},
        created_by_profile_id: input.createdByProfileId,
      })
      .select("*")
      .single();
    if (error) throwDb(error, "Failed to create finance transaction.");
    return mapTransaction(data as TransactionRow);
  }

  async getJournalEntry(
    journalEntryId: string
  ): Promise<FinanceJournalEntry | null> {
    const { data, error } = await db()
      .from("finance_journal_entries")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .eq("id", journalEntryId)
      .maybeSingle();
    if (error) throwDb(error, "Failed to load journal entry.");
    return data ? mapJournalEntry(data as JournalEntryRow) : null;
  }

  async listJournalLines(
    journalEntryId: string
  ): Promise<FinanceJournalLine[]> {
    const { data, error } = await db()
      .from("finance_journal_lines")
      .select("*")
      .eq("journal_entry_id", journalEntryId)
      .order("line_no", { ascending: true });
    if (error) throwDb(error, "Failed to list journal lines.");
    return (data as JournalLineRow[] | null)?.map(mapJournalLine) ?? [];
  }

  async getFoundationStatus(): Promise<FinanceFoundationStatus> {
    const [companies, accounts, periods, transactions] = await Promise.all([
      this.listCompanies(),
      this.listAccounts(),
      this.listPeriods(),
      this.listTransactions(),
    ]);

    return {
      module: PLATFORM_FINANCE_MODULE_SLUG as PlatformFinanceModuleSlug,
      phase: "foundation",
      ready: true,
      persistence: "supabase",
      companies: companies.length,
      accounts: accounts.length,
      openPeriods: periods.filter((p) => p.status === "open").length,
      draftTransactions: transactions.filter((t) => t.status === "draft")
        .length,
      postedTransactions: transactions.filter((t) => t.status === "posted")
        .length,
    };
  }

  async listAccessibleCompanyIds(profileId: string): Promise<string[]> {
    const { data, error } = await db()
      .from("finance_company_access")
      .select("company_id")
      .eq("organisation_id", this.organisationId)
      .eq("profile_id", profileId);
    if (error) throwDb(error, "Failed to list company access.");
    return (data ?? []).map((row) => row.company_id as string);
  }

  async listJournalEntries(filters: {
    companyId?: string | null;
    periodId?: string | null;
  }): Promise<FinanceJournalEntry[]> {
    let query = db()
      .from("finance_journal_entries")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .order("posted_at", { ascending: false });
    if (filters.companyId) {
      query = query.eq("company_id", filters.companyId);
    }
    if (filters.periodId) {
      query = query.eq("period_id", filters.periodId);
    }
    const { data, error } = await query.limit(500);
    if (error) throwDb(error, "Failed to list journal entries.");
    return (data as JournalEntryRow[] | null)?.map(mapJournalEntry) ?? [];
  }

  /**
   * Journal register query — line-level rows with account codes/names and FT
   * preparer. Paginated by journal line in entry_date / posted_at / line_no order.
   * Company scope must be pre-filtered to accessible company IDs by the service.
   */
  async queryJournalRegister(input: {
    companyIds: string[];
    companyId?: string | null;
    periodId?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
    status?: string | null;
    sourceType?: string | null;
    search?: string | null;
    page: number;
    pageSize: number;
  }): Promise<{
    rows: Array<{
      entry: FinanceJournalEntry;
      line: FinanceJournalLine;
      accountCode: string;
      accountName: string;
      sourceType: string | null;
      preparedByProfileId: string | null;
    }>;
    total: number;
  }> {
    if (input.companyIds.length === 0) {
      return { rows: [], total: 0 };
    }

    const page = Math.max(1, input.page);
    const pageSize = input.pageSize === 50 ? 50 : 20;
    const lineStart = (page - 1) * pageSize;

    const entries = await this.listJournalRegisterEntries(input);
    if (entries.length === 0) {
      return { rows: [], total: 0 };
    }

    const entryIds = entries.map((entry) => entry.id);
    const lineCountByEntry = await this.countJournalLinesByEntry(entryIds);
    const totalLines = entries.reduce(
      (sum, entry) => sum + (lineCountByEntry.get(entry.id) ?? 0),
      0
    );
    if (totalLines === 0) {
      return { rows: [], total: 0 };
    }

    const entriesForPage: FinanceJournalEntry[] = [];
    let lineIndex = 0;
    const lineEnd = lineStart + pageSize;
    for (const entry of entries) {
      const count = lineCountByEntry.get(entry.id) ?? 0;
      if (count === 0) continue;
      const entryStart = lineIndex;
      const entryEnd = lineIndex + count;
      if (entryEnd > lineStart && entryStart < lineEnd) {
        entriesForPage.push(entry);
      }
      lineIndex += count;
      if (lineIndex >= lineEnd) break;
    }

    if (entriesForPage.length === 0) {
      return { rows: [], total: totalLines };
    }

    const firstEntryGlobalStart = entries
      .slice(0, entries.indexOf(entriesForPage[0]!))
      .reduce((sum, entry) => sum + (lineCountByEntry.get(entry.id) ?? 0), 0);
    const localStart = Math.max(0, lineStart - firstEntryGlobalStart);

    const enriched = await this.enrichJournalRegisterLines(entriesForPage);
    return {
      rows: enriched.slice(localStart, localStart + pageSize),
      total: totalLines,
    };
  }

  private async listJournalRegisterEntries(input: {
    companyIds: string[];
    companyId?: string | null;
    periodId?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
    status?: string | null;
    sourceType?: string | null;
    search?: string | null;
  }): Promise<FinanceJournalEntry[]> {
    let query = db()
      .from("finance_journal_entries")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .in("company_id", input.companyIds)
      .order("entry_date", { ascending: false })
      .order("posted_at", { ascending: false });

    if (input.companyId) {
      query = query.eq("company_id", input.companyId);
    }
    if (input.periodId) {
      query = query.eq("period_id", input.periodId);
    }
    if (input.dateFrom) {
      query = query.gte("entry_date", input.dateFrom);
    }
    if (input.dateTo) {
      query = query.lte("entry_date", input.dateTo);
    }
    if (input.status && input.status !== "all") {
      query = query.eq("status", input.status);
    }

    const search = input.search?.trim();
    if (search) {
      const escaped = search.replace(/[%_,]/g, "\\$&");
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          search
        );
      query = isUuid
        ? query.or(
            `reference.ilike.%${escaped}%,description.ilike.%${escaped}%,id.eq.${search}`
          )
        : query.or(
            `reference.ilike.%${escaped}%,description.ilike.%${escaped}%`
          );
    }

    const needsSourceFilter =
      Boolean(input.sourceType) && input.sourceType !== "all";
    const { data, error } = await query.limit(needsSourceFilter ? 2000 : 5000);
    if (error) throwDb(error, "Failed to query journals.");
    const entries =
      (data as JournalEntryRow[] | null)?.map(mapJournalEntry) ?? [];

    if (!needsSourceFilter || entries.length === 0) {
      return entries;
    }

    const txIds = [...new Set(entries.map((entry) => entry.transactionId))];
    const { data: txRows, error: txErr } = await db()
      .from("finance_transactions")
      .select("id, transaction_type")
      .eq("organisation_id", this.organisationId)
      .in("id", txIds);
    if (txErr) throwDb(txErr, "Failed to load journal transactions.");
    const txTypeById = new Map(
      (txRows ?? []).map((row) => [
        row.id as string,
        String(row.transaction_type),
      ])
    );
    return entries.filter(
      (entry) => txTypeById.get(entry.transactionId) === input.sourceType
    );
  }

  private async countJournalLinesByEntry(
    entryIds: string[]
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (entryIds.length === 0) return counts;

    const { data, error } = await db()
      .from("finance_journal_lines")
      .select("journal_entry_id")
      .in("journal_entry_id", entryIds);
    if (error) throwDb(error, "Failed to count journal lines.");
    for (const row of data ?? []) {
      const entryId = row.journal_entry_id as string;
      counts.set(entryId, (counts.get(entryId) ?? 0) + 1);
    }
    return counts;
  }

  private async enrichJournalRegisterLines(
    entries: FinanceJournalEntry[]
  ): Promise<
    Array<{
      entry: FinanceJournalEntry;
      line: FinanceJournalLine;
      accountCode: string;
      accountName: string;
      sourceType: string | null;
      preparedByProfileId: string | null;
    }>
  > {
    if (entries.length === 0) return [];

    const entryIds = entries.map((e) => e.id);
    const txIds = [...new Set(entries.map((e) => e.transactionId))];

    const [{ data: txRows, error: txErr }, { data: lineRows, error: lineErr }] =
      await Promise.all([
        db()
          .from("finance_transactions")
          .select("id, transaction_type, reference, source_type, created_by_profile_id")
          .eq("organisation_id", this.organisationId)
          .in("id", txIds),
        db()
          .from("finance_journal_lines")
          .select("*")
          .in("journal_entry_id", entryIds)
          .order("line_no", { ascending: true }),
      ]);
    if (txErr) throwDb(txErr, "Failed to load journal transactions.");
    if (lineErr) throwDb(lineErr, "Failed to load journal lines.");

    const txById = new Map(
      (txRows ?? []).map((row) => [
        row.id as string,
        {
          transactionType: String(row.transaction_type),
          reference: String(row.reference),
          sourceType: (row.source_type as string | null) ?? null,
          createdByProfileId: String(row.created_by_profile_id ?? ""),
        },
      ])
    );

    const lines =
      (lineRows as JournalLineRow[] | null)?.map(mapJournalLine) ?? [];
    const accountIds = [...new Set(lines.map((l) => l.accountId))];
    const accountById = new Map<
      string,
      { code: string; name: string }
    >();
    if (accountIds.length > 0) {
      const { data: accountRows, error: accountErr } = await db()
        .from("finance_accounts")
        .select("id, code, name")
        .eq("organisation_id", this.organisationId)
        .in("id", accountIds);
      if (accountErr) throwDb(accountErr, "Failed to load journal line accounts.");
      for (const row of accountRows ?? []) {
        accountById.set(row.id as string, {
          code: String(row.code),
          name: String(row.name),
        });
      }
    }

    const linesByEntry = new Map<string, FinanceJournalLine[]>();
    for (const line of lines) {
      const list = linesByEntry.get(line.journalEntryId) ?? [];
      list.push(line);
      linesByEntry.set(line.journalEntryId, list);
    }
    for (const list of linesByEntry.values()) {
      list.sort((a, b) => a.lineNo - b.lineNo);
    }

    const result: Array<{
      entry: FinanceJournalEntry;
      line: FinanceJournalLine;
      accountCode: string;
      accountName: string;
      sourceType: string | null;
      preparedByProfileId: string | null;
    }> = [];

    for (const entry of entries) {
      const entryLines = linesByEntry.get(entry.id) ?? [];
      const tx = txById.get(entry.transactionId);
      for (const line of entryLines) {
        const account = accountById.get(line.accountId);
        result.push({
          entry,
          line,
          accountCode: account?.code ?? "—",
          accountName: account?.name ?? "Unknown account",
          sourceType: tx?.transactionType ?? null,
          preparedByProfileId: tx?.createdByProfileId || null,
        });
      }
    }

    return result;
  }

  async listJournalLinesWithAccounts(journalEntryId: string): Promise<
    Array<{
      line: FinanceJournalLine;
      accountCode: string;
      accountName: string;
      accountType: string;
    }>
  > {
    const lines = await this.listJournalLines(journalEntryId);
    if (lines.length === 0) return [];
    const accountIds = [...new Set(lines.map((l) => l.accountId))];
    const { data, error } = await db()
      .from("finance_accounts")
      .select("id, code, name, account_type")
      .eq("organisation_id", this.organisationId)
      .in("id", accountIds);
    if (error) throwDb(error, "Failed to load journal line accounts.");
    const byId = new Map(
      (data ?? []).map((row) => [
        row.id as string,
        {
          code: String(row.code),
          name: String(row.name),
          accountType: String(row.account_type),
        },
      ])
    );
    return lines.map((line) => {
      const account = byId.get(line.accountId);
      return {
        line,
        accountCode: account?.code ?? "—",
        accountName: account?.name ?? "Unknown account",
        accountType: account?.accountType ?? "expense",
      };
    });
  }

  async getProfilesByIds(
    profileIds: string[]
  ): Promise<Map<string, string>> {
    const unique = [...new Set(profileIds.filter(Boolean))];
    if (unique.length === 0) return new Map();
    const { data, error } = await db()
      .from("profiles")
      .select("id, full_name, first_name, last_name")
      .in("id", unique);
    if (error) throwDb(error, "Failed to load profiles.");
    const map = new Map<string, string>();
    for (const row of data ?? []) {
      const full =
        (row.full_name && String(row.full_name).trim()) ||
        [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
        null;
      if (full) map.set(row.id as string, full);
    }
    return map;
  }

  async getTrialBalanceRows(filters: {
    companyId?: string | null;
    periodId?: string | null;
  }): Promise<
    Array<{
      accountType: string;
      totalDebit: number;
      totalCredit: number;
    }>
  > {
    let query = db()
      .from("finance_trial_balance_v")
      .select("account_type, total_debit, total_credit")
      .eq("organisation_id", this.organisationId);
    if (filters.companyId) {
      query = query.eq("company_id", filters.companyId);
    }
    if (filters.periodId) {
      query = query.eq("period_id", filters.periodId);
    }
    const { data, error } = await query;
    if (error) throwDb(error, "Failed to load trial balance.");
    return (data ?? []).map((row) => ({
      accountType: String(row.account_type),
      totalDebit: Number(row.total_debit ?? 0),
      totalCredit: Number(row.total_credit ?? 0),
    }));
  }

  /**
   * Posted GL activity from finance_general_ledger_v.
   * Totals cover the full filtered set via a server-only debit/credit scan;
   * page rows are server-paginated. Does not use PostgREST aggregate aliases.
   */
  async queryGeneralLedger(input: {
    companyId: string;
    accountId: string;
    periodId?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
    search?: string | null;
    page: number;
    pageSize: number;
  }): Promise<{
    rows: Array<{
      journalLineId: string;
      journalEntryId: string;
      transactionId: string | null;
      entryDate: string;
      reference: string;
      entryDescription: string;
      lineDescription: string | null;
      accountCode: string;
      accountName: string;
      debit: number;
      credit: number;
      preparedByProfileId: string | null;
    }>;
    total: number;
    totalDebit: number;
    totalCredit: number;
  }> {
    const page = Math.max(1, input.page);
    const pageSize = input.pageSize === 50 ? 50 : 20;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const search = input.search?.trim()
      ? input.search.trim().replace(/[%_,]/g, "\\$&")
      : "";
    const searchOr = search
      ? [
          `entry_reference.ilike.%${search}%`,
          `entry_description.ilike.%${search}%`,
          `line_description.ilike.%${search}%`,
        ].join(",")
      : "";
    const periodId = input.periodId?.trim() || null;
    const dateFrom = input.dateFrom?.trim() || null;
    const dateTo = input.dateTo?.trim() || null;

    let pageQuery = db()
      .from("finance_general_ledger_v")
      .select(
        "journal_line_id,journal_entry_id,transaction_id,entry_date,entry_reference,entry_description,line_description,account_code,account_name,debit,credit,line_no",
        { count: "exact" }
      )
      .eq("organisation_id", this.organisationId)
      .eq("company_id", input.companyId)
      .eq("account_id", input.accountId);
    if (periodId) pageQuery = pageQuery.eq("period_id", periodId);
    if (dateFrom) pageQuery = pageQuery.gte("entry_date", dateFrom);
    if (dateTo) pageQuery = pageQuery.lte("entry_date", dateTo);
    if (searchOr) pageQuery = pageQuery.or(searchOr);

    const [pageResult, totals] = await Promise.all([
      pageQuery
        .order("entry_date", { ascending: true })
        .order("entry_reference", { ascending: true })
        .order("line_no", { ascending: true })
        .order("journal_line_id", { ascending: true })
        .range(from, to),
      this.sumGeneralLedgerDebitCredit({
        companyId: input.companyId,
        accountId: input.accountId,
        periodId,
        dateFrom,
        dateTo,
        searchOr,
      }),
    ]);

    if (pageResult.error) throwDb(pageResult.error, "Failed to load general ledger.");

    type LedgerRow = {
      journal_line_id: string;
      journal_entry_id: string;
      transaction_id: string | null;
      entry_date: string;
      entry_reference: string;
      entry_description: string | null;
      line_description: string | null;
      account_code: string;
      account_name: string;
      debit: number | string | null;
      credit: number | string | null;
    };

    const mappedRows = ((pageResult.data ?? []) as LedgerRow[]).map((row) => ({
      journalLineId: row.journal_line_id,
      journalEntryId: row.journal_entry_id,
      transactionId: row.transaction_id ?? null,
      entryDate: row.entry_date,
      reference: row.entry_reference,
      entryDescription: row.entry_description ?? "",
      lineDescription: row.line_description ?? null,
      accountCode: row.account_code,
      accountName: row.account_name,
      debit: Number(row.debit ?? 0),
      credit: Number(row.credit ?? 0),
      preparedByProfileId: null as string | null,
    }));

    const txIds = [
      ...new Set(mappedRows.map((row) => row.transactionId).filter(Boolean)),
    ] as string[];
    if (txIds.length > 0) {
      const { data: txRows, error: txError } = await db()
        .from("finance_transactions")
        .select("id, created_by_profile_id")
        .eq("organisation_id", this.organisationId)
        .in("id", txIds);
      if (txError) throwDb(txError, "Failed to load ledger preparers.");
      const createdByByTx = new Map(
        (txRows ?? []).map((row) => [
          String(row.id),
          String(row.created_by_profile_id ?? "") || null,
        ])
      );
      for (const row of mappedRows) {
        row.preparedByProfileId = row.transactionId
          ? createdByByTx.get(row.transactionId) ?? null
          : null;
      }
    }

    return {
      rows: mappedRows,
      total: pageResult.count ?? 0,
      totalDebit: totals.totalDebit,
      totalCredit: totals.totalCredit,
    };
  }

  private async sumGeneralLedgerDebitCredit(input: {
    companyId: string;
    accountId: string;
    periodId: string | null;
    dateFrom: string | null;
    dateTo: string | null;
    searchOr: string;
  }): Promise<{ totalDebit: number; totalCredit: number }> {
    const pageSize = 1000;
    let offset = 0;
    let totalDebit = 0;
    let totalCredit = 0;
    for (;;) {
      let totalsQuery = db()
        .from("finance_general_ledger_v")
        .select("debit, credit")
        .eq("organisation_id", this.organisationId)
        .eq("company_id", input.companyId)
        .eq("account_id", input.accountId);
      if (input.periodId) totalsQuery = totalsQuery.eq("period_id", input.periodId);
      if (input.dateFrom) totalsQuery = totalsQuery.gte("entry_date", input.dateFrom);
      if (input.dateTo) totalsQuery = totalsQuery.lte("entry_date", input.dateTo);
      if (input.searchOr) totalsQuery = totalsQuery.or(input.searchOr);
      // journal_line_id is unique: a total order, so page boundaries cannot skip or repeat a line.
      const { data, error } = await totalsQuery
        .order("journal_line_id", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throwDb(error, "Failed to load general ledger totals.");
      const batch = (data ?? []) as Array<{
        debit: number | string | null;
        credit: number | string | null;
      }>;
      for (const row of batch) {
        totalDebit += Number(row.debit ?? 0);
        totalCredit += Number(row.credit ?? 0);
      }
      if (batch.length < pageSize) break;
      offset += pageSize;
      if (offset >= 1_000_000) {
        throw new Error("General ledger totals exceeded the v1 scan limit.");
      }
    }
    return {
      totalDebit: roundMoney2(totalDebit),
      totalCredit: roundMoney2(totalCredit),
    };
  }

  /**
   * Period × account posted movement from finance_trial_balance_v,
   * joined to period calendar and live CoA classification.
   */
  async listPostedAccountMovements(
    companyId: string
  ): Promise<PostedAccountMovement[]> {
    // Structural view of the Supabase client (its full generic type is too deep to check against the narrow surface).
    const raw = await fetchPostedMovementRows(db() as unknown as PostedMovementClient, {
      organisationId: this.organisationId,
      companyId,
    });

    if (raw.length === 0) return [];

    const [periods, accounts] = await Promise.all([
      this.listPeriods(companyId),
      this.listAccounts(),
    ]);
    const periodById = new Map(periods.map((period) => [period.id, period]));
    const accountById = new Map(accounts.map((account) => [account.id, account]));

    const movements: PostedAccountMovement[] = [];
    for (const row of raw) {
      const period = periodById.get(row.period_id);
      if (!period) continue;
      if (!isFinanceAccountType(row.account_type)) continue;
      const account = accountById.get(row.account_id);
      movements.push({
        periodId: row.period_id,
        year: period.year,
        month: period.month,
        accountId: row.account_id,
        accountCode: row.account_code,
        accountName: row.account_name,
        accountType: row.account_type as FinanceAccountType,
        classification: account?.classification ?? null,
        totalDebit: Number(row.total_debit ?? 0),
        totalCredit: Number(row.total_credit ?? 0),
      });
    }
    return movements;
  }

  async listRecentAuditEvents(profileId: string, limit = 12): Promise<
    Array<{
      id: string;
      action: string;
      objectType: string;
      objectId: string;
      reason: string | null;
      createdAt: string;
      companyId: string | null;
    }>
  > {
    const { data, error } = await db()
      .from("finance_audit_events")
      .select(
        "id, action, object_type, object_id, reason, created_at, company_id"
      )
      .eq("organisation_id", this.organisationId)
      .order("created_at", { ascending: false })
      .limit(Math.max(limit * 5, 50));
    if (error) throwDb(error, "Failed to list finance audit events.");
    const visibleFinancialAccountIds = new Set(
      (
        await new PlatformFinanceFinancialAccountsRepository(
          this.organisationId
        ).listVisible(profileId)
      ).map((row) => row.id)
    );
    return (data ?? [])
      .filter(
        (row) =>
          row.object_type !== "financial_account" ||
          visibleFinancialAccountIds.has(String(row.object_id))
      )
      .slice(0, limit)
      .map((row) => ({
        id: row.id as string,
        action: row.action as string,
        objectType: row.object_type as string,
        objectId: row.object_id as string,
        reason: (row.reason as string | null) ?? null,
        createdAt: row.created_at as string,
        companyId: (row.company_id as string | null) ?? null,
      }));
  }
}
