import { createAdminClient } from "@/utils/supabase/admin";

export async function rpcConfirmFinancePaymentAgainstPayable(input: {
  actorProfileId: string;
  payableId: string;
  sourceFinancialAccountId: string;
  amount: number;
  paymentDate: string;
  externalReference?: string | null;
}): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc(
    "finance_payment_confirm_against_payable",
    {
      p_actor_profile_id: input.actorProfileId,
      p_payable_id: input.payableId,
      p_source_financial_account_id: input.sourceFinancialAccountId,
      p_amount: input.amount,
      p_payment_date: input.paymentDate,
      p_external_reference: input.externalReference ?? null,
    }
  );
  if (error) throw error;
  if (typeof data !== "string" || !data) {
    throw new Error("finance_payment_confirm_against_payable: missing payment id");
  }
  return data;
}
