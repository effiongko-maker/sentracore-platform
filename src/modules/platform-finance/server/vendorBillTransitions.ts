/**
 * Vendor Bill transition RPC wrappers.
 *
 * Every lifecycle write goes through a named SECURITY DEFINER RPC — there is no
 * generic status mutation. CEO approval creates the Payable inside
 * finance_vendor_bill_approve / finance_vendor_bill_partially_approve (SQL), so
 * there is never a client follow-up call to create a payable.
 */

import { createAdminClient } from "@/utils/supabase/admin";
import type { FinanceVendorBillPayeeType } from "@/modules/platform-finance/domain/vendorBills";

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

export type CreateFinanceVendorBillRpcInput = {
  actorProfileId: string;
  organisationId: string;
  companyId: string;
  billedAmount: number;
  purpose: string;
  payeeName: string;
  payeeType: FinanceVendorBillPayeeType;
  description?: string | null;
  invoiceReference?: string | null;
  invoiceDate?: string | null;
  goodsServicesReceived?: boolean;
  dueDate?: string | null;
  projectContractRef?: string | null;
  currency?: string;
};

export async function rpcCreateFinanceVendorBill(
  input: CreateFinanceVendorBillRpcInput
): Promise<string> {
  return callUuidRpc(
    "finance_vendor_bill_create",
    {
      p_actor_profile_id: input.actorProfileId,
      p_organisation_id: input.organisationId,
      p_company_id: input.companyId,
      p_billed_amount: input.billedAmount,
      p_purpose: input.purpose,
      p_payee_name: input.payeeName,
      p_payee_type: input.payeeType,
      p_description: input.description ?? null,
      p_invoice_reference: input.invoiceReference ?? null,
      p_invoice_date: input.invoiceDate ?? null,
      p_goods_services_received: input.goodsServicesReceived ?? false,
      p_due_date: input.dueDate ?? null,
      p_project_contract_ref: input.projectContractRef ?? null,
      p_currency: input.currency ?? "NGN",
    },
    "Failed to create vendor bill."
  );
}

export type UpdateFinanceVendorBillDraftRpcInput = {
  actorProfileId: string;
  vendorBillId: string;
  billedAmount?: number | null;
  purpose?: string | null;
  payeeName?: string | null;
  payeeType?: FinanceVendorBillPayeeType | null;
  description?: string | null;
  invoiceReference?: string | null;
  invoiceDate?: string | null;
  clearInvoiceDate?: boolean;
  goodsServicesReceived?: boolean | null;
  dueDate?: string | null;
  clearDueDate?: boolean;
  projectContractRef?: string | null;
  currency?: string | null;
};

export async function rpcUpdateFinanceVendorBillDraft(
  input: UpdateFinanceVendorBillDraftRpcInput
): Promise<string> {
  return callUuidRpc(
    "finance_vendor_bill_update_draft",
    {
      p_actor_profile_id: input.actorProfileId,
      p_vendor_bill_id: input.vendorBillId,
      p_billed_amount: input.billedAmount ?? null,
      p_purpose: input.purpose ?? null,
      p_payee_name: input.payeeName ?? null,
      p_payee_type: input.payeeType ?? null,
      p_description: input.description ?? null,
      p_invoice_reference: input.invoiceReference ?? null,
      p_invoice_date: input.invoiceDate ?? null,
      p_clear_invoice_date: input.clearInvoiceDate ?? false,
      p_goods_services_received: input.goodsServicesReceived ?? null,
      p_due_date: input.dueDate ?? null,
      p_clear_due_date: input.clearDueDate ?? false,
      p_project_contract_ref: input.projectContractRef ?? null,
      p_currency: input.currency ?? null,
    },
    "Failed to update draft vendor bill."
  );
}

export async function rpcSubmitFinanceVendorBill(
  actorProfileId: string,
  vendorBillId: string
): Promise<string> {
  return callUuidRpc(
    "finance_vendor_bill_submit",
    { p_actor_profile_id: actorProfileId, p_vendor_bill_id: vendorBillId },
    "Failed to submit vendor bill."
  );
}

export async function rpcStartFinanceVendorBillReview(
  actorProfileId: string,
  vendorBillId: string
): Promise<string> {
  return callUuidRpc(
    "finance_vendor_bill_start_review",
    { p_actor_profile_id: actorProfileId, p_vendor_bill_id: vendorBillId },
    "Failed to start vendor bill review."
  );
}

/** Finance queries UNDER_REVIEW; CEO queries PENDING_CEO_APPROVAL. */
export async function rpcQueryFinanceVendorBill(
  actorProfileId: string,
  vendorBillId: string,
  reason: string,
  actorRole: "finance" | "ceo"
): Promise<string> {
  return callUuidRpc(
    "finance_vendor_bill_query",
    {
      p_actor_profile_id: actorProfileId,
      p_vendor_bill_id: vendorBillId,
      p_reason: reason,
      p_actor_role: actorRole,
    },
    "Failed to query vendor bill."
  );
}

export type ResubmitFinanceVendorBillRpcInput = {
  actorProfileId: string;
  vendorBillId: string;
  billedAmount?: number | null;
  purpose?: string | null;
  payeeName?: string | null;
  payeeType?: FinanceVendorBillPayeeType | null;
  description?: string | null;
  invoiceReference?: string | null;
  invoiceDate?: string | null;
  clearInvoiceDate?: boolean;
  goodsServicesReceived?: boolean | null;
  dueDate?: string | null;
  clearDueDate?: boolean;
  projectContractRef?: string | null;
};

export async function rpcResubmitFinanceVendorBill(
  input: ResubmitFinanceVendorBillRpcInput
): Promise<string> {
  return callUuidRpc(
    "finance_vendor_bill_resubmit",
    {
      p_actor_profile_id: input.actorProfileId,
      p_vendor_bill_id: input.vendorBillId,
      p_billed_amount: input.billedAmount ?? null,
      p_purpose: input.purpose ?? null,
      p_payee_name: input.payeeName ?? null,
      p_payee_type: input.payeeType ?? null,
      p_description: input.description ?? null,
      p_invoice_reference: input.invoiceReference ?? null,
      p_invoice_date: input.invoiceDate ?? null,
      p_clear_invoice_date: input.clearInvoiceDate ?? false,
      p_goods_services_received: input.goodsServicesReceived ?? null,
      p_due_date: input.dueDate ?? null,
      p_clear_due_date: input.clearDueDate ?? false,
      p_project_contract_ref: input.projectContractRef ?? null,
    },
    "Failed to resubmit vendor bill."
  );
}

export async function rpcSendFinanceVendorBillToCeo(
  actorProfileId: string,
  vendorBillId: string,
  financeNotes?: string | null
): Promise<string> {
  return callUuidRpc(
    "finance_vendor_bill_send_to_ceo",
    {
      p_actor_profile_id: actorProfileId,
      p_vendor_bill_id: vendorBillId,
      p_finance_notes: financeNotes ?? null,
    },
    "Failed to send vendor bill to CEO."
  );
}

/** CEO authority — creates the vendor_bill Payable atomically in SQL. */
export async function rpcApproveFinanceVendorBill(
  actorProfileId: string,
  vendorBillId: string,
  decisionNotes?: string | null
): Promise<string> {
  return callUuidRpc(
    "finance_vendor_bill_approve",
    {
      p_actor_profile_id: actorProfileId,
      p_vendor_bill_id: vendorBillId,
      p_decision_notes: decisionNotes ?? null,
    },
    "Failed to approve vendor bill."
  );
}

export async function rpcPartiallyApproveFinanceVendorBill(
  actorProfileId: string,
  vendorBillId: string,
  approvedAmount: number,
  decisionNotes?: string | null
): Promise<string> {
  return callUuidRpc(
    "finance_vendor_bill_partially_approve",
    {
      p_actor_profile_id: actorProfileId,
      p_vendor_bill_id: vendorBillId,
      p_approved_amount: approvedAmount,
      p_decision_notes: decisionNotes ?? null,
    },
    "Failed to partially approve vendor bill."
  );
}

/** Rejection is terminal and creates no Payable. */
export async function rpcRejectFinanceVendorBill(
  actorProfileId: string,
  vendorBillId: string,
  reason: string
): Promise<string> {
  return callUuidRpc(
    "finance_vendor_bill_reject",
    {
      p_actor_profile_id: actorProfileId,
      p_vendor_bill_id: vendorBillId,
      p_reason: reason,
    },
    "Failed to reject vendor bill."
  );
}
