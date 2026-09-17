import { ActionError } from "@/lib/actions/errors";
import {
  OPENING_BALANCE_CLEARING_CODE,
  OPENING_BALANCE_CLEARING_NAME,
  OPENING_POSITION_SOURCE_TYPE,
  PHASE_2E_DEFAULT_CUTOVER_DATE,
  normalizeOpeningAmount,
  type OpeningPositionListItem,
  type OpeningPositionReview,
} from "@/modules/platform-finance/domain/openingPositions";
import { PlatformFinanceFinancialAccountsRepository } from "@/modules/platform-finance/server/PlatformFinanceFinancialAccountsRepository";
import { PlatformFinanceRepository } from "@/modules/platform-finance/server/PlatformFinanceRepository";
import { PlatformFinanceServerService } from "@/modules/platform-finance/server/PlatformFinanceServerService";
import { postFinanceTransaction } from "@/modules/platform-finance/server/posting";
import type { FinanceAccount } from "@/modules/platform-finance/types";
import { createAdminClient } from "@/utils/supabase/admin";

type Actor = { organisationId: string; profileId: string };

type OpeningRow = {
  id: string;
  organisation_id: string;
  company_id: string;
  financial_account_id: string;
  cutover_date: string;
  amount: number | string | null;
  currency: string;
  offset_gl_account_id: string;
  finance_transaction_id: string | null;
  status: "draft" | "posted";
};

export class PlatformFinanceOpeningPositionsServerService {
  private readonly repo: PlatformFinanceRepository;
  private readonly accounts: PlatformFinanceFinancialAccountsRepository;
  private readonly accounting: PlatformFinanceServerService;

  constructor(private readonly organisationId: string) {
    this.repo = new PlatformFinanceRepository(organisationId);
    this.accounts = new PlatformFinanceFinancialAccountsRepository(organisationId);
    this.accounting = new PlatformFinanceServerService(organisationId);
  }

  async listForVisibleAccounts(
    actor: Actor,
    financialAccountIds: string[]
  ): Promise<OpeningPositionListItem[]> {
    if (!financialAccountIds.length) return [];
    await this.assertFaView(actor);
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("finance_financial_account_opening_positions")
      .select(
        "id,financial_account_id,status,amount,currency,cutover_date,finance_transaction_id"
      )
      .eq("organisation_id", this.organisationId)
      .in("financial_account_id", financialAccountIds);
    if (error) throw new ActionError("INTERNAL_ERROR", error.message);

    const txIds = (data ?? [])
      .map((row) => row.finance_transaction_id as string | null)
      .filter((id): id is string => Boolean(id));
    const journalByTx = new Map<string, string>();
    if (txIds.length) {
      const { data: txs } = await admin
        .from("finance_transactions")
        .select("id,journal_entry_id")
        .eq("organisation_id", this.organisationId)
        .in("id", txIds);
      for (const tx of txs ?? []) {
        if (tx.journal_entry_id) {
          journalByTx.set(tx.id as string, tx.journal_entry_id as string);
        }
      }
    }

    return (data ?? []).map((row) => ({
      financialAccountId: row.financial_account_id as string,
      openingPositionId: row.id as string,
      status: row.status as "draft" | "posted",
      amount: row.amount == null ? null : Number(row.amount),
      currency: row.currency as string,
      cutoverDate: row.cutover_date as string,
      journalEntryId: row.finance_transaction_id
        ? journalByTx.get(row.finance_transaction_id as string) ?? null
        : null,
    }));
  }

  async getOrCreateReview(
    actor: Actor,
    financialAccountId: string
  ): Promise<OpeningPositionReview> {
    await this.assertCapability(actor, "createTransaction");
    await this.requireVisibleActiveFinancialAccount(actor, financialAccountId);

    const admin = createAdminClient();
    const { data, error } = await admin.rpc(
      "finance_opening_position_get_or_create",
      {
        p_actor_profile_id: actor.profileId,
        p_financial_account_id: financialAccountId,
      }
    );
    if (error || typeof data !== "string") {
      throw new ActionError(
        "VALIDATION_ERROR",
        error?.message ?? "Unable to start opening position."
      );
    }
    return this.loadReview(actor, data);
  }

  async getReview(
    actor: Actor,
    financialAccountId: string
  ): Promise<OpeningPositionReview> {
    await this.assertFaView(actor);
    const visible = await this.accounts.getVisible(
      actor.profileId,
      financialAccountId
    );
    if (!visible) {
      throw new ActionError("VALIDATION_ERROR", "Financial Account not found.");
    }

    const admin = createAdminClient();
    const { data } = await admin
      .from("finance_financial_account_opening_positions")
      .select("id")
      .eq("organisation_id", this.organisationId)
      .eq("financial_account_id", financialAccountId)
      .maybeSingle();
    if (!data) {
      return this.getOrCreateReview(actor, financialAccountId);
    }
    return this.loadReview(actor, data.id as string);
  }

  async updateDraft(
    actor: Actor,
    financialAccountId: string,
    input: { amount: unknown; cutoverDate?: string | null }
  ): Promise<OpeningPositionReview> {
    await this.assertCapability(actor, "createTransaction");
    const review = await this.getOrCreateReview(actor, financialAccountId);
    if (review.status === "posted") {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Posted opening positions cannot be changed."
      );
    }

    const amount = normalizeOpeningAmount(input.amount);
    if (amount == null) {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Opening amount must be a positive amount."
      );
    }

    const cutoverDate =
      typeof input.cutoverDate === "string" && input.cutoverDate.trim()
        ? input.cutoverDate.trim()
        : review.openingPosition.cutoverDate || PHASE_2E_DEFAULT_CUTOVER_DATE;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoverDate)) {
      throw new ActionError("VALIDATION_ERROR", "Cutover date is invalid.");
    }

    const admin = createAdminClient();
    const { error } = await admin.rpc("finance_opening_position_update_draft", {
      p_actor_profile_id: actor.profileId,
      p_opening_position_id: review.openingPosition.id,
      p_amount: amount,
      p_cutover_date: cutoverDate,
    });
    if (error) {
      throw new ActionError("VALIDATION_ERROR", error.message);
    }
    return this.loadReview(actor, review.openingPosition.id);
  }

  async post(
    actor: Actor,
    financialAccountId: string
  ): Promise<OpeningPositionReview> {
    await this.assertCapability(actor, "post");
    const review = await this.getReview(actor, financialAccountId);
    if (review.status === "posted") return review;

    if (review.openingPosition.amount == null || review.openingPosition.amount <= 0) {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Opening amount must be set before posting."
      );
    }
    if (!review.period) {
      throw new ActionError(
        "VALIDATION_ERROR",
        "No open accounting period covers the cutover date."
      );
    }
    if (!review.transaction.id || review.transaction.status !== "draft") {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Opening position finance transaction is not ready to post."
      );
    }

    // Revalidate current FA + control GL truth immediately before post.
    const fa = await this.requireVisibleActiveFinancialAccount(
      actor,
      financialAccountId
    );
    if (fa.currency !== review.openingPosition.currency) {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Financial Account currency no longer matches the opening position."
      );
    }
    const debit = this.requireValidControlAccount(
      await this.repo.getAccount(fa.controlGlAccountId)
    );
    const credit = await this.requireOpeningBalanceClearing();
    if (credit.id !== review.openingPosition.offsetGlAccountId) {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Opening Balance Clearing configuration is no longer valid."
      );
    }

    // Posted FT/JE must use the reviewed opening cutover date — no substitution.
    if (review.transaction.transactionDate !== review.openingPosition.cutoverDate) {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Opening position date and finance transaction date are out of sync."
      );
    }
    if (review.transaction.amount !== review.openingPosition.amount) {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Opening position amount and finance transaction amount are out of sync."
      );
    }

    const amount = review.openingPosition.amount;
    const description = review.transaction.description;
    await postFinanceTransaction({
      transactionId: review.transaction.id,
      actorProfileId: actor.profileId,
      periodId: review.period.id,
      reason: "Financial Account opening position reviewed and posted.",
      lines: [
        {
          accountId: debit.id,
          debit: amount,
          credit: 0,
          description,
        },
        {
          accountId: credit.id,
          debit: 0,
          credit: amount,
          description,
        },
      ],
    });

    const admin = createAdminClient();
    const { error } = await admin.rpc("finance_opening_position_mark_posted", {
      p_actor_profile_id: actor.profileId,
      p_opening_position_id: review.openingPosition.id,
      p_finance_transaction_id: review.transaction.id,
    });
    if (error) {
      throw new ActionError("VALIDATION_ERROR", error.message);
    }
    return this.loadReview(actor, review.openingPosition.id);
  }

  private async loadReview(
    actor: Actor,
    openingPositionId: string
  ): Promise<OpeningPositionReview> {
    const admin = createAdminClient();
    const { data: opening, error } = await admin
      .from("finance_financial_account_opening_positions")
      .select(
        "id,organisation_id,company_id,financial_account_id,cutover_date,amount,currency,offset_gl_account_id,finance_transaction_id,status"
      )
      .eq("organisation_id", this.organisationId)
      .eq("id", openingPositionId)
      .single();
    if (error || !opening) {
      throw new ActionError("VALIDATION_ERROR", "Opening position not found.");
    }

    const row = opening as OpeningRow;
    const accessible = await this.repo.listAccessibleCompanyIds(actor.profileId);
    if (!accessible.includes(row.company_id)) {
      throw new ActionError("FORBIDDEN", "No company access.");
    }

    const visibleFa = await this.accounts.getVisible(
      actor.profileId,
      row.financial_account_id
    );
    if (!visibleFa) {
      // Existence-level confidentiality: do not reveal opening identity.
      throw new ActionError("VALIDATION_ERROR", "Financial Account not found.");
    }

    const [{ data: company }, { data: faRow }] = await Promise.all([
      admin.from("finance_companies").select("name").eq("id", row.company_id).single(),
      admin
        .from("finance_financial_accounts")
        .select(
          "id,name,institution_name,account_number_last4,account_type,currency,control_gl_account_id,visibility_policy,status,company_id"
        )
        .eq("id", row.financial_account_id)
        .single(),
    ]);
    if (!faRow) {
      throw new ActionError("VALIDATION_ERROR", "Financial Account not found.");
    }

    if (!row.finance_transaction_id) {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Opening position is missing its finance transaction."
      );
    }
    const transaction = await this.repo.getTransaction(row.finance_transaction_id);
    if (
      !transaction ||
      transaction.sourceType !== OPENING_POSITION_SOURCE_TYPE ||
      transaction.sourceId !== row.id
    ) {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Opening position accounting lineage is invalid."
      );
    }

    const debit = this.requireValidControlAccount(
      await this.repo.getAccount(faRow.control_gl_account_id as string)
    );
    const credit = await this.requireOpeningBalanceClearing();
    const period = await this.accounting.findOpenPeriodForDate(
      row.company_id,
      row.cutover_date
    );

    return {
      status: row.status,
      openingPosition: {
        id: row.id,
        financialAccountId: row.financial_account_id,
        companyId: row.company_id,
        cutoverDate: row.cutover_date,
        amount: row.amount == null ? null : Number(row.amount),
        currency: row.currency,
        offsetGlAccountId: row.offset_gl_account_id,
        financeTransactionId: row.finance_transaction_id,
        status: row.status,
      },
      financialAccount: {
        visibility: "visible",
        id: faRow.id as string,
        name: faRow.name as string,
        institutionName: (faRow.institution_name as string | null) ?? null,
        last4: (faRow.account_number_last4 as string | null) ?? null,
        accountType: faRow.account_type as string,
        currency: faRow.currency as string,
        controlGlAccountCode: debit.code,
        controlGlAccountName: debit.name,
      },
      companyName: (company?.name as string | undefined) ?? "Company",
      debitAccount: debit,
      creditAccount: credit,
      transaction,
      period,
      journalEntryId: transaction.journalEntryId,
    };
  }

  private async requireVisibleActiveFinancialAccount(
    actor: Actor,
    financialAccountId: string
  ) {
    const account = await this.accounts.getVisible(
      actor.profileId,
      financialAccountId
    );
    if (!account) {
      throw new ActionError("VALIDATION_ERROR", "Financial Account not found.");
    }
    if (account.status !== "active") {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Financial Account is inactive and cannot receive an opening position."
      );
    }
    if (account.organisationId !== this.organisationId) {
      throw new ActionError("VALIDATION_ERROR", "Financial Account not found.");
    }
    return account;
  }

  private requireValidControlAccount(account: FinanceAccount | null): FinanceAccount {
    if (
      !account ||
      account.organisationId !== this.organisationId ||
      account.status !== "active" ||
      account.accountType !== "asset" ||
      account.classification !== "current_asset"
    ) {
      throw new ActionError(
        "VALIDATION_ERROR",
        "The Financial Account control account configuration is no longer valid for posting."
      );
    }
    return account;
  }

  private async requireOpeningBalanceClearing(): Promise<FinanceAccount> {
    const accounts = await this.repo.listAccounts();
    const clearing = accounts.find(
      (account) =>
        account.code === OPENING_BALANCE_CLEARING_CODE &&
        account.name === OPENING_BALANCE_CLEARING_NAME &&
        account.accountType === "equity" &&
        account.status === "active"
    );
    if (!clearing) {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Opening Balance Clearing account is unavailable."
      );
    }
    return clearing;
  }

  private async assertFaView(actor: Actor) {
    const caps = await this.accounts.listCapabilities(actor.profileId);
    if (!caps.has("platform_finance.financial_account.view")) {
      throw new ActionError(
        "FORBIDDEN",
        "Missing capability platform_finance.financial_account.view."
      );
    }
  }

  private async assertCapability(
    actor: Actor,
    key: "createTransaction" | "post"
  ) {
    const caps = await this.accounting.getMyAccountingCapabilities(actor.profileId);
    if (!caps[key]) {
      throw new ActionError(
        "FORBIDDEN",
        `Missing accounting ${key === "post" ? "post" : "create transaction"} authority.`
      );
    }
  }
}
