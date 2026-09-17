import { ActionError } from "@/lib/actions/errors";
import type {
  PaymentAccountingReview,
  PaymentAccountingWorkItem,
} from "@/modules/platform-finance/domain/paymentAccounting";
import type { FinanceAccount, FinancePeriod } from "@/modules/platform-finance/types";
import { PlatformFinanceRepository } from "./PlatformFinanceRepository";
import { PlatformFinanceServerService } from "./PlatformFinanceServerService";
import { postFinanceTransaction } from "./posting";
import { createAdminClient } from "@/utils/supabase/admin";

type Actor = { organisationId: string; profileId: string };

export class PlatformFinancePaymentAccountingServerService {
  private readonly repo: PlatformFinanceRepository;
  private readonly accounting: PlatformFinanceServerService;

  constructor(private readonly organisationId: string) {
    this.repo = new PlatformFinanceRepository(organisationId);
    this.accounting = new PlatformFinanceServerService(organisationId);
  }

  async listWork(actor: Actor): Promise<PaymentAccountingWorkItem[]> {
    const caps = await this.accounting.getMyAccountingCapabilities(actor.profileId);
    if (!caps.view && !caps.createTransaction && !caps.post) throw new ActionError("FORBIDDEN", "Missing accounting authority.");
    const companyIds = await this.repo.listAccessibleCompanyIds(actor.profileId);
    if (!companyIds.length) return [];
    const admin = createAdminClient();
    const { data: payments, error } = await admin.from("finance_payments")
      .select("id,company_id,payable_id,amount,currency,payment_date")
      .eq("organisation_id", this.organisationId).eq("status", "confirmed")
      .in("company_id", companyIds).order("payment_date", { ascending: false });
    if (error) throw new ActionError("INTERNAL_ERROR", error.message);
    const paymentIds = (payments ?? []).map((p) => p.id as string);
    if (!paymentIds.length) return [];
    const [{ data: fts }, { data: payables }] = await Promise.all([
      admin.from("finance_transactions").select("id,source_id,status,journal_entry_id").eq("organisation_id", this.organisationId).eq("source_type", "payment").in("source_id", paymentIds),
      admin.from("finance_payables").select("id,payee_name").eq("organisation_id", this.organisationId).in("id", (payments ?? []).map((p) => p.payable_id as string)),
    ]);
    const ftByPayment = new Map((fts ?? []).map((ft) => [ft.source_id as string, ft]));
    const payeeById = new Map((payables ?? []).map((p) => [p.id as string, p.payee_name as string]));
    return (payments ?? []).map((p) => {
      const ft = ftByPayment.get(p.id as string);
      return {
        paymentId: p.id as string, payableId: p.payable_id as string,
        companyId: p.company_id as string, payeeName: payeeById.get(p.payable_id as string) ?? "Payee",
        amount: Number(p.amount), currency: p.currency as string, paymentDate: p.payment_date as string,
        accountingStatus: ft?.status === "posted" ? "posted" : ft ? "draft" : "pending",
        transactionId: (ft?.id as string | undefined) ?? null,
        journalEntryId: (ft?.journal_entry_id as string | null | undefined) ?? null,
      };
    });
  }

  async getOrCreateReview(actor: Actor, paymentId: string): Promise<PaymentAccountingReview> {
    await this.assertCapability(actor, "createTransaction");
    const { data, error } = await createAdminClient().rpc("finance_payment_accounting_get_or_create", {
      p_actor_profile_id: actor.profileId, p_payment_id: paymentId,
    });
    if (error || typeof data !== "string") throw new ActionError("VALIDATION_ERROR", error?.message ?? "Unable to start accounting review.");
    return this.loadReview(actor, paymentId, data);
  }

  async getReview(actor: Actor, paymentId: string): Promise<PaymentAccountingReview> {
    const admin = createAdminClient();
    const { data } = await admin.from("finance_transactions").select("id").eq("organisation_id", this.organisationId).eq("source_type", "payment").eq("source_id", paymentId).maybeSingle();
    if (!data) return this.getOrCreateReview(actor, paymentId);
    return this.loadReview(actor, paymentId, data.id as string);
  }

  async post(actor: Actor, paymentId: string, debitAccountId: string): Promise<PaymentAccountingReview> {
    await this.assertCapability(actor, "post");
    const review = await this.getReview(actor, paymentId);
    if (review.transaction.status === "posted") return review;
    if (!review.period) throw new ActionError("VALIDATION_ERROR", "This payment falls within a closed accounting period and cannot be posted under the current accounting policy.");
    const debit = await this.repo.getAccount(debitAccountId);
    if (!debit || debit.status !== "active" || debit.organisationId !== this.organisationId) throw new ActionError("VALIDATION_ERROR", "Selected debit account is unavailable.");
    const credit = await this.loadCurrentControlAccount(paymentId);
    const admin = createAdminClient();
    const { error } = await admin.rpc("finance_payment_accounting_set_debit", {
      p_actor_profile_id: actor.profileId, p_transaction_id: review.transaction.id, p_debit_account_id: debitAccountId,
    });
    if (error) throw new ActionError("VALIDATION_ERROR", error.message);
    await postFinanceTransaction({
      transactionId: review.transaction.id, actorProfileId: actor.profileId, periodId: review.period.id,
      reason: "Payment accounting reviewed and posted.",
      lines: [
        { accountId: debit.id, debit: review.payment.amount, credit: 0, description: review.transaction.description },
        { accountId: credit.id, debit: 0, credit: review.payment.amount, description: review.transaction.description },
      ],
    });
    return this.loadReview(actor, paymentId, review.transaction.id);
  }

  private async loadReview(actor: Actor, paymentId: string, transactionId: string): Promise<PaymentAccountingReview> {
    const admin = createAdminClient();
    const { data: payment, error } = await admin.from("finance_payments")
      .select("id,organisation_id,company_id,payable_id,source_financial_account_id,amount,currency,payment_date,external_reference,status,recorded_by_profile_id,created_at,updated_at")
      .eq("organisation_id", this.organisationId).eq("id", paymentId).single();
    if (error || !payment) throw new ActionError("VALIDATION_ERROR", "Confirmed Payment not found.");
    const accessible = await this.repo.listAccessibleCompanyIds(actor.profileId);
    if (!accessible.includes(payment.company_id as string)) throw new ActionError("FORBIDDEN", "No company access.");
    const [{ data: payable }, { data: account }, { data: company }] = await Promise.all([
      admin.from("finance_payables").select("id,payee_name,source_type,source_id").eq("id", payment.payable_id).single(),
      admin.from("finance_financial_accounts").select("id,name,account_number_last4,status,company_id,currency,control_gl_account_id,visibility_policy").eq("id", payment.source_financial_account_id).single(),
      admin.from("finance_companies").select("name").eq("id", payment.company_id).single(),
    ]);
    if (!payable || !account || account.status !== "active" || account.company_id !== payment.company_id || account.currency !== payment.currency) throw new ActionError("VALIDATION_ERROR", "Payment source Financial Account is no longer valid.");
    const transaction = await this.repo.getTransaction(transactionId);
    if (!transaction || transaction.sourceType !== "payment" || transaction.sourceId !== paymentId || transaction.companyId !== payment.company_id || transaction.amount !== Number(payment.amount) || transaction.currency !== payment.currency || transaction.transactionDate !== payment.payment_date) throw new ActionError("VALIDATION_ERROR", "Payment accounting lineage is invalid.");
    const credit = this.requireValidControlAccount(
      await this.repo.getAccount(account.control_gl_account_id as string)
    );
    const debitId = typeof transaction.metadata.debit_account_id === "string" ? transaction.metadata.debit_account_id : null;
    const debit = debitId ? await this.repo.getAccount(debitId) : null;
    const period = await this.accounting.findOpenPeriodForDate(transaction.companyId, transaction.transactionDate);
    const [{ data: viewGrant }, { data: restrictedGrant }] = await Promise.all([
      admin.from("finance_capability_grants").select("id").eq("organisation_id", this.organisationId).eq("profile_id", actor.profileId).eq("capability", "platform_finance.financial_account.view").maybeSingle(),
      admin.from("finance_financial_account_access").select("id").eq("financial_account_id", account.id).eq("profile_id", actor.profileId).maybeSingle(),
    ]);
    const canSeeSourceAccount = Boolean(viewGrant) && (account.visibility_policy === "company" || Boolean(restrictedGrant));
    return {
      status: transaction.status === "posted" ? "posted" : "draft",
      payment: { id: payment.id as string, organisationId: payment.organisation_id as string, companyId: payment.company_id as string, payableId: payment.payable_id as string, amount: Number(payment.amount), currency: payment.currency as string, paymentDate: payment.payment_date as string, externalReference: payment.external_reference as string | null, status: "confirmed", recordedByProfileId: payment.recorded_by_profile_id as string, createdAt: payment.created_at as string, updatedAt: payment.updated_at as string, sourceFinancialAccount: canSeeSourceAccount ? { visibility: "visible", name: account.name as string, last4: account.account_number_last4 as string | null } : { visibility: "restricted", label: "Restricted corporate financial account" } },
      payable: { id: payable.id as string, payeeName: payable.payee_name as string, sourceType: payable.source_type as string, sourceId: payable.source_id as string },
      companyName: (company?.name as string | undefined) ?? "Company", transaction, debitAccount: debit,
      creditAccount: credit, period: period as FinancePeriod | null, journalEntryId: transaction.journalEntryId,
    };
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
        "The source Financial Account control account configuration is no longer valid for posting."
      );
    }
    return account;
  }

  private async loadCurrentControlAccount(paymentId: string): Promise<FinanceAccount> {
    const admin = createAdminClient();
    const { data: payment, error: paymentError } = await admin
      .from("finance_payments")
      .select("source_financial_account_id")
      .eq("organisation_id", this.organisationId)
      .eq("id", paymentId)
      .single();
    if (paymentError || !payment) {
      throw new ActionError("VALIDATION_ERROR", "Confirmed Payment not found.");
    }
    const { data: financialAccount, error: accountError } = await admin
      .from("finance_financial_accounts")
      .select("control_gl_account_id")
      .eq("organisation_id", this.organisationId)
      .eq("id", payment.source_financial_account_id)
      .single();
    if (accountError || !financialAccount) {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Payment source Financial Account is no longer valid."
      );
    }
    return this.requireValidControlAccount(
      await this.repo.getAccount(financialAccount.control_gl_account_id as string)
    );
  }

  private async assertCapability(actor: Actor, key: "createTransaction" | "post") {
    const caps = await this.accounting.getMyAccountingCapabilities(actor.profileId);
    if (!caps[key]) throw new ActionError("FORBIDDEN", `Missing accounting ${key === "post" ? "post" : "create transaction"} authority.`);
  }
}
