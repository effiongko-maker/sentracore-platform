import { NextResponse } from "next/server";
import { gateApiCapability } from "@/lib/access/gateApi";
import { capabilityForOperationalProxyAction } from "@/lib/access/operationalApiGate";
import {
  postToAppsScript,
  type AppsScriptProxyBody,
} from "@/services/api/appsScriptProxy";

/**
 * Server-only proxy: browser → /api/approvals → Apps Script.
 * Reads: ops.view. Mutations: approvals.manage.
 *
 * Decision fields / terminal decision statuses must use the
 * approval.record_decision server action (FM step-up / SA override).
 */

const BLOCKED_DECISION_KEYS = [
  "decisionAt",
  "decisionOutcome",
  "decisionNotes",
  "decisionReference",
  "approvedAmount",
  "approvedByUserId",
  "decisionDocumentFileName",
  "decisionDocumentFileMime",
  "decisionDocumentFileSize",
  "Decision At",
  "Decision Outcome",
  "Decision Notes",
  "Decision Reference",
  "Approved Amount",
  "Approved By",
] as const;

const DECISION_STATUSES = new Set([
  "approved",
  "rejected",
  "partially_approved",
  "partially approved",
]);

function payloadHasDecisionMutation(payload: Record<string, unknown>): boolean {
  for (const key of BLOCKED_DECISION_KEYS) {
    if (key in payload && payload[key] !== undefined) return true;
  }
  const status = String(payload.status ?? payload.Status ?? "")
    .trim()
    .toLowerCase();
  return DECISION_STATUSES.has(status);
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
    const capability = capabilityForOperationalProxyAction("approvals", action);
    const gate = await gateApiCapability(capability);
    if (!gate.ok) return gate.response;

    if (action === "update") {
      const payload =
        body.payload && typeof body.payload === "object"
          ? (body.payload as Record<string, unknown>)
          : {};
      if (payloadHasDecisionMutation(payload)) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Approval decisions must be recorded via the approval.record_decision server action.",
            data: null,
          },
          { status: 403 }
        );
      }
    }

    const data = await postToAppsScript(
      body,
      { resource: "approvals", action: "getAll" },
      "api/approvals"
    );

    return NextResponse.json(data, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[api/approvals] proxy error:", error);
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
