import { NextResponse } from "next/server";
import { gateApiCapability } from "@/lib/access/gateApi";
import { scopeAllowsFmWide } from "@/lib/access/facilityScope";
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
      // Chronological ascending by the "YYYY-MM" slug (not the alphabetical month label); unparseable periods last.
      .sort((a, b) => (a.slug ?? "9999-99").localeCompare(b.slug ?? "9999-99"));

    // Client Payments (FM) are the live operational source for contract instalments. A live contract_instalment
    // corresponds to a monthly entry when it is for the SAME contract (same FM-fee description rule as above) and
    // states the SAME period label. Its receipt state is derived from FM receipts — never stored, never a second
    // independent obligation. The historical entry itself is unchanged.
    const { createAdminClient } = await import("@/utils/supabase/admin");
    const admin = createAdminClient();
    const { data: instalments, error: instError } = await admin
      .from("fm_cost_submissions")
      .select("id,code,status,claim_amount,currency,period_label,description,facility_id")
      .eq("organisation_id", organisationId)
      .eq("submission_kind", "contract_instalment")
      .in("status", ["submitted", "queried"]);
    if (instError) throw instError;
    // Client Payments are FM-wide: one with no facility shows in every authorised facility context; one with a facility
    // obeys facility scope.
    const fmFee = (instalments ?? []).filter(
      (s) => scopeAllowsFmWide(gate.access.fmFacilityScope, s.facility_id as string | null) && /Monthly Instalment Payment/i.test(String(s.description ?? "")) && /Facility Management and Maintenance Works/i.test(String(s.description ?? "")) && s.period_label
    );
    const receivedById = new Map<string, number>();
    if (fmFee.length) {
      const { data: receipts, error: rcptError } = await admin
        .from("fm_reimbursement_payments")
        .select("submission_id,received_amount")
        .eq("organisation_id", organisationId)
        .in("submission_id", fmFee.map((s) => String(s.id)));
      if (rcptError) throw rcptError;
      for (const r of receipts ?? []) {
        receivedById.set(String(r.submission_id), (receivedById.get(String(r.submission_id)) ?? 0) + Number(r.received_amount));
      }
    }
    const byPeriod = new Map<string, typeof fmFee>();
    for (const s of fmFee) byPeriod.set(String(s.period_label), [...(byPeriod.get(String(s.period_label)) ?? []), s]);
    const clientPaymentFor = (month: string | undefined) => {
      const matches = month ? byPeriod.get(month) ?? [] : [];
      if (matches.length !== 1) return undefined; // none, or ambiguous — never guess which applies
      const s = matches[0]!;
      const requested = Number(s.claim_amount ?? 0);
      const received = receivedById.get(String(s.id)) ?? 0;
      const outstandingAmount = Math.max(0, Math.round((requested - received) * 100) / 100);
      const state = received <= 0 ? "awaiting_receipt" : outstandingAmount > 0 ? "partially_received" : "received";
      return { code: String(s.code), state, outstandingAmount, currency: String(s.currency) } as const;
    };
    const data = monthly.map((row) => ({ ...row, clientPayment: clientPaymentFor(row.month) }));

    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[finance/monthly-payments]", error);
    return NextResponse.json({ success: false, message: "Unable to load monthly contract payments.", data: [] }, { status: 500 });
  }
}
