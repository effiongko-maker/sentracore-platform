import "server-only";
import { NextResponse } from "next/server";
import { gateApiCapability } from "@/lib/access/gateApi";
import { capabilityForOperationalProxyAction } from "@/lib/access/operationalApiGate";
import { isActionError } from "@/lib/actions/errors";
import { FmLogNotFoundError, FmLogUnavailableError, FmLogValidationError, type FmLogResource } from "./fmLogDomain";
import { FmLogServerService, resolveFmLogOrganisation } from "./FmLogServerService";

/**
 * Shared /api handler mechanics for the seven FM operational logs.
 * Supabase is the only source — no Apps Script call, no Sheet fallback.
 * Reads: ops.view. Creates: ops.create. Updates: ops.edit (unchanged gates).
 * A storage failure is 503 — never an empty list.
 */
const SERVED = new Set(["getAll", "getById", "create", "update"]);

function fail(status: number, message: string, errorClass?: string) {
  return NextResponse.json(
    { success: false, message, data: null, ...(errorClass ? { meta: { errorClass } } : {}) },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function handleFmLogRoute(request: Request, resource: FmLogResource): Promise<NextResponse> {
  try {
    let body: { action?: unknown; payload?: unknown } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      body = {};
    }
    const action = String(body.action ?? "getAll");
    const gate = await gateApiCapability(capabilityForOperationalProxyAction(resource, action));
    if (!gate.ok) return gate.response;
    if (!SERVED.has(action)) return fail(400, `Unknown ${resource} action: ${action}`, "validation");

    const { organisationId, profileId } = resolveFmLogOrganisation(gate.session);
    const data = await new FmLogServerService({ organisationId, profileId }).dispatch(resource, action, body.payload);
    return NextResponse.json({ success: true, message: "", data }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof FmLogValidationError) return fail(400, error.message, "validation");
    if (error instanceof FmLogNotFoundError) return fail(404, error.message, "validation");
    if (error instanceof FmLogUnavailableError) {
      console.error(`[api/${resource}] storage unavailable:`, error);
      return fail(503, error.message);
    }
    if (isActionError(error)) return fail(error.code === "UNAUTHENTICATED" ? 401 : error.code === "VALIDATION_ERROR" ? 400 : 403, error.message);
    console.error(`[api/${resource}] error:`, error);
    return fail(502, "Operational log storage is unavailable.");
  }
}
