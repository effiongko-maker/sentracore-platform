/**
 * Platform Finance verification — payable / vendor bill fixture seeding.
 *
 * `public.finance_payable_create` is a disabled bypass guard: payables now
 * exist only as the product of an approval decision (finance_request_approve /
 * finance_request_partially_approve for financial_request sources,
 * finance_vendor_bill_approve / finance_vendor_bill_partially_approve for
 * vendor_bill sources). Verify suites that need a payable in a *given* state
 * without replaying a whole approval chain therefore seed the row directly on
 * the owner connection inside the rolled-back verify transaction.
 *
 * These helpers only write fixture rows. They never relax integrity controls:
 * every constraint, the align-org trigger, and finance_payables_validate_source
 * all still run, and the 'created' event is appended through the production
 * helper so event-shape assertions stay meaningful.
 */
import type { FinanceVerifyClient } from "./platform-finance-verify-transaction";

export type VerifyPayableFixture = {
  actorProfileId: string;
  companyId: string;
  payableAmount: number;
  sourceType: "financial_request" | "vendor_bill";
  sourceId: string;
  payeeName?: string;
  payeeType?: "vendor" | "staff" | "other";
  currency?: string;
  description?: string | null;
  dueDate?: string | null;
  projectContractRef?: string | null;
  periodId?: string | null;
  status?: string;
};

/** Seeds one finance_payables row + its 'created' event. Returns the payable id. */
export async function insertVerifyPayable(
  client: FinanceVerifyClient,
  fixture: VerifyPayableFixture
): Promise<string> {
  const inserted = await client.query(
    `insert into public.finance_payables (
       company_id, created_by_profile_id, status, currency,
       payable_amount, paid_amount, payee_name, payee_type,
       description, due_date, source_type, source_id,
       project_contract_ref, period_id
     ) values (
       $1, $2, $3, $4,
       $5, 0, $6, $7,
       $8, $9, $10, $11,
       $12, $13
     ) returning id, organisation_id`,
    [
      fixture.companyId,
      fixture.actorProfileId,
      fixture.status ?? "draft",
      fixture.currency ?? "NGN",
      fixture.payableAmount,
      fixture.payeeName ?? "Verify Payee",
      fixture.payeeType ?? "vendor",
      fixture.description ?? null,
      fixture.dueDate ?? null,
      fixture.sourceType,
      fixture.sourceId,
      fixture.projectContractRef ?? null,
      fixture.periodId ?? null,
    ]
  );

  const row = inserted.rows[0] as { id: string; organisation_id: string };

  await client.query(
    `select public.finance_payable_append_event(
       $1::uuid, $2::uuid, $3::uuid, 'created', null, $4::text,
       jsonb_build_object(
         'source_type', $5::text,
         'source_id', $6::uuid,
         'payable_amount', $7::numeric
       )
     )`,
    [
      row.organisation_id,
      row.id,
      fixture.actorProfileId,
      fixture.status ?? "draft",
      fixture.sourceType,
      fixture.sourceId,
      fixture.payableAmount,
    ]
  );

  return row.id;
}

export type VerifyVendorBillFixture = {
  companyId: string;
  inputterProfileId: string;
  billedAmount: number;
  status?: string;
  approvedAmount?: number;
  payeeName?: string;
  payeeType?: "vendor" | "staff" | "other";
  currency?: string;
  purpose?: string;
  goodsServicesReceived?: boolean;
  invoiceReference?: string | null;
};

/**
 * Seeds one finance_vendor_bills row. Needed because
 * finance_payables_validate_source now requires a real vendor bill behind any
 * payable with source_type = 'vendor_bill'.
 */
export async function insertVerifyVendorBill(
  client: FinanceVerifyClient,
  fixture: VerifyVendorBillFixture
): Promise<string> {
  const inserted = await client.query(
    `insert into public.finance_vendor_bills (
       company_id, inputter_profile_id, status, currency,
       billed_amount, approved_amount, payee_name, payee_type,
       purpose, goods_services_received, invoice_reference
     ) values (
       $1, $2, $3, $4,
       $5, $6, $7, $8,
       $9, $10, $11
     ) returning id`,
    [
      fixture.companyId,
      fixture.inputterProfileId,
      fixture.status ?? "draft",
      fixture.currency ?? "NGN",
      fixture.billedAmount,
      fixture.approvedAmount ?? 0,
      fixture.payeeName ?? "Verify Payee",
      fixture.payeeType ?? "vendor",
      fixture.purpose ?? "Verify vendor bill fixture",
      fixture.goodsServicesReceived ?? true,
      fixture.invoiceReference ?? null,
    ]
  );

  return (inserted.rows[0] as { id: string }).id;
}
