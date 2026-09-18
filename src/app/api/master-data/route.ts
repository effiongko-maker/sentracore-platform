import { NextResponse } from "next/server";
import { gateApiCapability } from "@/lib/access/gateApi";
import { capabilityForOperationalProxyAction } from "@/lib/access/operationalApiGate";
import { isActionError } from "@/lib/actions/errors";
import { resolveFmFacilitiesOrganisation } from "@/modules/facilities/server/FmFacilitiesServerService";
import {
  FmLocationNotFoundError,
  FmLocationUnavailableError,
  FmLocationValidationError,
} from "@/modules/master-data/server/fmLocationDomain";
import { FmLocationServerService } from "@/modules/master-data/server/FmLocationServerService";
import {
  postToAppsScript,
  type AppsScriptProxyBody,
} from "@/services/api/appsScriptProxy";

/**
 * Master-data split (Phase 1D):
 *   Supabase: facilities (via location catalog), buildings, floors, rooms, departments
 *   Apps Script: vendors only
 *
 * No dual-write. A failed source is unavailable, not a healthy empty collection.
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

function payloadEntity(payload: unknown): string | undefined {
  return FmLocationServerService.peekEntity(payload);
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
      "master-data",
      action
    );
    const gate = await gateApiCapability(capability);
    if (!gate.ok) return gate.response;

    const entity = payloadEntity(body.payload);

    if (action === "getLocationCatalog") {
      const { organisationId, profileId } = resolveFmFacilitiesOrganisation(
        gate.session
      );
      const service = new FmLocationServerService({
        session: gate.session,
        access: gate.access,
        organisationId,
        profileId,
      });
      const data = await service.dispatch(action, body.payload);
      return ok(data);
    }

    if (entity === "vendors") {
      const data = await postToAppsScript(
        body,
        { resource: "master-data", action },
        "api/master-data"
      );
      return NextResponse.json(data, {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      });
    }

    if (FmLocationServerService.isLocationEntity(entity)) {
      const { organisationId, profileId } = resolveFmFacilitiesOrganisation(
        gate.session
      );
      const service = new FmLocationServerService({
        session: gate.session,
        access: gate.access,
        organisationId,
        profileId,
      });
      const data = await service.dispatch(action, body.payload);
      return ok(data);
    }

    return fail(
      400,
      entity
        ? `Unknown master-data entity: ${entity}`
        : "Master-data entity is required.",
      { errorClass: "validation" }
    );
  } catch (error) {
    if (error instanceof FmLocationValidationError) {
      return fail(400, error.message, { errorClass: "validation" });
    }
    if (error instanceof FmLocationNotFoundError) {
      return fail(404, error.message, { errorClass: "validation" });
    }
    if (error instanceof FmLocationUnavailableError) {
      console.error("[api/master-data] storage unavailable:", error);
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
    console.error("[api/master-data] error:", error);
    return fail(
      502,
      error instanceof Error
        ? error.message
        : "Master-data storage is unavailable."
    );
  }
}
