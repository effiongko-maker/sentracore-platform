import { NextResponse } from "next/server";
import { gateApiCapability } from "@/lib/access/gateApi";
import {
  capabilityForOperationalProxyAction,
  type OperationalProxyResource,
} from "@/lib/access/operationalApiGate";
import {
  postToAppsScript,
  type AppsScriptProxyBody,
} from "@/services/api/appsScriptProxy";

/**
 * Shared gate + proxy for operational registers (WO / MNT / INC / Approvals).
 */
export async function postGatedOperationalProxy(
  request: Request,
  resource: OperationalProxyResource,
  logPrefix: string
): Promise<NextResponse> {
  try {
    let body: AppsScriptProxyBody = {};

    try {
      body = (await request.json()) as AppsScriptProxyBody;
    } catch {
      body = {};
    }

    const action = String(body.action ?? "getAll");
    const capability = capabilityForOperationalProxyAction(resource, action);
    const gate = await gateApiCapability(capability);
    if (!gate.ok) return gate.response;

    const data = await postToAppsScript(
      body,
      { resource, action: "getAll" },
      logPrefix
    );

    return NextResponse.json(data, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error(`[${logPrefix}] proxy error:`, error);

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
