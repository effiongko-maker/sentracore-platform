import { NextResponse } from "next/server";
import {
  getAppsScriptUrlForDiagnostics,
  postToAppsScript,
  summarizeAppsScriptUrl,
  type AppsScriptProxyBody,
} from "@/services/api/appsScriptProxy";

/**
 * Server-only proxy: browser → /api/assets → Apps Script.
 * Frontend must never call Apps Script directly.
 * Mirrors /api/facilities exactly.
 */

export async function POST(request: Request) {
  try {
    let body: AppsScriptProxyBody = {};

    try {
      body = (await request.json()) as AppsScriptProxyBody;
    } catch {
      body = {};
    }

    const action = body.action ?? "getAll";
    const execUrl = getAppsScriptUrlForDiagnostics();

    // TEMP DIAG — facility persistence investigation
    if (action === "update") {
      const payload =
        body.payload && typeof body.payload === "object"
          ? (body.payload as Record<string, unknown>)
          : {};
      console.info("[api/assets][asset-diag] proxy → Apps Script", {
        exec: summarizeAppsScriptUrl(execUrl),
        execFullLength: execUrl.length,
        assetId: payload.id,
        facility: payload.facility,
        name: payload.name,
      });
    }

    const data = await postToAppsScript(
      body,
      { resource: "assets", action: "getAll" },
      "api/assets"
    );

    if (action === "update") {
      const envelope = data as {
        success?: boolean;
        data?: { facility?: unknown; _diag?: unknown };
      };
      console.info("[api/assets][asset-diag] Apps Script response", {
        success: envelope?.success,
        returnedFacility: envelope?.data?.facility,
        diag: envelope?.data?._diag ?? null,
        exec: summarizeAppsScriptUrl(execUrl),
      });
    }

    return NextResponse.json(data, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "X-Apps-Script-Exec": summarizeAppsScriptUrl(execUrl),
      },
    });
  } catch (error) {
    console.error("[api/assets] proxy error:", error);

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
