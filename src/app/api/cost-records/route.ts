import { NextResponse } from "next/server";
import { handleFmCostRoute } from "@/modules/finance/server/fmCostRoute";

/**
 * FM Cost Records (operational, not Platform Finance) persistence is Supabase. Compatibility route: /api/cost-records.
 * No Apps Script call. Reads: finance.view. Writes: finance.create.
 *
 * The cross-domain composition below is deliberately kept HERE, outside FmCostRepository / FmCostServerService /
 * fmCostRoute — those files must stay free of any Platform Finance coupling (enforced by
 * scripts/verify-fm-costs-foundation.mts). Gated by the SAME finance.view capability the read already required —
 * no separate Platform Finance capability is granted or checked. It composes facts without copying ownership:
 * every value comes straight from the linked historical commercial fact and is never persisted into
 * fm_cost_records. Any failure here is swallowed: the cost record read must never fail because of it.
 *
 * Two compositions:
 *  - getById: the full "Commercial Position" (Cost Detail only) — unchanged from commit 17d1ecd.
 *  - getAll: a single compact date fallback per row (register / recent-costs surfaces only) — for a
 *    migrated_historical row with NO authoritative recordedAt, attaches the CERTAIN-linked fact's
 *    payment_datetime labelled "Payment", never relabelled as a Cost date and never copied into fm_cost_records.
 *    A row that already has recordedAt is left untouched; the caller always prefers recordedAt ("Cost") first.
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
    if (!response.ok) return response;

    if (body.action === "getById") {
      return await composeGetById(response);
    }
    if (body.action === "getAll") {
      return await composeGetAll(response);
    }
    return response;
  } catch {
    return response;
  }
}

async function composeGetById(response: Response): Promise<Response> {
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
  const { deriveCommercialSpread } = await import("@/modules/platform-finance/domain/historicalCommercialFacts");
  const factsByWork = await new PlatformFinanceHistoricalFactsRepository(work.organisation_id).listFactsByWorkIds([
    work.id,
  ]);
  // CERTAIN relationship is 1:1 in practice (verified against production); take the first if more than one is
  // ever linked rather than guessing which applies.
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
}

async function composeGetAll(response: Response): Promise<Response> {
  const json = (await response.clone().json()) as {
    success: boolean;
    data?: { data?: Array<Record<string, unknown> & { recordOrigin?: string; recordedAt?: string; workId?: string }> } | null;
  };
  const rows = json?.data?.data;
  if (!Array.isArray(rows) || !rows.length) return response;

  // Only migrated_historical rows with no authoritative FM cost date, and a Work code to resolve, are candidates.
  const candidates = rows.filter(
    (row) => row.recordOrigin === "migrated_historical" && !row.recordedAt && typeof row.workId === "string" && row.workId
  );
  if (!candidates.length) return response;

  const { createAdminClient } = await import("@/utils/supabase/admin");
  const admin = createAdminClient();
  const workCodes = [...new Set(candidates.map((row) => row.workId as string))];
  const { data: workRows } = await admin.from("fm_work").select("id,code,organisation_id").in("code", workCodes);
  if (!workRows || !workRows.length) return response;

  const idByCode = new Map(workRows.map((w) => [w.code as string, w.id as string]));
  const organisationId = (workRows[0] as { organisation_id: string }).organisation_id;
  const workIds = [...idByCode.values()];

  const { PlatformFinanceHistoricalFactsRepository } = await import(
    "@/modules/platform-finance/server/PlatformFinanceHistoricalFactsRepository"
  );
  const factsByWork = await new PlatformFinanceHistoricalFactsRepository(organisationId).listFactsByWorkIds(workIds);

  let touched = false;
  for (const row of candidates) {
    const workId = idByCode.get(row.workId as string);
    if (!workId) continue;
    const fact = (factsByWork.get(workId) ?? [])[0];
    if (fact?.paymentDatetime) {
      row.compactDate = { value: fact.paymentDatetime, label: "Payment" };
      touched = true;
    }
  }
  if (!touched) return response;
  return NextResponse.json(json, { status: response.status, headers: { "Cache-Control": "no-store" } });
}
