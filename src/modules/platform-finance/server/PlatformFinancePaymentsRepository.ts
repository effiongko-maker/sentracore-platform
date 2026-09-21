/**
 * Platform Finance Payments — org-scoped read repository (Phase 2C).
 * Mutations go through finance_payment_confirm_against_payable (service_role).
 */
import { createAdminClient } from "@/utils/supabase/admin";
import type {
  FinancePayment,
  FinancePaymentStatus,
  FinancePaymentView,
} from "@/modules/platform-finance/domain/payments";

function db() {
  return createAdminClient();
}

function throwDb(
  error: { message?: string } | null,
  fallback: string
): never {
  throw new Error(error?.message?.trim() || fallback);
}

type PaymentRow = {
  id: string;
  organisation_id: string;
  company_id: string;
  payable_id: string;
  source_financial_account_id: string;
  amount: number | string;
  currency: string;
  payment_date: string;
  external_reference: string | null;
  status: string;
  recorded_by_profile_id: string;
  created_at: string;
  updated_at: string;
};

type PayableCryptoRow = {
  id: string;
  organisation_id: string;
  company_id: string;
  status: string;
  payment_method: string | null;
  payment_bank_name: string | null;
  payment_account_name: string | null;
  payment_account_number_last4: string | null;
  payment_account_number_ciphertext: string | null;
  payment_account_number_iv: string | null;
  payment_account_number_auth_tag: string | null;
  payment_encryption_key_version: number | null;
};

const PAYMENT_SELECT = [
  "id",
  "organisation_id",
  "company_id",
  "payable_id",
  "source_financial_account_id",
  "amount",
  "currency",
  "payment_date",
  "external_reference",
  "status",
  "recorded_by_profile_id",
  "created_at",
  "updated_at",
].join(", ");

function mapPayment(row: PaymentRow): FinancePayment {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    companyId: row.company_id,
    payableId: row.payable_id,
    sourceFinancialAccountId: row.source_financial_account_id,
    amount: Number(row.amount),
    currency: row.currency,
    paymentDate: row.payment_date,
    externalReference: row.external_reference,
    status: row.status as FinancePaymentStatus,
    recordedByProfileId: row.recorded_by_profile_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PlatformFinancePaymentsRepository {
  constructor(private readonly organisationId: string) {}

  async listByPayableId(payableId: string): Promise<FinancePaymentView[]> {
    const admin = db();
    const { data, error } = await admin
      .from("finance_payments")
      .select(PAYMENT_SELECT)
      .eq("organisation_id", this.organisationId)
      .eq("payable_id", payableId)
      .order("created_at", { ascending: true });
    if (error) throwDb(error, "Unable to list payable payments.");
    const rows = (data ?? []) as unknown as PaymentRow[];
    if (rows.length === 0) return [];

    const accountIds = [...new Set(rows.map((r) => r.source_financial_account_id))];
    const [{ data: accounts, error: accountError }, { data: transactions, error: transactionError }] =
      await Promise.all([
        admin
          .from("finance_financial_accounts")
          .select("id, name, account_number_last4")
          .eq("organisation_id", this.organisationId)
          .in("id", accountIds),
        admin
          .from("finance_transactions")
          .select("source_id, status, journal_entry_id")
          .eq("organisation_id", this.organisationId)
          .eq("source_type", "payment")
          .in("source_id", rows.map((row) => row.id)),
      ]);
    if (accountError) throwDb(accountError, "Unable to load payment source accounts.");
    if (transactionError) throwDb(transactionError, "Unable to load payment accounting status.");
    const byId = new Map(
      ((accounts ?? []) as Array<{
        id: string;
        name: string;
        account_number_last4: string | null;
      }>).map((a) => [
        a.id,
        {
          name: a.name ?? null,
          last4: a.account_number_last4 ?? null,
        },
      ])
    );
    const accountingByPaymentId = new Map(
      (transactions ?? []).map((transaction) => [
        transaction.source_id as string,
        {
          status: transaction.status as string,
          journalEntryId: transaction.journal_entry_id as string | null,
        },
      ])
    );

    return rows.map((row) => {
      const account = byId.get(row.source_financial_account_id);
      const accounting = accountingByPaymentId.get(row.id);
      return {
        ...mapPayment(row),
        sourceFinancialAccountName: account?.name ?? null,
        sourceFinancialAccountLast4: account?.last4 ?? null,
        accountingStatus:
          accounting?.status === "posted" && accounting.journalEntryId
            ? "posted"
            : "awaiting_accounting",
        journalEntryId: accounting?.journalEntryId ?? null,
      };
    });
  }

  async getById(paymentId: string): Promise<FinancePayment | null> {
    const { data, error } = await db()
      .from("finance_payments")
      .select(PAYMENT_SELECT)
      .eq("organisation_id", this.organisationId)
      .eq("id", paymentId)
      .maybeSingle();
    if (error) throwDb(error, "Unable to load payment.");
    return data ? mapPayment(data as unknown as PaymentRow) : null;
  }

  /** Privileged load of Payable destination crypto for single-payable reveal only. */
  async loadPayableDestinationCrypto(
    payableId: string
  ): Promise<PayableCryptoRow | null> {
    const { data, error } = await db()
      .from("finance_payables")
      .select(
        [
          "id",
          "organisation_id",
          "company_id",
          "status",
          "payment_method",
          "payment_bank_name",
          "payment_account_name",
          "payment_account_number_last4",
          "payment_account_number_ciphertext",
          "payment_account_number_iv",
          "payment_account_number_auth_tag",
          "payment_encryption_key_version",
        ].join(", ")
      )
      .eq("organisation_id", this.organisationId)
      .eq("id", payableId)
      .maybeSingle();
    if (error) throwDb(error, "Unable to load payable destination.");
    return (data as unknown as PayableCryptoRow | null) ?? null;
  }

  async appendDestinationRevealAudit(input: {
    organisationId: string;
    companyId: string;
    actorProfileId: string;
    payableId: string;
    destinationLast4: string | null;
  }): Promise<void> {
    const { error } = await db().from("finance_audit_events").insert({
      organisation_id: input.organisationId,
      company_id: input.companyId,
      actor_profile_id: input.actorProfileId,
      action: "finance.payment.destination_revealed",
      object_type: "finance_payable",
      object_id: input.payableId,
      reason: "Payment destination account number revealed for external disbursement.",
      details: {
        payable_id: input.payableId,
        destination_last4: input.destinationLast4,
      },
    });
    if (error) throwDb(error, "Unable to record destination reveal audit.");
  }
}
