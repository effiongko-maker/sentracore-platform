import { NextResponse } from "next/server";
import { gateApiCapability } from "@/lib/access/gateApi";
import { capabilityForOperationalProxyAction } from "@/lib/access/operationalApiGate";
import { isActionError } from "@/lib/actions/errors";
import {
  FmWorkInstructionNotFoundError,
  FmWorkInstructionReadOnlyError,
  FmWorkInstructionUnavailableError,
  FmWorkInstructionValidationError,
} from "@/modules/work-orders/server/fmWorkInstructionDomain";
import {
  FmWorkInstructionServerService,
  resolveFmWorkInstructionOrganisation,
} from "@/modules/work-orders/server/FmWorkInstructionServerService";
import type { ApiRequestEnvelope } from "@/lib/api/requestEnvelope";

/**
 * Work Instruction (Work Order / Job Order) persistence is Supabase
 * (fm_work_instructions). Compatibility route: /api/work-orders.
 * No Apps Script call. No dual-write. Sheet Work Orders are frozen legacy.
 * Reads: ops.view. Creates: ops.create. Updates/deactivates: ops.edit.
 * Commercial submissions: createSubmission → ops.create; updateSubmission / recordFollowUp → ops.edit;
 * listFollowUps → ops.view.
 */

const SERVED_ACTIONS = new Set([
  "getAll",
  "getById",
  "create",
  "update",
  "deactivate",
  // Commercial submission package (WO/JO): create → ops.create; update / follow-up → ops.edit; history → ops.view.
  "createSubmission",
  "updateSubmission",
  "recordFollowUp",
  "listFollowUps",
]);

function fail(status: number, message: string, extra?: { errorClass?: string }) {
  return NextResponse.json(
    { success: false, message, data: null, ...(extra?.errorClass ? { meta: { errorClass: extra.errorClass } } : {}) },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  try {
    let body: ApiRequestEnvelope = {};
    try {
      body = (await request.json()) as ApiRequestEnvelope;
    } catch {
      body = {};
    }
    const action = String(body.action ?? "getAll");
    const gate = await gateApiCapability(capabilityForOperationalProxyAction("work-orders", action));
    if (!gate.ok) return gate.response;

    // getFilterCatalog / createFromMaintenance were Apps Script actions; retired.
    if (!SERVED_ACTIONS.has(action)) {
      return fail(400, `Unknown work-orders action: ${action}`, { errorClass: "validation" });
    }

    const { organisationId, profileId } = resolveFmWorkInstructionOrganisation(gate.session);
    const service = new FmWorkInstructionServerService({
      organisationId,
      profileId,
      session: gate.session,
      access: gate.access,
    });
    const data = await service.dispatch(action, body.payload);
    return NextResponse.json(
      { success: true, message: "", data },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof FmWorkInstructionValidationError) return fail(400, error.message, { errorClass: "validation" });
    if (error instanceof FmWorkInstructionReadOnlyError) return fail(403, error.message, { errorClass: "read_only" });
    if (error instanceof FmWorkInstructionNotFoundError) return fail(404, error.message, { errorClass: "validation" });
    if (error instanceof FmWorkInstructionUnavailableError) {
      console.error("[api/work-orders] storage unavailable:", error);
      return fail(503, error.message);
    }
    if (isActionError(error)) {
      return fail(
        error.code === "UNAUTHENTICATED" ? 401 : error.code === "VALIDATION_ERROR" ? 400 : 403,
        error.message
      );
    }
    console.error("[api/work-orders] error:", error);
    return fail(502, error instanceof Error ? error.message : "Work Instruction storage is unavailable.");
  }
}
