import { NextResponse } from "next/server";
import { gateApiCapability } from "@/lib/access/gateApi";
import { capabilityForOperationalProxyAction } from "@/lib/access/operationalApiGate";
import { isActionError } from "@/lib/actions/errors";
import {
  FmFacilitiesServerService,
  resolveFmFacilitiesOrganisation,
} from "@/modules/facilities/server/FmFacilitiesServerService";
import {
  FmFacilityNotFoundError,
  FmFacilityUnavailableError,
  FmFacilityValidationError,
} from "@/modules/facilities/server/fmFacilityDomain";
import type { AppsScriptProxyBody } from "@/services/api/appsScriptProxy";

/**
 * Facilities persistence is Supabase (fm_facilities).
 * No Apps Script call. No dual-write. Sheet Facilities is frozen legacy for this domain.
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
    let body: AppsScriptProxyBody = {};
    try {
      body = (await request.json()) as AppsScriptProxyBody;
    } catch {
      body = {};
    }

    const action = String(body.action ?? "getAll");
    const capability = capabilityForOperationalProxyAction(
      "facilities",
      action
    );
    const gate = await gateApiCapability(capability);
    if (!gate.ok) return gate.response;

    const { organisationId, profileId } = resolveFmFacilitiesOrganisation(
      gate.session
    );
    const service = new FmFacilitiesServerService({
      session: gate.session,
      access: gate.access,
      organisationId,
      profileId,
    });

    const data = await service.dispatch(action, body.payload);
    return ok(data);
  } catch (error) {
    if (error instanceof FmFacilityValidationError) {
      return fail(400, error.message, { errorClass: "validation" });
    }
    if (error instanceof FmFacilityNotFoundError) {
      return fail(404, error.message, { errorClass: "validation" });
    }
    if (error instanceof FmFacilityUnavailableError) {
      console.error("[api/facilities] storage unavailable:", error);
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
    console.error("[api/facilities] error:", error);
    return fail(
      502,
      error instanceof Error
        ? error.message
        : "Facility storage is unavailable."
    );
  }
}
