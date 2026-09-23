import { NextResponse } from "next/server";
import { gateApiCapability } from "@/lib/access/gateApi";
import { resolveFmCostOrganisation } from "@/modules/finance/server/FmCostServerService";
import {
  deriveMonthlyPaymentStatus,
  monthlyPaymentPeriodLabel,
  monthlyPaymentSlug,
} from "@/modules/finance/utils/monthlyContractPayments";

/**
 * FM Costs & Claims — Monthly Contract Payments (fixed monthly FM fee under the NCC contract). Gated by the
 * SAME finance.view capability as the rest of Costs & Claims — no new Platform Finance capability. Composed
 * here, outside FmCostRepository/FmCostServerService/fmCostRoute (guard preserved). Read-only projection of
 * existing Platform Finance historical commercial facts identified by their own description text (the "2026
 * Monthly Payment" / "Request for Monthly Instalment Payment..." source rows) — no value is copied into FM
 * storage, no HIST code or raw id is exposed. `slug`/`status` are pure presentation derivations of already-
 * exposed fields (the month label and the source's own status text) — never a new identifier or workflow state.
 */
export async function POST() {
  const gate = await gateApiCapability("finance.view");
  if (!gate.ok) return gate.response;

  try {
    const { organisationId } = resolveFmCostOrganisation(gate.session);
    const { PlatformFinanceHistoricalFactsRepository } = await import(
      "@/modules/platform-finance/server/PlatformFinanceHistoricalFactsRepository"
    );
    const facts = await new PlatformFinanceHistoricalFactsRepository(organisationId).list();
    // "Facility Management and Maintenance Works" is the fixed monthly FM fee under the NCC contract — distinct
    // from the separate CRECHE management contract's own monthly instalments, which also match "Monthly
    // Instalment Payment" but are a different commercial matter and must not be conflated here.
    const monthly = facts
      .filter((f) => /Monthly Instalment Payment/i.test(f.description) && /Facility Management and Maintenance Works/i.test(f.description))
      .map((f) => {
        const month = monthlyPaymentPeriodLabel(f.description);
        return {
          factId: f.id,
          month,
          slug: monthlyPaymentSlug(month),
          requestedAmount: f.submittedAmount ?? undefined,
          amountReceived: f.amountReceived ?? undefined,
          currency: f.currency,
          // Raw source text, kept for the detail view's full transparency — never hidden, only relabelled below.
          sourcePaymentStatus: f.sourcePaymentStatus ?? undefined,
          status: deriveMonthlyPaymentStatus(f.sourcePaymentStatus),
          // No submission/request date exists in the source schema — never inferred from created_at (import
          // time) or any other field. Always undefined today; kept as an explicit key so the register/detail
          // surfaces render an honest "Not recorded" rather than omitting the concept entirely.
          submissionDate: undefined,
          paymentDatetime: f.paymentDatetime ?? undefined,
          commercialReference: f.commercialReference ?? undefined,
        };
      })
      // Chronological ascending by the "YYYY-MM" slug (not the alphabetical month label); unparseable periods last.
      .sort((a, b) => (a.slug ?? "9999-99").localeCompare(b.slug ?? "9999-99"));

    // Live client receivable (Platform Finance) that references the same historical fact, when one exists. Its open
    // balance is derived from receipt allocations (off-ledger receivables settle on confirmed receipts). Ids stay
    // server-side — only the derived state and outstanding amount are exposed.
    const { createAdminClient } = await import("@/utils/supabase/admin");
    const admin = createAdminClient();
    const factIds = monthly.map((m) => m.factId);
    const { data: receivables, error: recvError } = factIds.length
      ? await admin
          .from("finance_receivables")
          .select("id,historical_fact_id,original_amount,currency")
          .eq("organisation_id", organisationId)
          .in("historical_fact_id", factIds)
      : { data: [], error: null };
    if (recvError) throw recvError;
    const settledById = new Map<string, number>();
    const recvIds = (receivables ?? []).map((r) => String(r.id));
    if (recvIds.length) {
      const { data: allocations, error: allocError } = await admin
        .from("finance_receipt_allocations")
        .select("receivable_id,amount,finance_receipts!inner(status)")
        .in("receivable_id", recvIds)
        .in("finance_receipts.status", ["confirmed", "posted"]);
      if (allocError) throw allocError;
      for (const a of allocations ?? []) {
        settledById.set(String(a.receivable_id), (settledById.get(String(a.receivable_id)) ?? 0) + Number(a.amount));
      }
    }
    const receivableByFact = new Map(
      (receivables ?? []).map((r) => {
        const original = Number(r.original_amount);
        const settled = settledById.get(String(r.id)) ?? 0;
        const outstandingAmount = Math.max(0, Math.round((original - settled) * 100) / 100);
        const state = outstandingAmount === 0 ? "settled" : settled > 0 ? "partially_settled" : "open";
        return [String(r.historical_fact_id), { state, outstandingAmount, currency: String(r.currency) }] as const;
      })
    );
    const data = monthly.map(({ factId, ...row }) => ({ ...row, clientReceivable: receivableByFact.get(factId) }));

    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[finance/monthly-payments]", error);
    return NextResponse.json({ success: false, message: "Unable to load monthly contract payments.", data: [] }, { status: 500 });
  }
}
