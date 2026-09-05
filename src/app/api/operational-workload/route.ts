import { NextResponse } from "next/server";
import { gateApiCapability } from "@/lib/access/gateApi";
import {
  postToAppsScript,
  type AppsScriptProxyBody,
} from "@/services/api/appsScriptProxy";

/**
 * Server-only proxy: bounded People / Asset workload summaries.
 * Requires ops.view (operational register context).
 */
export async function POST(request: Request) {
  try {
    const gate = await gateApiCapability("ops.view");
    if (!gate.ok) return gate.response;

    let body: AppsScriptProxyBody = {};

    try {
      body = (await request.json()) as AppsScriptProxyBody;
    } catch {
      body = {};
    }

    const data = await postToAppsScript(
      body,
      { resource: "operational-workload", action: "getEntitySummary" },
      "api/operational-workload"
    );

    return NextResponse.json(data, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[api/operational-workload] proxy error:", error);

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
