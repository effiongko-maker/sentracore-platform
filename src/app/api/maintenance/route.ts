import { NextResponse } from "next/server";
import { gateApiCapability } from "@/lib/access/gateApi";
import { capabilityForOperationalProxyAction } from "@/lib/access/operationalApiGate";
import { isActionError } from "@/lib/actions/errors";
import {
  FmWorkNotFoundError,
  FmWorkUnavailableError,
  FmWorkReadOnlyError,
  FmWorkValidationError,
} from "@/modules/maintenance/server/fmWorkDomain";
import {
  FmWorkServerService,
  resolveFmWorkOrganisation,
} from "@/modules/maintenance/server/FmWorkServerService";
import type { ApiRequestEnvelope } from "@/lib/api/requestEnvelope";

/**
 * Work persistence is Supabase (fm_work).
 * Compatibility route: /api/maintenance.
 * No Apps Script call. No dual-write. Sheet Maintenance is frozen legacy.
 * Reads: ops.view. Creates: ops.create. Updates/deactivates: ops.edit.
 */

function fail(
  status: number,
  message: string,
  extra?: { errorClass?: string }
) {
  return NextResponse.json(
    {
      success: false,
      message,
      data: null,
      ...(extra?.errorClass
        ? { meta: { errorClass: extra.errorClass } }
        : {}),
    },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

function ok(data: unknown) {
  return NextResponse.json(
    { success: true, message: "", data },
    { status: 200, headers: { "Cache-Control": "no-store" } }
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
    const capability = capabilityForOperationalProxyAction(
      "maintenance",
      action
    );
    const gate = await gateApiCapability(capability);
    if (!gate.ok) return gate.response;

    const { organisationId, profileId } = resolveFmWorkOrganisation(
      gate.session
    );
    const service = new FmWorkServerService({
      session: gate.session,
      access: gate.access,
      organisationId,
      profileId,
    });

    const data = await service.dispatch(action, body.payload);
    return ok(data);
  } catch (error) {
    if (error instanceof FmWorkValidationError) {
      return fail(400, error.message, { errorClass: "validation" });
    }
    if (error instanceof FmWorkReadOnlyError) {
      return fail(403, error.message, { errorClass: "read_only" });
    }
    if (error instanceof FmWorkNotFoundError) {
      return fail(404, error.message, { errorClass: "validation" });
    }
    if (error instanceof FmWorkUnavailableError) {
      console.error("[api/maintenance] storage unavailable:", error);
      return fail(503, error.message);
    }
    if (isActionError(error)) {
      const status =
        error.code === "UNAUTHENTICATED"
          ? 401
          : error.code === "VALIDATION_ERROR"
            ? 400
            : 403;
      return fail(status, error.message);
    }
    console.error("[api/maintenance] error:", error);
    return fail(
      502,
      error instanceof Error
        ? error.message
        : "Work storage is unavailable."
    );
  }
}
