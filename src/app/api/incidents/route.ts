import { NextResponse } from "next/server";
import { gateApiCapability } from "@/lib/access/gateApi";
import { capabilityForOperationalProxyAction } from "@/lib/access/operationalApiGate";
import { isActionError } from "@/lib/actions/errors";
import {
  FmIncidentNotFoundError,
  FmIncidentUnavailableError,
  FmIncidentValidationError,
} from "@/modules/incidents/server/fmIncidentDomain";
import {
  FmIncidentServerService,
  resolveFmIncidentOrganisation,
} from "@/modules/incidents/server/FmIncidentServerService";
import type { AppsScriptProxyBody } from "@/services/api/appsScriptProxy";

/**
 * Incident persistence is Supabase (fm_incidents).
 * Compatibility route: /api/incidents. No Apps Script call. No dual-write.
 * Sheet Incidents are frozen legacy.
 *
 * Reads: ops.view. Creates: ops.create (still FROZEN — Phase 18). Updates and
 * deactivates: ops.edit. Request links are set by Request treatment server
 * actions, never through this proxy.
 */

const SERVED_ACTIONS = new Set(["getAll", "getById", "create", "update", "deactivate"]);

const BLOCKED_UPDATE_KEYS = [
  "sourceRequestId",
  "Request ID",
  "maintenanceIds",
  "Maintenance IDs",
] as const;

function fail(status: number, message: string, extra?: { errorClass?: string }) {
  return NextResponse.json(
    {
      success: false,
      message,
      data: null,
      ...(extra?.errorClass ? { meta: { errorClass: extra.errorClass } } : {}),
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
    const capability = capabilityForOperationalProxyAction("incidents", action);
    const gate = await gateApiCapability(capability);
    if (!gate.ok) return gate.response;

    if (!SERVED_ACTIONS.has(action)) {
      return fail(400, `Unknown incidents action: ${action}`, { errorClass: "validation" });
    }

    if (action === "update") {
      const payload =
        body.payload && typeof body.payload === "object"
          ? (body.payload as Record<string, unknown>)
          : {};
      for (const key of BLOCKED_UPDATE_KEYS) {
        if (key in payload && payload[key] !== undefined) {
          return fail(
            403,
            "Incident Request and Work links must be set through Request/Incident treatment actions."
          );
        }
      }
    }

    const { organisationId, profileId } = resolveFmIncidentOrganisation(gate.session);
    const service = new FmIncidentServerService({
      organisationId,
      profileId,
      session: gate.session,
      access: gate.access,
    });
    return ok(await service.dispatch(action, body.payload));
  } catch (error) {
    if (error instanceof FmIncidentValidationError) {
      return fail(400, error.message, { errorClass: "validation" });
    }
    if (error instanceof FmIncidentNotFoundError) {
      return fail(404, error.message, { errorClass: "validation" });
    }
    if (error instanceof FmIncidentUnavailableError) {
      console.error("[api/incidents] storage unavailable:", error);
      return fail(503, error.message);
    }
    if (isActionError(error)) {
      const status =
        error.code === "UNAUTHENTICATED" ? 401 : error.code === "VALIDATION_ERROR" ? 400 : 403;
      return fail(status, error.message);
    }
    console.error("[api/incidents] error:", error);
    return fail(
      502,
      error instanceof Error ? error.message : "Incident storage is unavailable."
    );
  }
}
