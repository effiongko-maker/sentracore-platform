import { NextResponse } from "next/server";
import { gateApiCapability } from "@/lib/access/gateApi";
import {
  applyAuthorityToPayload,
  emitProtectedActionAudit,
  extractProtectedProof,
  gateProtectedActionOrResponse,
} from "@/lib/access/gateProtectedAction";
import { isWriteAction } from "@/lib/access/server";
import {
  postToAppsScript,
  type AppsScriptProxyBody,
} from "@/services/api/appsScriptProxy";

/**
 * Server-only proxy: browser → /api/cost-submissions → Apps Script.
 * Creates/updates require finance.create; status→submitted requires finance.submit.
 * Field edits on an existing submitted claim require finance.claim.edit_submitted
 * (forced server-side — client proof alone is not trusted).
 */

function isSubmitTransition(body: AppsScriptProxyBody): boolean {
  const action = String(body.action ?? "");
  if (action !== "update" && action !== "create") return false;
  const payload =
    body.payload && typeof body.payload === "object"
      ? (body.payload as Record<string, unknown>)
      : {};
  const status = String(payload.status ?? payload.Status ?? "")
    .trim()
    .toLowerCase();
  return status === "submitted";
}

function pickStatus(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const row = raw as Record<string, unknown>;
  return String(row.status ?? row.Status ?? "")
    .trim()
    .toLowerCase();
}

function unwrapRecord(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;
  if (root.data && typeof root.data === "object" && !Array.isArray(root.data)) {
    return root.data as Record<string, unknown>;
  }
  return root;
}

type SubmissionStatusLookup =
  | { ok: true; status: string | null }
  | { ok: false; error: string };

async function loadExistingSubmissionStatus(
  submissionId: string
): Promise<SubmissionStatusLookup> {
  if (!submissionId.trim()) return { ok: true, status: null };
  try {
    const result = (await postToAppsScript(
      {
        resource: "cost-submissions",
        action: "getById",
        payload: { submissionId },
      },
      { resource: "cost-submissions", action: "getById" },
      "api/cost-submissions/status-check"
    )) as { data?: unknown; success?: boolean; message?: string } | unknown;

    const envelope =
      result && typeof result === "object"
        ? (result as {
            data?: unknown;
            success?: boolean;
            message?: string;
          })
        : null;

    if (envelope?.success === false) {
      return {
        ok: false,
        error: envelope.message || "Unable to verify cost submission status.",
      };
    }

    const record = unwrapRecord(envelope?.data ?? result);
    return { ok: true, status: pickStatus(record) || null };
  } catch (error) {
    console.warn("[api/cost-submissions] status lookup failed", error);
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to verify cost submission status.",
    };
  }
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
    let payload = body.payload;

    if (isWriteAction(action)) {
      const capability = isSubmitTransition(body)
        ? "finance.submit"
        : "finance.create";
      const gate = await gateApiCapability(capability);
      if (!gate.ok) return gate.response;

      const extracted = extractProtectedProof(payload);
      payload = extracted.sanitizedPayload;

      let requiresClaimEditProtection =
        extracted.actionId === "finance.claim.edit_submitted";

      if (action === "update" && !requiresClaimEditProtection) {
        const row =
          payload && typeof payload === "object"
            ? (payload as Record<string, unknown>)
            : {};
        const submissionId = String(
          row.submissionId ?? row.id ?? row["Submission ID"] ?? ""
        ).trim();
        const nextStatus = String(row.status ?? row.Status ?? "")
          .trim()
          .toLowerCase();
        const statusLookup = await loadExistingSubmissionStatus(submissionId);
        if (!statusLookup.ok) {
          // Fail closed: never allow submitted-claim edits when status is unknown.
          return NextResponse.json(
            {
              success: false,
              message:
                statusLookup.error ||
                "Unable to verify claim status for protected-edit enforcement. Retry.",
              data: null,
            },
            { status: 503 }
          );
        }
        const existingStatus = statusLookup.status;
        if (existingStatus === "submitted") {
          const transitioningAway =
            nextStatus !== "" && nextStatus !== existingStatus;
          if (!transitioningAway) {
            requiresClaimEditProtection = true;
          }
        }
      }

      if (requiresClaimEditProtection) {
        if (
          extracted.actionId &&
          extracted.actionId !== "finance.claim.edit_submitted"
        ) {
          return NextResponse.json(
            {
              success: false,
              message:
                "Submitted claim edits require finance.claim.edit_submitted authorization.",
              data: null,
            },
            { status: 403 }
          );
        }

        const protectedGate = await gateProtectedActionOrResponse(
          "finance.claim.edit_submitted",
          extracted.stepUpPassword
        );
        if (!protectedGate.ok) return protectedGate.response;
        payload = applyAuthorityToPayload(
          extracted.sanitizedPayload,
          protectedGate.result
        );

        const data = await postToAppsScript(
          { ...body, payload },
          { resource: "cost-submissions", action: "getAll" },
          "api/cost-submissions"
        );

        await emitProtectedActionAudit({
          auth: protectedGate.result,
          entityId: String(
            (payload as Record<string, unknown>).submissionId ?? ""
          ),
          clientRequestId: extracted.clientRequestId,
          after: { resource: "cost-submissions", action },
        });

        return NextResponse.json(data, {
          status: 200,
          headers: { "Cache-Control": "no-store" },
        });
      }
    } else {
      const readGate = await gateApiCapability("finance.view");
      if (!readGate.ok) return readGate.response;
    }

    const data = await postToAppsScript(
      { ...body, payload },
      { resource: "cost-submissions", action: "getAll" },
      "api/cost-submissions"
    );

    return NextResponse.json(data, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[api/cost-submissions] proxy error:", error);
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unable to reach Apps Script.",
        data: null,
      },
      { status: 502 }
    );
  }
}
