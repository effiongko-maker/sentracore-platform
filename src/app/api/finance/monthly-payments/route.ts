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
      .sort((a, b) => (a.month ?? "").localeCompare(b.month ?? ""));

    return NextResponse.json({ success: true, data: monthly }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[finance/monthly-payments]", error);
    return NextResponse.json({ success: false, message: "Unable to load monthly contract payments.", data: [] }, { status: 500 });
  }
}
