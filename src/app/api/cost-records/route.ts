import { NextResponse } from "next/server";
import { handleFmCostRoute } from "@/modules/finance/server/fmCostRoute";

/**
 * FM Cost Records (operational, not Platform Finance) persistence is Supabase. Compatibility route: /api/cost-records.
 * No Apps Script call. Reads: finance.view. Writes: finance.create.
 *
 * The one cross-domain composition below (an operationally useful, read-only "Commercial Position" for a Cost
 * Record whose Work has a CERTAIN linked Platform Finance historical commercial fact) is deliberately kept
 * HERE, outside FmCostRepository / FmCostServerService / fmCostRoute — those files must stay free of any
 * Platform Finance coupling (enforced by scripts/verify-fm-costs-foundation.mts). It only runs for a
 * single-record read (getById), never the list, gated by the SAME finance.view capability the read already
 * required — no separate Platform Finance capability is granted or checked, matching the authority boundary
 * this composition already operated under before this change. It composes facts without copying ownership:
 * every value comes straight from the historical commercial fact and is never persisted into fm_cost_records.
 * No internal Historical Commercial Fact code, raw UUID, or Platform Finance link is exposed to the client.
 * Any failure here is swallowed: the cost record read must never fail because of it.
 */
export async function POST(request: Request) {
  const bodyClone = request.clone();
  const response = await handleFmCostRoute({
    request,
    resource: "cost-records",
    writeCapability: "finance.create",
  });

  try {
    const body = (await bodyClone.json().catch(() => ({}))) as { action?: unknown };
    if (body.action !== "getById" || !response.ok) return response;

    const json = (await response.clone().json()) as {
      success: boolean;
      data?: (Record<string, unknown> & { workId?: string; actualAmount?: number }) | null;
    };
    const workCode = json?.data?.workId;
    if (typeof workCode !== "string" || !workCode) return response;

    const { createAdminClient } = await import("@/utils/supabase/admin");
    const admin = createAdminClient();
    const { data: workRows } = await admin.from("fm_work").select("id,organisation_id").eq("code", workCode);
    if (!workRows || workRows.length !== 1) return response;
    const work = workRows[0] as { id: string; organisation_id: string };

    const { PlatformFinanceHistoricalFactsRepository } = await import(
      "@/modules/platform-finance/server/PlatformFinanceHistoricalFactsRepository"
    );
    const { deriveCommercialSpread } = await import(
      "@/modules/platform-finance/domain/historicalCommercialFacts"
    );
    const factsByWork = await new PlatformFinanceHistoricalFactsRepository(work.organisation_id).listFactsByWorkIds([
      work.id,
    ]);
    // CERTAIN relationship is 1:1 in practice (verified against production); take the first if more than one
    // is ever linked rather than guessing which applies.
    const linked = (factsByWork.get(work.id) ?? [])[0] ?? null;
    if (!linked) return response;

    const executionCost = typeof json.data?.actualAmount === "number" ? json.data.actualAmount : null;
    const spread = deriveCommercialSpread(linked, executionCost);

    json.data!.commercialPosition = {
      submittedAmount: linked.submittedAmount ?? undefined,
      authorisedAmount: linked.authorisedAmount ?? undefined,
      amountReceived: linked.amountReceived ?? undefined,
      currency: linked.currency,
      sourcePaymentStatus: linked.sourcePaymentStatus ?? undefined,
      paymentDatetime: linked.paymentDatetime ?? undefined,
      derivedSpread: spread ?? undefined,
    };
    return NextResponse.json(json, { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return response;
  }
}
