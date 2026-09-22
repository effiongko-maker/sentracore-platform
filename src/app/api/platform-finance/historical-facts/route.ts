/**
 * Platform Finance Historical Commercial Facts API — read-only presentation of the imported register
 * (platform_finance_historical_commercial_facts, foundation 968e75d, import dac5c8d). No create/update/delete
 * action exists: the foundation has no correction mechanism, so there is nothing for this route to write.
 */
import { NextResponse } from "next/server";
import { isActionError } from "@/lib/actions/errors";
import { PLATFORM_FINANCE_CAPABILITIES, type PlatformFinanceCapability } from "@/modules/platform-finance/types";
import { requirePlatformFinanceAccessAny } from "@/modules/platform-finance/server/requirePlatformFinanceAccess";
import { PlatformFinanceHistoricalFactsServerService } from "@/modules/platform-finance/server/PlatformFinanceHistoricalFactsServerService";
import type { DerivedCommercialSpread, PlatformFinanceHistoricalCommercialFact } from "@/modules/platform-finance/domain/historicalCommercialFacts";

type Action = "getMyHistoricalFactCapabilities" | "listHistoricalFacts" | "getHistoricalFact";

const READ_CAPS = [
  PLATFORM_FINANCE_CAPABILITIES.historical_view,
  PLATFORM_FINANCE_CAPABILITIES.historical_manage,
] as const satisfies readonly PlatformFinanceCapability[];

type Body = { action?: Action; id?: string; code?: string };

function presentFact(fact: PlatformFinanceHistoricalCommercialFact, spread: DerivedCommercialSpread | null) {
  return { ...fact, derivedSpread: spread };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const action = body.action;
    if (!action) {
      return NextResponse.json({ success: false, message: "action required" }, { status: 400 });
    }

    const access = await requirePlatformFinanceAccessAny({ capabilities: READ_CAPS });
    const svc = new PlatformFinanceHistoricalFactsServerService(access.organisationId);
    const actor = { organisationId: access.organisationId, profileId: access.profileId };

    if (action === "getMyHistoricalFactCapabilities") {
      return NextResponse.json({ success: true, data: await svc.getMyCapabilities(actor) });
    }

    if (action === "listHistoricalFacts") {
      const rows = await svc.listWithDerivedSpread(actor);
      return NextResponse.json({
        success: true,
        data: rows.map(({ fact, spread }) => presentFact(fact, spread)),
      });
    }

    if (action === "getHistoricalFact") {
      const rows = await svc.listWithDerivedSpread(actor);
      const match = body.id
        ? rows.find((r) => r.fact.id === body.id)
        : body.code
          ? rows.find((r) => r.fact.code.toLowerCase() === body.code!.toLowerCase())
          : undefined;
      if (!match) {
        return NextResponse.json({ success: false, message: "Historical commercial fact not found." }, { status: 404 });
      }
      const [provenance, workRef] = await Promise.all([
        svc.getProvenance(actor, match.fact.id),
        svc.resolveWorkRef(actor, match.fact.fmWorkId, match.fact.fmWorkInstructionId),
      ]);
      return NextResponse.json({
        success: true,
        data: { ...presentFact(match.fact, match.spread), provenance, workRef },
      });
    }

    return NextResponse.json({ success: false, message: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    if (isActionError(error)) {
      const status =
        error.code === "UNAUTHENTICATED"
          ? 401
          : error.code === "FORBIDDEN" || error.code === "MODULE_NOT_ENABLED"
            ? 403
            : error.code === "VALIDATION_ERROR"
              ? 400
              : 500;
      return NextResponse.json({ success: false, code: error.code, message: error.message }, { status });
    }
    console.error("[platform-finance/historical-facts]", error);
    return NextResponse.json({ success: false, message: "Internal error" }, { status: 500 });
  }
}
