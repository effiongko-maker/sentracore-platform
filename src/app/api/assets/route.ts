import { NextResponse } from "next/server";
import { gateApiCapability } from "@/lib/access/gateApi";
import { capabilityForOperationalProxyAction } from "@/lib/access/operationalApiGate";
import { isActionError } from "@/lib/actions/errors";
import {
  FmAssetNotFoundError,
  FmAssetUnavailableError,
  FmAssetValidationError,
} from "@/modules/assets/server/fmAssetDomain";
import { FmAssetServerService, resolveFmAssetOrganisation } from "@/modules/assets/server/FmAssetServerService";

/**
 * FM Asset persistence is Supabase (fm_assets). Compatibility route: /api/assets.
 * No Apps Script call. No dual-write.
 * Reads: ops.view. Creates: ops.create. Updates/deactivates: ops.edit.
 */

const SERVED_ACTIONS = new Set(["getAll", "getById", "create", "update", "deactivate"]);

function fail(status: number, message: string, extra?: { errorClass?: string }) {
  return NextResponse.json(
    { success: false, message, data: null, ...(extra?.errorClass ? { meta: { errorClass: extra.errorClass } } : {}) },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  try {
    let body: { action?: unknown; payload?: unknown } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      body = {};
    }
    const action = String(body.action ?? "getAll");
    const gate = await gateApiCapability(capabilityForOperationalProxyAction("assets", action));
    if (!gate.ok) return gate.response;
    if (!SERVED_ACTIONS.has(action)) return fail(400, `Unknown assets action: ${action}`, { errorClass: "validation" });

    const { organisationId, profileId } = resolveFmAssetOrganisation(gate.session);
    const service = new FmAssetServerService({ organisationId, profileId, session: gate.session, access: gate.access });
    const data = await service.dispatch(action, body.payload);
    return NextResponse.json({ success: true, message: "", data }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof FmAssetValidationError) return fail(400, error.message, { errorClass: "validation" });
    if (error instanceof FmAssetNotFoundError) return fail(404, error.message, { errorClass: "validation" });
    if (error instanceof FmAssetUnavailableError) {
      console.error("[api/assets] storage unavailable:", error);
      return fail(503, error.message);
    }
    if (isActionError(error)) {
      return fail(error.code === "UNAUTHENTICATED" ? 401 : error.code === "VALIDATION_ERROR" ? 400 : 403, error.message);
    }
    console.error("[api/assets] error:", error);
    return fail(502, "Asset storage is unavailable.");
  }
}
