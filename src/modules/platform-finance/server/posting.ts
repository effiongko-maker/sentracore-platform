import { createAdminClient } from "@/utils/supabase/admin";
import { assertValidPostingLines } from "@/modules/platform-finance/domain/invariants";
import type { FinancePostingLineInput } from "@/modules/platform-finance/types";

export type PostTransactionParams = {
  transactionId: string;
  actorProfileId: string;
  lines: FinancePostingLineInput[];
  periodId?: string | null;
  reason?: string | null;
};

/**
 * Wraps Postgres RPC `finance_post_transaction` for atomic posting.
 */
export async function postFinanceTransaction(
  params: PostTransactionParams
): Promise<string> {
  assertValidPostingLines(
    params.lines.map((line) => ({
      accountId: line.accountId,
      debit: line.debit,
      credit: line.credit,
    }))
  );

  const payload = params.lines.map((line) => ({
    account_id: line.accountId,
    debit: line.debit,
    credit: line.credit,
    description: line.description ?? null,
  }));

  const { data, error } = await createAdminClient().rpc(
    "finance_post_transaction",
    {
      p_transaction_id: params.transactionId,
      p_actor_profile_id: params.actorProfileId,
      p_lines: payload,
      p_period_id: params.periodId ?? null,
      p_reason: params.reason ?? null,
    }
  );

  if (error) {
    throw new Error(error.message || "Failed to post finance transaction.");
  }
  if (!data || typeof data !== "string") {
    throw new Error("Posting RPC did not return a journal entry id.");
  }
  return data;
}

export type ClosePeriodParams = {
  periodId: string;
  actorProfileId: string;
  reason?: string | null;
};

export async function closeFinancePeriod(
  params: ClosePeriodParams
): Promise<string> {
  const { data, error } = await createAdminClient().rpc("finance_close_period", {
    p_period_id: params.periodId,
    p_actor_profile_id: params.actorProfileId,
    p_reason: params.reason ?? null,
  });

  if (error) {
    throw new Error(error.message || "Failed to close finance period.");
  }
  if (!data || typeof data !== "string") {
    throw new Error("Close period RPC did not return a period id.");
  }
  return data;
}
