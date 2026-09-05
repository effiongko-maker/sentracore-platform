import { NextResponse } from "next/server";
import { gateApiCapability } from "@/lib/access/gateApi";
import { isWriteAction } from "@/lib/access/server";
import {
  postToAppsScript,
  type AppsScriptProxyBody,
} from "@/services/api/appsScriptProxy";

/**
 * Server-only proxy: browser → /api/users → Apps Script.
 * Reads require users.view; mutations require users.manage.
 */

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

    const data = await postToAppsScript(
      body,
      { resource: "users", action: "getAll" },
      "api/users"
    );

    return NextResponse.json(data, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[api/users] proxy error:", error);

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
