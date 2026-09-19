import { NextResponse } from "next/server";
import { gateApiCapability } from "@/lib/access/gateApi";
import { capabilityForRequestsProxyAction } from "@/lib/access/operationalApiGate";
import { isActionError } from "@/lib/actions/errors";
import {
  FmRequestNotFoundError,
  FmRequestUnavailableError,
  FmRequestValidationError,
} from "@/modules/requests/server/fmRequestDomain";
import {
  FmRequestServerService,
  resolveFmRequestOrganisation,
} from "@/modules/requests/server/FmRequestServerService";
import type { ApiRequestEnvelope } from "@/lib/api/requestEnvelope";

/**
 * Request persistence is Supabase (fm_requests).
 * Compatibility route: /api/requests. No Apps Script call. No dual-write.
 * Sheet Requests are frozen legacy.
 *
 * Reads: requests.view. Creates: ops.create. Updates: ops.edit.
 * Status transitions and treatment links are NOT writable here — they belong
 * to request.treatment.* server actions.
 */

const BLOCKED_UPDATE_KEYS = [
  "status",
  "maintenanceIds",
  "incidentIds",
  "workOrderIds",
  "Maintenance IDs",
  "Incident IDs",
  "Work Order IDs",
  "Status",
] as const;

const SERVED_ACTIONS = new Set([
  "getAll",
  "getById",
  "create",
  "update",
  "deactivate",
]);

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
    let body: ApiRequestEnvelope = {};
    try {
      body = (await request.json()) as ApiRequestEnvelope;
    } catch {
      body = {};
    }

    const action = String(body.action || "getAll");
    const capability = capabilityForRequestsProxyAction(action);
    const gate = await gateApiCapability(capability);
    if (!gate.ok) return gate.response;

    // Treatment actions (createTreatment / linkTreatment) were Apps Script
    // Request writers. They are retired: fail closed, never proxy.
    if (!SERVED_ACTIONS.has(action)) {
      return fail(400, `Unknown requests action: ${action}`, {
        errorClass: "validation",
      });
    }

    const payload =
      body.payload && typeof body.payload === "object"
        ? (body.payload as Record<string, unknown>)
        : {};

    if (action === "update") {
      for (const key of BLOCKED_UPDATE_KEYS) {
        if (key in payload && payload[key] !== undefined) {
          return fail(
            403,
            "Request status and treatment links must be updated via server actions."
          );
        }
      }
    }

    if (action === "deactivate") {
      return fail(403, "Cancel Request via the Request treatment server action.");
    }

    if (action === "create") {
      // Queue create is retired; intake is /occupant-requests.
      // Status may not be seeded and treatment links are derived, never written.
      for (const key of [
        "maintenanceIds",
        "incidentIds",
        "workOrderIds",
      ] as const) {
        const value = payload[key];
        if (Array.isArray(value) && value.length > 0) {
          return fail(
            403,
            "Cannot seed treatment links on Request create via API proxy."
          );
        }
      }
    }

    const { organisationId, profileId } = resolveFmRequestOrganisation(
      gate.session
    );
    const service = new FmRequestServerService({
      organisationId,
      profileId,
      session: gate.session,
      access: gate.access,
    });

    return ok(await service.dispatch(action, body.payload));
  } catch (error) {
    if (error instanceof FmRequestValidationError) {
      return fail(400, error.message, { errorClass: "validation" });
    }
    if (error instanceof FmRequestNotFoundError) {
      return fail(404, error.message, { errorClass: "validation" });
    }
    if (error instanceof FmRequestUnavailableError) {
      console.error("[api/requests] storage unavailable:", error);
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
    console.error("[api/requests] error:", error);
    return fail(
      502,
      error instanceof Error ? error.message : "Request storage is unavailable."
    );
  }
}
