import { NextResponse } from "next/server";
import { gateApiCapability } from "@/lib/access/gateApi";
import { resolveFmCostOrganisation } from "@/modules/finance/server/FmCostServerService";

/**
 * FM Costs & Claims — Monthly Contract Payments (fixed monthly FM fee under the NCC contract). Gated by the
 * SAME finance.view capability as the rest of Costs & Claims — no new Platform Finance capability. Composed
 * here, outside FmCostRepository/FmCostServerService/fmCostRoute (guard preserved). Read-only projection of
 * existing Platform Finance historical commercial facts identified by their own description text (the "2026
 * Monthly Payment" / "Request for Monthly Instalment Payment..." source rows) — no value is copied into FM
 * storage, no HIST code or raw id is exposed.
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
      .map((f) => ({
        month: monthLabel(f.description),
        requestedAmount: f.submittedAmount ?? undefined,
        amountReceived: f.amountReceived ?? undefined,
        currency: f.currency,
        sourcePaymentStatus: f.sourcePaymentStatus ?? undefined,
        paymentDatetime: f.paymentDatetime ?? undefined,
      }))
      .sort((a, b) => (a.month ?? "").localeCompare(b.month ?? ""));

    return NextResponse.json({ success: true, data: monthly }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[finance/monthly-payments]", error);
    return NextResponse.json({ success: false, message: "Unable to load monthly contract payments.", data: [] }, { status: 500 });
  }
}

/** "...Abuja- SEPTEMBER 2026" -> "September 2026". No date invented — text-derived label only. */
function monthLabel(description: string): string | undefined {
  const m = /-\s*([A-Za-z]+)\s+(\d{4})\s*$/.exec(description.trim());
  if (!m) return undefined;
  const month = m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1).toLowerCase();
  return `${month} ${m[2]}`;
}
