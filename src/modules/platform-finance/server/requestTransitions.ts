/**
 * Thin wrappers for Financial Request Slice 2 SECURITY DEFINER RPCs.
 * Call via createAdminClient after requirePlatformFinanceAccess (Foundation pattern).
 */
import { createAdminClient } from "@/utils/supabase/admin";
import type { FinancialRequestPayeeType } from "@/modules/platform-finance/domain/requests";
import type { EncryptedPaymentDestination } from "@/modules/platform-finance/server/paymentDestinationCrypto";

function throwRpc(
  error: { message?: string } | null,
  fallback: string
): never {
  throw new Error(error?.message?.trim() || fallback);
}

async function callUuidRpc(
  name: string,
  args: Record<string, unknown>,
  fallback: string
): Promise<string> {
  const { data, error } = await createAdminClient().rpc(name, args);
  if (error) throwRpc(error, fallback);
  if (!data || typeof data !== "string") {
    throw new Error(`${fallback} (RPC did not return request id)`);
  }
  return data;
}

export type CreateFinancialRequestRpcInput = {
  actorProfileId: string;
  organisationId: string;
  companyId: string;
  categoryId: string;
  requestedAmount: number;
  purpose: string;
  description?: string | null;
  payeeName: string;
  payeeType: FinancialRequestPayeeType;
  requiredByDate?: string | null;
  externalReference?: string | null;
  projectContractRef?: string | null;
  currency?: string;
  encryptedPaymentDestination?: EncryptedPaymentDestination | null;
};

export async function rpcCreateFinancialRequest(
  input: CreateFinancialRequestRpcInput
): Promise<string> {
  return callUuidRpc(
    "finance_request_create_with_payment_destination",
    {
      p_actor_profile_id: input.actorProfileId,
      p_organisation_id: input.organisationId,
      p_company_id: input.companyId,
      p_category_id: input.categoryId,
      p_requested_amount: input.requestedAmount,
      p_purpose: input.purpose,
      p_description: input.description ?? null,
      p_payee_name: input.payeeName,
      p_payee_type: input.payeeType,
      p_required_by_date: input.requiredByDate ?? null,
      p_external_reference: input.externalReference ?? null,
      p_project_contract_ref: input.projectContractRef ?? null,
      p_currency: input.currency ?? "NGN",
      p_destination: input.encryptedPaymentDestination ?? null,
    },
    "Failed to create financial request."
  );
}

export type UpdateDraftFinancialRequestRpcInput = {
  actorProfileId: string;
  requestId: string;
  categoryId?: string | null;
  requestedAmount?: number | null;
  purpose?: string | null;
  description?: string | null;
  payeeName?: string | null;
  payeeType?: FinancialRequestPayeeType | null;
  requiredByDate?: string | null;
  clearRequiredByDate?: boolean;
  externalReference?: string | null;
  projectContractRef?: string | null;
  paymentDestinationAction?: "preserve" | "replace" | "remove";
  encryptedPaymentDestination?: EncryptedPaymentDestination | null;
};

export async function rpcUpdateDraftFinancialRequest(
  input: UpdateDraftFinancialRequestRpcInput
): Promise<string> {
  return callUuidRpc(
    "finance_request_update_draft_with_payment_destination",
    {
      p_actor_profile_id: input.actorProfileId,
      p_request_id: input.requestId,
      p_category_id: input.categoryId ?? null,
      p_requested_amount: input.requestedAmount ?? null,
      p_purpose: input.purpose ?? null,
      p_description: input.description ?? null,
      p_payee_name: input.payeeName ?? null,
      p_payee_type: input.payeeType ?? null,
      p_required_by_date: input.requiredByDate ?? null,
      p_clear_required_by_date: input.clearRequiredByDate ?? false,
      p_external_reference: input.externalReference ?? null,
      p_project_contract_ref: input.projectContractRef ?? null,
      p_destination_action: input.paymentDestinationAction ?? "preserve",
      p_destination: input.encryptedPaymentDestination ?? null,
    },
    "Failed to update draft financial request."
  );
}

export async function rpcSubmitFinancialRequest(input: {
  actorProfileId: string;
  requestId: string;
}): Promise<string> {
  return callUuidRpc(
    "finance_request_submit",
    {
      p_actor_profile_id: input.actorProfileId,
      p_request_id: input.requestId,
    },
    "Failed to submit financial request."
  );
}

export async function rpcStartFinancialRequestReview(input: {
  actorProfileId: string;
  requestId: string;
}): Promise<string> {
  return callUuidRpc(
    "finance_request_start_review",
    {
      p_actor_profile_id: input.actorProfileId,
      p_request_id: input.requestId,
    },
    "Failed to start financial request review."
  );
}

export async function rpcQueryFinancialRequest(input: {
  actorProfileId: string;
  requestId: string;
  reason: string;
  actorRole: "finance" | "ceo";
}): Promise<string> {
  return callUuidRpc(
    "finance_request_query",
    {
      p_actor_profile_id: input.actorProfileId,
      p_request_id: input.requestId,
      p_reason: input.reason,
      p_actor_role: input.actorRole,
    },
    "Failed to query financial request."
  );
}

export type ResubmitFinancialRequestRpcInput =
  UpdateDraftFinancialRequestRpcInput;

export async function rpcResubmitFinancialRequest(
  input: ResubmitFinancialRequestRpcInput
): Promise<string> {
  return callUuidRpc(
    "finance_request_resubmit_with_payment_destination",
    {
      p_actor_profile_id: input.actorProfileId,
      p_request_id: input.requestId,
      p_category_id: input.categoryId ?? null,
      p_requested_amount: input.requestedAmount ?? null,
      p_purpose: input.purpose ?? null,
      p_description: input.description ?? null,
      p_payee_name: input.payeeName ?? null,
      p_payee_type: input.payeeType ?? null,
      p_required_by_date: input.requiredByDate ?? null,
      p_clear_required_by_date: input.clearRequiredByDate ?? false,
      p_external_reference: input.externalReference ?? null,
      p_project_contract_ref: input.projectContractRef ?? null,
      p_destination_action: input.paymentDestinationAction ?? "preserve",
      p_destination: input.encryptedPaymentDestination ?? null,
    },
    "Failed to resubmit financial request."
  );
}

export async function rpcSendFinancialRequestToCeo(input: {
  actorProfileId: string;
  requestId: string;
  financeNotes?: string | null;
}): Promise<string> {
  return callUuidRpc(
    "finance_request_send_to_ceo",
    {
      p_actor_profile_id: input.actorProfileId,
      p_request_id: input.requestId,
      p_finance_notes: input.financeNotes ?? null,
    },
    "Failed to send financial request to CEO."
  );
}

export async function rpcApproveFinancialRequest(input: {
  actorProfileId: string;
  requestId: string;
  decisionNotes?: string | null;
}): Promise<string> {
  return callUuidRpc(
    "finance_request_approve",
    {
      p_actor_profile_id: input.actorProfileId,
      p_request_id: input.requestId,
      p_decision_notes: input.decisionNotes ?? null,
    },
    "Failed to approve financial request."
  );
}

export async function rpcPartiallyApproveFinancialRequest(input: {
  actorProfileId: string;
  requestId: string;
  approvedAmount: number;
  decisionNotes?: string | null;
}): Promise<string> {
  return callUuidRpc(
    "finance_request_partially_approve",
    {
      p_actor_profile_id: input.actorProfileId,
      p_request_id: input.requestId,
      p_approved_amount: input.approvedAmount,
      p_decision_notes: input.decisionNotes ?? null,
    },
    "Failed to partially approve financial request."
  );
}

export async function rpcRejectFinancialRequest(input: {
  actorProfileId: string;
  requestId: string;
  reason: string;
}): Promise<string> {
  return callUuidRpc(
    "finance_request_reject",
    {
      p_actor_profile_id: input.actorProfileId,
      p_request_id: input.requestId,
      p_reason: input.reason,
    },
    "Failed to reject financial request."
  );
}
