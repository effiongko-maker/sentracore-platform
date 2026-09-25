/**
 * Platform Finance — Settings snapshot API. Read-only: configuration and readiness as the live model states it.
 * Any Platform Finance grant may view it (workspace access); company-scoped facts cover the actor's companies only.
 */
import { NextResponse } from "next/server";
import { isActionError } from "@/lib/actions/errors";
import { requirePlatformFinanceWorkspaceAccess } from "@/modules/platform-finance/server/requirePlatformFinanceAccess";
import { PlatformFinanceSettingsServerService } from "@/modules/platform-finance/server/PlatformFinanceSettingsServerService";

export async function POST() {
  try {
    const access = await requirePlatformFinanceWorkspaceAccess();
    const data = await new PlatformFinanceSettingsServerService(access.organisationId).getSettings(access.profileId);
    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isActionError(error)) {
      const status = error.code === "UNAUTHENTICATED" ? 401 : error.code === "INTERNAL_ERROR" ? 500 : 403;
      return NextResponse.json({ success: false, message: error.message }, { status });
    }
    console.error("[platform-finance/settings]", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ success: false, message: "Unable to load Finance settings." }, { status: 500 });
  }
}
