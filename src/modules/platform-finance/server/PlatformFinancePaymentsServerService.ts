/**
 * Platform Finance Payments — Phase 2C server service.
 * Confirm external disbursements; controlled single-Payable destination reveal.
 * Does not create journals or call finance_post_transaction.
 */
import { ActionError, toActionError } from "@/lib/actions/errors";
import {
  FINANCE_PAYMENT_CAPABILITIES,
  isFinancePayablePaymentEligible,
  type ConfirmFinancePaymentInput,
  type FinancePaymentView,
} from "@/modules/platform-finance/types";
import { PlatformFinancePaymentsRepository } from "@/modules/platform-finance/server/PlatformFinancePaymentsRepository";
import { PlatformFinancePayablesRepository } from "@/modules/platform-finance/server/PlatformFinancePayablesRepository";
import { PlatformFinanceFinancialAccountsRepository } from "@/modules/platform-finance/server/PlatformFinanceFinancialAccountsRepository";
import { rpcConfirmFinancePaymentAgainstPayable } from "@/modules/platform-finance/server/paymentTransitions";
import { decryptPaymentDestinationAccountNumber } from "@/modules/platform-finance/server/paymentDestinationCrypto";
import { createAdminClient } from "@/utils/supabase/admin";

export type FinancePaymentActorContext = {
  organisationId: string;
  profileId: string;
};

function mapRpcError(error: unknown): never {
  const mapped = toActionError(error);
  const message = mapped.message.toLowerCase();
  if (
    message.includes("missing capability") ||
    message.includes("no company access") ||
    message.includes("not usable by actor")
  ) {
    throw new ActionError("FORBIDDEN", mapped.message, { cause: error });
  }
  if (
    message.includes("not found") ||
    message.includes("amount") ||
    message.includes("outstanding") ||
    message.includes("mismatch") ||
    message.includes("incomplete") ||
    message.includes("not active") ||
    message.includes("not payable") ||
    message.includes("required")
  ) {
    throw new ActionError("VALIDATION_ERROR", mapped.message, { cause: error });
  }
  throw mapped;
}

export class PlatformFinancePaymentsServerService {
  private readonly payments: PlatformFinancePaymentsRepository;
  private readonly payables: PlatformFinancePayablesRepository;
  private readonly financialAccounts: PlatformFinanceFinancialAccountsRepository;

  constructor(private readonly organisationId: string) {
    this.payments = new PlatformFinancePaymentsRepository(organisationId);
    this.payables = new PlatformFinancePayablesRepository(organisationId);
    this.financialAccounts = new PlatformFinanceFinancialAccountsRepository(
      organisationId
    );
  }

  async getMyPaymentCapabilities(actor: FinancePaymentActorContext) {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("finance_capability_grants")
      .select("capability")
      .eq("organisation_id", actor.organisationId)
      .eq("profile_id", actor.profileId)
      .in("capability", [
        FINANCE_PAYMENT_CAPABILITIES.view,
        FINANCE_PAYMENT_CAPABILITIES.execute,
      ]);
    if (error) {
      throw new ActionError("INTERNAL_ERROR", error.message);
    }
    const granted = new Set((data ?? []).map((row) => row.capability as string));
    return {
      view: granted.has(FINANCE_PAYMENT_CAPABILITIES.view),
      execute: granted.has(FINANCE_PAYMENT_CAPABILITIES.execute),
    };
  }

  async listPaymentsForPayable(
    actor: FinancePaymentActorContext,
    payableId: string
  ): Promise<FinancePaymentView[]> {
    await this.assertPaymentView(actor);
    const payable = await this.payables.getPayable(payableId);
    if (!payable) throw new ActionError("VALIDATION_ERROR", "Payable not found.");
    await this.assertCompanyAccess(actor.profileId, payable.companyId);
    return this.payments.listByPayableId(payableId);
  }

  async listPayableSourceFinancialAccounts(
    actor: FinancePaymentActorContext,
    payableId: string
  ) {
    await this.assertPaymentExecute(actor);
    const payable = await this.payables.getPayable(payableId);
    if (!payable) throw new ActionError("VALIDATION_ERROR", "Payable not found.");
    if (!isFinancePayablePaymentEligible(payable.status)) {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Payable is not eligible for payment."
      );
    }
    await this.assertCompanyAccess(actor.profileId, payable.companyId);
    const accounts = await this.financialAccounts.listVisible(actor.profileId);
    return accounts.filter(
      (account) =>
        account.companyId === payable.companyId &&
        account.currency === payable.currency &&
        account.status === "active"
    );
  }

  async confirmPayment(
    actor: FinancePaymentActorContext,
    input: ConfirmFinancePaymentInput
  ): Promise<{ paymentId: string }> {
    await this.assertPaymentExecute(actor);
    if (!(input.amount > 0)) {
      throw new ActionError("VALIDATION_ERROR", "Payment amount must be > 0.");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paymentDate)) {
      throw new ActionError("VALIDATION_ERROR", "Payment date is required.");
    }
    try {
      const paymentId = await rpcConfirmFinancePaymentAgainstPayable({
        actorProfileId: actor.profileId,
        payableId: input.payableId,
        sourceFinancialAccountId: input.sourceFinancialAccountId,
        amount: input.amount,
        paymentDate: input.paymentDate,
        externalReference: input.externalReference ?? null,
      });
      return { paymentId };
    } catch (error) {
      mapRpcError(error);
    }
  }

  /**
   * Narrow reveal: decrypts the immutable Payable destination snapshot only.
   * Requires payment.execute + eligible payable + complete destination.
   * Never logs or audits plaintext.
   */
  async revealPayableDestinationAccountNumber(
    actor: FinancePaymentActorContext,
    payableId: string
  ): Promise<{
    accountNumber: string;
    bankName: string;
    accountName: string;
    accountNumberLast4: string;
  }> {
    await this.assertPaymentExecute(actor);
    const row = await this.payments.loadPayableDestinationCrypto(payableId);
    if (!row) throw new ActionError("VALIDATION_ERROR", "Payable not found.");
    await this.assertCompanyAccess(actor.profileId, row.company_id);

    if (!isFinancePayablePaymentEligible(row.status as "approved" | "partially_paid" | "paid")) {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Payable is not eligible for destination reveal."
      );
    }

    if (
      !row.payment_method ||
      !row.payment_bank_name ||
      !row.payment_account_name ||
      !row.payment_account_number_last4 ||
      !row.payment_account_number_ciphertext ||
      !row.payment_account_number_iv ||
      !row.payment_account_number_auth_tag ||
      row.payment_encryption_key_version == null
    ) {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Payable payment destination is incomplete."
      );
    }

    const accountNumber = decryptPaymentDestinationAccountNumber({
      account_number_ciphertext: row.payment_account_number_ciphertext,
      account_number_iv: row.payment_account_number_iv,
      account_number_auth_tag: row.payment_account_number_auth_tag,
      encryption_key_version: row.payment_encryption_key_version,
    });

    await this.payments.appendDestinationRevealAudit({
      organisationId: row.organisation_id,
      companyId: row.company_id,
      actorProfileId: actor.profileId,
      payableId: row.id,
      destinationLast4: row.payment_account_number_last4,
    });

    return {
      accountNumber,
      bankName: row.payment_bank_name,
      accountName: row.payment_account_name,
      accountNumberLast4: row.payment_account_number_last4,
    };
  }

  private async assertPaymentView(actor: FinancePaymentActorContext) {
    const caps = await this.getMyPaymentCapabilities(actor);
    if (!caps.view && !caps.execute) {
      throw new ActionError("FORBIDDEN", "Missing payment view authority.");
    }
  }

  private async assertPaymentExecute(actor: FinancePaymentActorContext) {
    const caps = await this.getMyPaymentCapabilities(actor);
    if (!caps.execute) {
      throw new ActionError("FORBIDDEN", "Missing payment execute authority.");
    }
  }

  private async assertCompanyAccess(profileId: string, companyId: string) {
    const companyIds =
      await this.financialAccounts.listAccessibleCompanyIds(profileId);
    if (!companyIds.includes(companyId)) {
      throw new ActionError("FORBIDDEN", "No company access.");
    }
  }
}
