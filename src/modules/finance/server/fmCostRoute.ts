import "server-only";
import { NextResponse } from "next/server";
import { gateApiCapability } from "@/lib/access/gateApi";
import type { AccessCapability } from "@/lib/access/capabilities";
import {
  emitProtectedActionAudit,
  extractProtectedProof,
  gateProtectedActionOrResponse,
} from "@/lib/access/gateProtectedAction";
import type { ProtectedActionId } from "@/lib/access/protectedActions";
import { isActionError } from "@/lib/actions/errors";
import {
  FmCostNotFoundError,
  FmCostProtectedRequiredError,
  FmCostReadOnlyError,
  FmCostUnavailableError,
  FmCostValidationError,
} from "./fmCostDomain";
import { FmCostServerService, resolveFmCostOrganisation, type FmCostResource } from "./FmCostServerService";

/**
 * Shared /api handler for the four FM Cost compatibility routes.
 * Supabase (fm_cost_*, fm_reimbursement_*) is the only source. No Apps Script
 * call, no dual-write, no Platform Finance posting.
 *
 * Reads: finance.view. Writes: per-resource capability. Protected financial
 * decisions (locked-cost edit, submitted-claim edit, authorization revision,
 * payment correction) are performed ONLY with a verified protected proof and
 * are never reachable through the generic create/update path without it.
 */

const READ_ACTIONS = new Set(["getAll", "getById", "getBySubmissionId", "getTotals"]);
const WRITE_ACTIONS = new Set(["create", "update"]);

/** The only protected action each (resource, action) may carry. */
const PROTECTED_FOR: Partial<Record<FmCostResource, ProtectedActionId>> = {
  "cost-records": "finance.cost.unlock_edit",
  "cost-submissions": "finance.claim.edit_submitted",
  "reimbursement-authorizations": "finance.authorization.revise",
  "reimbursement-payments": "finance.payment.correct",
};

function fail(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json(
    { success: false, message, data: null, ...(extra ? { meta: extra } : {}) },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function handleFmCostRoute(options: {
  request: Request;
  resource: FmCostResource;
  writeCapability: AccessCapability;
  /** Extra capability for a status→submitted transition (claims only). */
  submitCapability?: AccessCapability;
}): Promise<NextResponse> {
  const { resource } = options;
  try {
    let body: { action?: unknown; payload?: unknown } = {};
    try {
      body = (await options.request.json()) as typeof body;
    } catch {
      body = {};
    }
    const action = String(body.action ?? "getAll");
    if (!READ_ACTIONS.has(action) && !WRITE_ACTIONS.has(action)) {
      return fail(400, `Unknown ${resource} action: ${action}`, { errorClass: "validation" });
    }

    const rawPayload = body.payload && typeof body.payload === "object" ? (body.payload as Record<string, unknown>) : {};
    const isWrite = WRITE_ACTIONS.has(action);
    const submitting = String(rawPayload.status ?? "").trim().toLowerCase() === "submitted";
    const capability: AccessCapability = !isWrite
      ? "finance.view"
      : options.submitCapability && submitting
        ? options.submitCapability
        : options.writeCapability;
    const gate = await gateApiCapability(capability);
    if (!gate.ok) return gate.response;

    const extracted = extractProtectedProof(body.payload);
    const payload: unknown = extracted.sanitizedPayload;
    let authorizedProtectedAction: ProtectedActionId | null = null;
    let protectedGate: Awaited<ReturnType<typeof gateProtectedActionOrResponse>> | null = null;

    if (isWrite && extracted.actionId) {
      const allowed = PROTECTED_FOR[resource];
      if (action !== "update" || extracted.actionId !== allowed) {
        return fail(403, `Protected action ${extracted.actionId} is not valid for ${resource} ${action}.`);
      }
      protectedGate = await gateProtectedActionOrResponse(extracted.actionId, extracted.stepUpPassword);
      if (!protectedGate.ok) return protectedGate.response;
      authorizedProtectedAction = extracted.actionId;
    }

    const { organisationId, profileId } = resolveFmCostOrganisation(gate.session);
    const service = new FmCostServerService({ organisationId, profileId, session: gate.session, access: gate.access });
    const data = await service.dispatch(resource, action, payload, { authorizedProtectedAction });

    if (protectedGate?.ok) {
      const record = data as { costId?: string; submissionId?: string; authorizationId?: string; paymentId?: string } | null;
      await emitProtectedActionAudit({
        auth: protectedGate.result,
        entityId: String(record?.costId ?? record?.submissionId ?? record?.authorizationId ?? record?.paymentId ?? extracted.actionId),
        clientRequestId: extracted.clientRequestId,
        after: { resource, action },
      });
    }

    return NextResponse.json({ success: true, message: "", data }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof FmCostProtectedRequiredError) {
      return fail(403, error.message, { errorClass: "protected", protectedActionId: error.actionId });
    }
    if (error instanceof FmCostReadOnlyError) return fail(403, error.message, { errorClass: "read_only" });
    if (error instanceof FmCostValidationError) return fail(400, error.message, { errorClass: "validation" });
    if (error instanceof FmCostNotFoundError) return fail(404, error.message, { errorClass: "validation" });
    if (error instanceof FmCostUnavailableError) {
      console.error(`[api/${resource}] storage unavailable:`, error);
      return fail(503, error.message);
    }
    if (isActionError(error)) {
      return fail(error.code === "UNAUTHENTICATED" ? 401 : error.code === "VALIDATION_ERROR" ? 400 : 403, error.message);
    }
    console.error(`[api/${resource}] error:`, error);
    return fail(502, "FM cost storage is unavailable.");
  }
}
