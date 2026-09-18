import { NextResponse } from "next/server";
import { isActionError } from "@/lib/actions/errors";
import { PLATFORM_FINANCE_CAPABILITIES } from "@/modules/platform-finance/types";
import { requirePlatformFinanceAccess } from "@/modules/platform-finance/server/requirePlatformFinanceAccess";
import { PlatformFinanceReceivablesServerService } from "@/modules/platform-finance/server/PlatformFinanceReceivablesServerService";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: string; id?: string };
    const access = await requirePlatformFinanceAccess({ capability: PLATFORM_FINANCE_CAPABILITIES.receivable_view });
    const service = new PlatformFinanceReceivablesServerService(access.organisationId);
    const actor = { organisationId: access.organisationId, profileId: access.profileId };
    if (body.action === "listReceivables") {
      return NextResponse.json({ success: true, data: await service.list(actor) });
    }
    if (body.action === "getReceivable" && body.id) {
      return NextResponse.json({ success: true, data: await service.get(actor, body.id) });
    }
    return NextResponse.json({ success: false, message: "Unknown receivable action." }, { status: 400 });
  } catch (error) {
    if (isActionError(error)) {
      return NextResponse.json({ success: false, code: error.code, message: error.message }, { status: error.code === "FORBIDDEN" ? 403 : error.code === "UNAUTHENTICATED" ? 401 : error.code === "VALIDATION_ERROR" ? 400 : 500 });
    }
    console.error("[platform-finance/receivables]", error);
    return NextResponse.json({ success: false, message: "Internal error" }, { status: 500 });
  }
}
