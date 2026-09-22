import { NextResponse } from "next/server";
import { handleFmCostRoute } from "@/modules/finance/server/fmCostRoute";

/**
 * FM Cost Records (operational, not Platform Finance) persistence is Supabase. Compatibility route: /api/cost-records.
 * No Apps Script call. Reads: finance.view. Writes: finance.create.
 *
 * The one cross-domain composition below (a restrained, read-only reference to any linked Platform Finance
 * historical commercial fact) is deliberately kept HERE, outside FmCostRepository / FmCostServerService /
 * fmCostRoute — those files must stay free of any Platform Finance coupling (enforced by
 * scripts/verify-fm-costs-foundation.mts). It only runs for a single-record read (getById), never the list, and
 * it never carries a financial value — only an id + code the client links out to Platform Finance's own
 * capability-gated surface. Any failure here is swallowed: the cost record read must never fail because of it.
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
      data?: (Record<string, unknown> & { workId?: string }) | null;
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
    const refs = await new PlatformFinanceHistoricalFactsRepository(work.organisation_id).listRefsByWorkIds([
      work.id,
    ]);
    json.data!.linkedHistoricalCommercialFacts = refs.get(work.id) ?? [];
    return NextResponse.json(json, { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return response;
  }
}
