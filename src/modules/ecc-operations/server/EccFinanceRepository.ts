import { createAdminClient } from "@/utils/supabase/admin";
import { ECC_FINANCE_CATEGORIES } from "@/modules/ecc-operations/constants";
import { nowIso } from "@/modules/ecc-operations/domain/rules";
import { newEccId } from "@/modules/ecc-operations/ids";
import { mapUniqueViolation } from "@/modules/ecc-operations/server/validation";
import type {
  EccCreateFinanceBudgetInput,
  EccCreateFinanceCommitmentInput,
  EccCreateFinanceTransactionInput,
  EccFinanceBudget,
  EccFinanceBudgetStatus,
  EccFinanceCategory,
  EccFinanceCommitment,
  EccFinanceCommitmentStatus,
  EccFinanceSnapshot,
  EccFinanceTransaction,
  EccFinanceTransactionStatus,
} from "@/modules/ecc-operations/types";
import { DEFAULT_ECC_CENTRE } from "@/modules/ecc-operations/types";

type BudgetRow = {
  organisation_id: string;
  id: string;
  centre_id: string;
  period_label: string;
  amount: number | string;
  currency: string;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type TransactionRow = {
  organisation_id: string;
  id: string;
  centre_id: string;
  transaction_date: string;
  reference: string | null;
  description: string;
  category: string;
  amount: number | string;
  currency: string;
  status: string;
  recorded_by: string;
  created_at: string;
  updated_at: string;
};

type CommitmentRow = {
  organisation_id: string;
  id: string;
  centre_id: string;
  description: string;
  category: string;
  expected_amount: number | string;
  currency: string;
  due_date: string | null;
  status: string;
  recorded_by: string;
  created_at: string;
  updated_at: string;
};

const ACTUAL_TX_STATUSES: ReadonlySet<EccFinanceTransactionStatus> = new Set([
  "settled",
  "recorded",
]);

const OPEN_COMMITMENT_STATUSES: ReadonlySet<EccFinanceCommitmentStatus> =
  new Set(["pending", "approved", "due"]);

function db() {
  return createAdminClient();
}

function throwDb(error: { code?: string; message?: string } | null, fallback: string): never {
  throw mapUniqueViolation(error, fallback);
}

function toNumber(value: number | string): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function currentPeriodLabel(date = new Date()): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(date);
}

function monthBounds(date = new Date()): { start: string; end: string } {
  const year = date.getFullYear();
  const month = date.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(year, month + 1, 0).getDate();
  return {
    start: `${year}-${pad(month + 1)}-01`,
    end: `${year}-${pad(month + 1)}-${pad(lastDay)}`,
  };
}

function budgetToDto(row: BudgetRow): EccFinanceBudget {
  return {
    id: row.id,
    centreId: row.centre_id,
    periodLabel: row.period_label,
    amount: toNumber(row.amount),
    currency: row.currency,
    status: row.status as EccFinanceBudgetStatus,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function transactionToDto(row: TransactionRow): EccFinanceTransaction {
  return {
    id: row.id,
    centreId: row.centre_id,
    date:
      typeof row.transaction_date === "string"
        ? row.transaction_date.slice(0, 10)
        : String(row.transaction_date).slice(0, 10),
    reference: row.reference?.trim() || "",
    description: row.description,
    category: row.category as EccFinanceCategory,
    amount: toNumber(row.amount),
    currency: row.currency,
    status: row.status as EccFinanceTransactionStatus,
    recordedBy: row.recorded_by,
    createdAt: row.created_at,
  };
}

function commitmentToDto(row: CommitmentRow): EccFinanceCommitment {
  return {
    id: row.id,
    centreId: row.centre_id,
    description: row.description,
    category: row.category as EccFinanceCategory,
    expectedAmount: toNumber(row.expected_amount),
    currency: row.currency,
    dueDate: row.due_date
      ? String(row.due_date).slice(0, 10)
      : undefined,
    status: row.status as EccFinanceCommitmentStatus,
    recordedBy: row.recorded_by,
    createdAt: row.created_at,
  };
}

export class EccFinanceRepository {
  constructor(private readonly organisationId: string) {}

  async getActiveBudget(
    centreId = DEFAULT_ECC_CENTRE.id
  ): Promise<EccFinanceBudget | null> {
    const { data, error } = await db()
      .from("ecc_finance_budgets")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .eq("centre_id", centreId)
      .eq("status", "active")
      .maybeSingle();
    if (error) throwDb(error, "Failed to load ECC budget.");
    return data ? budgetToDto(data as BudgetRow) : null;
  }

  async listRecentTransactions(
    centreId = DEFAULT_ECC_CENTRE.id,
    limit = 50
  ): Promise<EccFinanceTransaction[]> {
    const { data, error } = await db()
      .from("ecc_finance_transactions")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .eq("centre_id", centreId)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throwDb(error, "Failed to list ECC transactions.");
    return ((data as TransactionRow[] | null) ?? []).map(transactionToDto);
  }

  async listOpenCommitments(
    centreId = DEFAULT_ECC_CENTRE.id
  ): Promise<EccFinanceCommitment[]> {
    const { data, error } = await db()
      .from("ecc_finance_commitments")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .eq("centre_id", centreId)
      .in("status", [...OPEN_COMMITMENT_STATUSES])
      .order("created_at", { ascending: false });
    if (error) throwDb(error, "Failed to list ECC commitments.");
    return ((data as CommitmentRow[] | null) ?? []).map(commitmentToDto);
  }

  /**
   * Create a new active budget. Prior active budget for the centre is superseded
   * (history preserved — not deleted or overwritten in place).
   */
  async setBudget(input: EccCreateFinanceBudgetInput): Promise<EccFinanceBudget> {
    const centreId = input.centreId ?? DEFAULT_ECC_CENTRE.id;
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error("Budget amount must be a non-negative number.");
    }
    const periodLabel = input.periodLabel.trim() || currentPeriodLabel();
    const currency = (input.currency?.trim() || "NGN").toUpperCase();
    const createdBy = input.createdBy.trim();
    if (!createdBy) throw new Error("created_by is required.");

    const stamp = nowIso();

    const { error: clearError } = await db()
      .from("ecc_finance_budgets")
      .update({ status: "superseded", updated_at: stamp })
      .eq("organisation_id", this.organisationId)
      .eq("centre_id", centreId)
      .eq("status", "active");
    if (clearError) throwDb(clearError, "Failed to supersede prior budget.");

    const budget: EccFinanceBudget = {
      id: newEccId("ECC-BUD"),
      centreId,
      periodLabel,
      amount,
      currency,
      status: "active",
      createdBy,
      createdAt: stamp,
    };

    const { error } = await db().from("ecc_finance_budgets").insert({
      organisation_id: this.organisationId,
      id: budget.id,
      centre_id: budget.centreId,
      period_label: budget.periodLabel,
      amount: budget.amount,
      currency: budget.currency,
      status: budget.status,
      created_by: budget.createdBy,
      created_at: budget.createdAt,
      updated_at: stamp,
    });
    if (error) throwDb(error, "Failed to create ECC budget.");
    return budget;
  }

  async createTransaction(
    input: EccCreateFinanceTransactionInput
  ): Promise<EccFinanceTransaction> {
    const centreId = input.centreId ?? DEFAULT_ECC_CENTRE.id;
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error("Transaction amount must be a non-negative number.");
    }
    const description = input.description.trim();
    if (!description) throw new Error("Description is required.");
    const recordedBy = input.recordedBy.trim();
    if (!recordedBy) throw new Error("recorded_by is required.");
    const date = input.date.trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error("Transaction date is required.");
    }

    const stamp = nowIso();
    const row: EccFinanceTransaction = {
      id: newEccId("ECC-FTX"),
      centreId,
      date,
      reference: input.reference?.trim() || "",
      description,
      category: input.category,
      amount,
      currency: (input.currency?.trim() || "NGN").toUpperCase(),
      status: input.status,
      recordedBy,
      createdAt: stamp,
    };

    const { error } = await db().from("ecc_finance_transactions").insert({
      organisation_id: this.organisationId,
      id: row.id,
      centre_id: row.centreId,
      transaction_date: row.date,
      reference: row.reference || null,
      description: row.description,
      category: row.category,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      recorded_by: row.recordedBy,
      created_at: row.createdAt,
      updated_at: stamp,
    });
    if (error) throwDb(error, "Failed to record ECC transaction.");
    return row;
  }

  async createCommitment(
    input: EccCreateFinanceCommitmentInput
  ): Promise<EccFinanceCommitment> {
    const centreId = input.centreId ?? DEFAULT_ECC_CENTRE.id;
    const expectedAmount = Number(input.expectedAmount);
    if (!Number.isFinite(expectedAmount) || expectedAmount < 0) {
      throw new Error("Expected amount must be a non-negative number.");
    }
    const description = input.description.trim();
    if (!description) throw new Error("Description is required.");
    const recordedBy = input.recordedBy.trim();
    if (!recordedBy) throw new Error("recorded_by is required.");

    const stamp = nowIso();
    const row: EccFinanceCommitment = {
      id: newEccId("ECC-FCM"),
      centreId,
      description,
      category: input.category,
      expectedAmount,
      currency: (input.currency?.trim() || "NGN").toUpperCase(),
      dueDate: input.dueDate?.trim().slice(0, 10) || undefined,
      status: input.status ?? "pending",
      recordedBy,
      createdAt: stamp,
    };

    const { error } = await db().from("ecc_finance_commitments").insert({
      organisation_id: this.organisationId,
      id: row.id,
      centre_id: row.centreId,
      description: row.description,
      category: row.category,
      expected_amount: row.expectedAmount,
      currency: row.currency,
      due_date: row.dueDate ?? null,
      status: row.status,
      recorded_by: row.recordedBy,
      created_at: row.createdAt,
      updated_at: stamp,
    });
    if (error) throwDb(error, "Failed to create ECC commitment.");
    return row;
  }

  async getCommitment(id: string): Promise<EccFinanceCommitment | null> {
    const { data, error } = await db()
      .from("ecc_finance_commitments")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .eq("id", id)
      .maybeSingle();
    if (error) throwDb(error, "Failed to load ECC commitment.");
    return data ? commitmentToDto(data as CommitmentRow) : null;
  }

  async updateCommitmentStatus(
    id: string,
    status: EccFinanceCommitmentStatus
  ): Promise<{
    previous: EccFinanceCommitmentStatus;
    commitment: EccFinanceCommitment;
  }> {
    const current = await this.getCommitment(id);
    if (!current) throw new Error("Commitment not found.");
    const previous = current.status;
    const stamp = nowIso();
    const { error } = await db()
      .from("ecc_finance_commitments")
      .update({ status, updated_at: stamp })
      .eq("organisation_id", this.organisationId)
      .eq("id", id);
    if (error) throwDb(error, "Failed to update commitment status.");
    return {
      previous,
      commitment: { ...current, status },
    };
  }

  async getFinanceSnapshot(
    centreId = DEFAULT_ECC_CENTRE.id
  ): Promise<EccFinanceSnapshot> {
    const periodLabel = currentPeriodLabel();
    const { start, end } = monthBounds();
    const [budget, transactions, commitments] = await Promise.all([
      this.getActiveBudget(centreId),
      this.listRecentTransactions(centreId, 50),
      this.listOpenCommitments(centreId),
    ]);

    const currency = budget?.currency ?? "NGN";

    const periodActual = transactions.filter(
      (row) =>
        ACTUAL_TX_STATUSES.has(row.status) &&
        row.date >= start &&
        row.date <= end
    );
    const totalExpenditure =
      periodActual.length === 0 && !budget
        ? null
        : periodActual.reduce((sum, row) => sum + row.amount, 0);

    const pendingCommitmentsTotal =
      commitments.length === 0 && !budget
        ? null
        : commitments.reduce((sum, row) => sum + row.expectedAmount, 0);

    const spent = totalExpenditure ?? 0;
    const committed = pendingCommitmentsTotal ?? 0;

    let availableBudget: number | null = null;
    if (budget) {
      availableBudget = budget.amount - committed - spent;
    }

    return {
      centreId,
      asOf: nowIso(),
      periodLabel: budget?.periodLabel ?? periodLabel,
      currency,
      budget: budget
        ? {
            id: budget.id,
            centreId: budget.centreId,
            periodLabel: budget.periodLabel,
            amount: budget.amount,
            currency: budget.currency,
            status: budget.status,
            createdBy: budget.createdBy,
            createdAt: budget.createdAt,
          }
        : null,
      totalExpenditure: budget || periodActual.length > 0 ? spent : null,
      pendingCommitmentsTotal:
        budget || commitments.length > 0 ? committed : null,
      availableBudget,
      budgetPosition: {
        budget: budget?.amount ?? null,
        committed: budget || commitments.length > 0 ? committed : null,
        spent: budget || periodActual.length > 0 ? spent : null,
        remaining: availableBudget,
      },
      transactions,
      commitments,
      categories: [...ECC_FINANCE_CATEGORIES],
    };
  }
}
