import { createAdminClient } from "@/utils/supabase/admin";
import type {
  FinanceAccount,
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

function db() {
  return createAdminClient();
}

function throwDb(
  error: { message?: string; code?: string } | null,
  fallback: string
): never {
  throw new Error(error?.message?.trim() || fallback);
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
}
