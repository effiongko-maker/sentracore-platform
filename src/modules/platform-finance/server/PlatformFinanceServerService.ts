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
import type { FinanceOverviewSnapshot } from "@/modules/platform-finance/overviewTypes";
import { PlatformFinanceRequestsRepository } from "@/modules/platform-finance/server/PlatformFinanceRequestsRepository";

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

  /**
   * Finance Overview aggregates — reads existing companies/periods/journals/requests.
   * Does not invent cash, payables, receivables, or free-cash figures.
   */
  async getOverview(input: {
    profileId: string;
    companyId?: string | null;
    periodId?: string | null;
  }): Promise<FinanceOverviewSnapshot> {
    const asOf = new Date().toISOString();
    const allCompanies = await this.repo.listCompanies();
    const accessibleIds = new Set(
      await this.repo.listAccessibleCompanyIds(input.profileId)
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
    const requests =
      await this.requestsRepo.listRequestsForCompanies(companyIdsForRequests);

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
    const needsAttention =
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
        : [];

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
    const unpostedItems = transactions.filter((t) => t.status === "draft")
      .length;

    const audits = await this.repo.listRecentAuditEvents(16);
    const requestEvents = await this.requestsRepo.listRecentRequestEvents(16);
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
      .slice(0, 8);

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
