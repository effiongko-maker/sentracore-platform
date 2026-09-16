/**
 * Payables transition RPCs.
 *
 * Payable creation is not a transition: approval of the upstream record mints
 * the obligation inside SQL — finance_request_approve /
 * finance_request_partially_approve for Financial Requests, and
 * finance_vendor_bill_approve / finance_vendor_bill_partially_approve for
 * Vendor Bills. There is never a client follow-up call to create a payable.
 */

import { createAdminClient } from "@/utils/supabase/admin";
import type { FinancePayablePayeeType } from "@/modules/platform-finance/domain/payables";

async function callUuidRpc(
  fn: string,
  args: Record<string, unknown>,
  fallbackMessage: string
): Promise<string> {
  const { data, error } = await createAdminClient().rpc(fn, args);
  if (error) {
    throw new Error(error.message || fallbackMessage);
  }
  if (typeof data !== "string" || !data) {
    throw new Error(fallbackMessage);
  }
  return data;
}

export type CreateFinancePayableRpcInput = {
  actorProfileId: string;
  companyId: string;
  payeeName: string;
  payeeType: FinancePayablePayeeType;
  payableAmount: number;
  sourceType: "financial_request" | "vendor_bill";
  sourceId: string;
  currency?: string;
  description?: string | null;
  dueDate?: string | null;
  projectContractRef?: string | null;
  periodId?: string | null;
};

/**
 * Retained bypass guard. The underlying finance_payable_create RPC always
 * raises now — a Payable cannot be minted outside an approval path. Kept so
 * that any stray caller surfaces a clear error instead of silently working.
 */
export async function rpcCreateFinancePayable(
  input: CreateFinancePayableRpcInput
): Promise<string> {
  return callUuidRpc(
    "finance_payable_create",
    {
      p_actor_profile_id: input.actorProfileId,
      p_company_id: input.companyId,
      p_payee_name: input.payeeName,
      p_payee_type: input.payeeType,
      p_payable_amount: input.payableAmount,
      p_source_type: input.sourceType,
      p_source_id: input.sourceId,
      p_currency: input.currency ?? "NGN",
      p_description: input.description ?? null,
      p_due_date: input.dueDate ?? null,
      p_project_contract_ref: input.projectContractRef ?? null,
      p_period_id: input.periodId ?? null,
    },
    "Failed to create finance payable."
  );
}

export type UpdateFinancePayableDraftRpcInput = {
  actorProfileId: string;
  payableId: string;
  payeeName?: string | null;
  payeeType?: FinancePayablePayeeType | null;
  payableAmount?: number | null;
  description?: string | null;
  dueDate?: string | null;
  clearDueDate?: boolean;
  projectContractRef?: string | null;
  currency?: string | null;
};

export async function rpcUpdateFinancePayableDraft(
  input: UpdateFinancePayableDraftRpcInput
): Promise<string> {
  return callUuidRpc(
    "finance_payable_update_draft",
    {
      p_actor_profile_id: input.actorProfileId,
      p_payable_id: input.payableId,
      p_payee_name: input.payeeName ?? null,
      p_payee_type: input.payeeType ?? null,
      p_payable_amount: input.payableAmount ?? null,
      p_description: input.description ?? null,
      p_due_date: input.dueDate ?? null,
      p_clear_due_date: input.clearDueDate ?? false,
      p_project_contract_ref: input.projectContractRef ?? null,
      p_currency: input.currency ?? null,
    },
    "Failed to update draft finance payable."
  );
}

export async function rpcSubmitFinancePayable(
  actorProfileId: string,
  payableId: string
): Promise<string> {
  return callUuidRpc(
    "finance_payable_submit",
    { p_actor_profile_id: actorProfileId, p_payable_id: payableId },
    "Failed to submit finance payable."
  );
}

export async function rpcStartFinancePayableReview(
  actorProfileId: string,
  payableId: string
): Promise<string> {
  return callUuidRpc(
    "finance_payable_start_review",
    { p_actor_profile_id: actorProfileId, p_payable_id: payableId },
    "Failed to start finance payable review."
  );
}

export async function rpcApproveFinancePayable(
  actorProfileId: string,
  payableId: string,
  decisionNotes?: string | null
): Promise<string> {
  return callUuidRpc(
    "finance_payable_approve",
    {
      p_actor_profile_id: actorProfileId,
      p_payable_id: payableId,
      p_decision_notes: decisionNotes ?? null,
    },
    "Failed to approve finance payable."
  );
}

export async function rpcPartiallyApproveFinancePayable(
  actorProfileId: string,
  payableId: string,
  approvedAmount: number,
  decisionNotes?: string | null
): Promise<string> {
  return callUuidRpc(
    "finance_payable_partially_approve",
    {
      p_actor_profile_id: actorProfileId,
      p_payable_id: payableId,
      p_approved_amount: approvedAmount,
      p_decision_notes: decisionNotes ?? null,
    },
    "Failed to partially approve finance payable."
  );
}

export async function rpcRejectFinancePayable(
  actorProfileId: string,
  payableId: string,
  reason: string
): Promise<string> {
  return callUuidRpc(
    "finance_payable_reject",
    {
      p_actor_profile_id: actorProfileId,
      p_payable_id: payableId,
      p_reason: reason,
    },
    "Failed to reject finance payable."
  );
}

export async function rpcQueryFinancePayable(
  actorProfileId: string,
  payableId: string,
  reason: string
): Promise<string> {
  return callUuidRpc(
    "finance_payable_query",
    {
      p_actor_profile_id: actorProfileId,
      p_payable_id: payableId,
      p_reason: reason,
    },
    "Failed to query finance payable."
  );
}

export async function rpcCancelFinancePayable(
  actorProfileId: string,
  payableId: string,
  reason?: string | null
): Promise<string> {
  return callUuidRpc(
    "finance_payable_cancel",
    {
      p_actor_profile_id: actorProfileId,
      p_payable_id: payableId,
      p_reason: reason ?? null,
    },
    "Failed to cancel finance payable."
  );
}
