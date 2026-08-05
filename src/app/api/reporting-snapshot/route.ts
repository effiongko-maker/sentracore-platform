import { NextResponse } from "next/server";
import {
  postToAppsScript,
  type AppsScriptProxyBody,
} from "@/services/api/appsScriptProxy";

/**
 * Server-only proxy: browser → /api/reporting-snapshot → Apps Script.
 *
 * PERFORMANCE OPTIMIZATION LAYER — reads the Sheets-backed REPORTING_SNAPSHOT.
 * Can later point at a database-backed repository without changing
 * DashboardService → ReportingService application architecture.
 *
 * Operational diagnostics (read-only):
 *   GET  /api/reporting-snapshot?action=diagnostics
 *   POST /api/reporting-snapshot  { "action": "diagnostics" }
 */

async function proxyReportingSnapshot(
  body: AppsScriptProxyBody,
  defaultAction: string
) {
  try {
    const data = await postToAppsScript(
      body,
      { resource: "reporting-snapshot", action: defaultAction },
      "api/reporting-snapshot"
    );

    return NextResponse.json(data, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[api/reporting-snapshot] proxy error:", error);

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "diagnostics";

  return proxyReportingSnapshot(
    {
      resource: "reporting-snapshot",
      action,
      payload: {},
    },
    action
  );
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const queryAction = searchParams.get("action");

  let body: AppsScriptProxyBody = {};
  try {
    body = (await request.json()) as AppsScriptProxyBody;
  } catch {
    body = {};
  }

  const action = queryAction || body.action || "getSnapshot";

  return proxyReportingSnapshot(
    {
      resource: body.resource ?? "reporting-snapshot",
      action,
      payload: body.payload ?? {},
    },
    action
  );
}
