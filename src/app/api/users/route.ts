import { NextResponse } from "next/server";
import { gateApiCapability } from "@/lib/access/gateApi";
import { isWriteAction } from "@/lib/access/server";
import { isActionError } from "@/lib/actions/errors";
import {
  FmPeopleNotFoundError,
  FmPeopleUnavailableError,
  FmPeopleValidationError,
} from "@/modules/users/server/fmPeopleDomain";
import {
  FmPeopleServerService,
  resolveFmPeopleOrganisation,
} from "@/modules/users/server/FmPeopleServerService";
import type { AppsScriptProxyBody } from "@/services/api/appsScriptProxy";

/**
 * FM People directory is profiles + fm_facility_assignments (Supabase).
 * No Apps Script USERS call. No dual-write. No Auth invitation.
 * Reads: users.view. Mutations: users.manage.
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
    const capability = isWriteAction(action) ? "users.manage" : "users.view";
    const gate = await gateApiCapability(capability);
    if (!gate.ok) return gate.response;

    const { organisationId, profileId } = resolveFmPeopleOrganisation(
      gate.session
    );
    const service = new FmPeopleServerService({
      session: gate.session,
      access: gate.access,
      organisationId,
      profileId,
    });

    const data = await service.dispatch(action, body.payload);
    return ok(data);
  } catch (error) {
    if (error instanceof FmPeopleValidationError) {
      return fail(400, error.message, { errorClass: "validation" });
    }
    if (error instanceof FmPeopleNotFoundError) {
      return fail(404, error.message, { errorClass: "validation" });
    }
    if (error instanceof FmPeopleUnavailableError) {
      console.error("[api/users] storage unavailable:", error);
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
    console.error("[api/users] error:", error);
    return fail(
      502,
      error instanceof Error
        ? error.message
        : "People directory is unavailable."
    );
  }
}
