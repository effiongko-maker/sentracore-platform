import { NextResponse } from "next/server";
import { gateApiCapability } from "@/lib/access/gateApi";
import { capabilityForOperationalProxyAction } from "@/lib/access/operationalApiGate";
import { isActionError } from "@/lib/actions/errors";
import {
  DECISION_KEYS,
  FmApprovalNotFoundError,
  FmApprovalUnavailableError,
  FmApprovalValidationError,
} from "@/modules/approvals/server/fmApprovalDomain";
import {
  FmApprovalServerService,
  resolveFmApprovalOrganisation,
} from "@/modules/approvals/server/FmApprovalServerService";
import type { ApiRequestEnvelope } from "@/lib/api/requestEnvelope";

/**
 * FM Approval persistence is Supabase (fm_approvals).
 * Compatibility route: /api/approvals. No Apps Script call. No dual-write.
 * Reads: ops.view. Mutations: approvals.manage.
 *
 * Decision fields and terminal decision statuses are NEVER writable here —
 * they belong to the protected approval.record_decision server action
 * (FM step-up / System Administrator override). The service rejects them too.
 */

const SERVED_ACTIONS = new Set(["getAll", "getById", "create", "update", "deactivate"]);
const DECISION_STATUSES = new Set(["approved", "rejected", "partially_approved", "partially approved"]);

function hasDecisionMutation(payload: Record<string, unknown>): boolean {
  for (const key of DECISION_KEYS) if (payload[key] !== undefined) return true;
  for (const label of ["Decision At", "Decision Outcome", "Decision Notes", "Decision Reference", "Approved Amount", "Approved By"]) {
    if (payload[label] !== undefined) return true;
  }
  return DECISION_STATUSES.has(String(payload.status ?? payload.Status ?? "").trim().toLowerCase());
}

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
    const gate = await gateApiCapability(capabilityForOperationalProxyAction("approvals", action));
    if (!gate.ok) return gate.response;

    if (!SERVED_ACTIONS.has(action)) {
      return fail(400, `Unknown approvals action: ${action}`, { errorClass: "validation" });
    }
    const payload =
      body.payload && typeof body.payload === "object" ? (body.payload as Record<string, unknown>) : {};
    if ((action === "update" || action === "create") && hasDecisionMutation(payload)) {
      return fail(403, "Approval decisions must be recorded via the approval.record_decision server action.");
    }

    const { organisationId, profileId } = resolveFmApprovalOrganisation(gate.session);
    const service = new FmApprovalServerService({ organisationId, profileId, session: gate.session, access: gate.access });
    const data = await service.dispatch(action, body.payload);
    return NextResponse.json({ success: true, message: "", data }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof FmApprovalValidationError) return fail(400, error.message, { errorClass: "validation" });
    if (error instanceof FmApprovalNotFoundError) return fail(404, error.message, { errorClass: "validation" });
    if (error instanceof FmApprovalUnavailableError) {
      console.error("[api/approvals] storage unavailable:", error);
      return fail(503, error.message);
    }
    if (isActionError(error)) {
      return fail(error.code === "UNAUTHENTICATED" ? 401 : error.code === "VALIDATION_ERROR" ? 400 : 403, error.message);
    }
    console.error("[api/approvals] error:", error);
    return fail(502, error instanceof Error ? error.message : "Approval storage is unavailable.");
  }
}
