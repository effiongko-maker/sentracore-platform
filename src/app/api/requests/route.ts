import { NextResponse } from "next/server";
import {
  postToAppsScript,
  type AppsScriptProxyBody,
} from "@/services/api/appsScriptProxy";

/**
 * Server-only proxy: browser → /api/requests → Apps Script.
 *
 * Treatment mutations (status / relationship arrays) must use
 * request.treatment.* server actions — blocked here for client proxies.
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

export async function POST(request: Request) {
  try {
    let body: AppsScriptProxyBody = {};

    try {
      body = (await request.json()) as AppsScriptProxyBody;
    } catch {
      body = {};
    }

    const action = String(body.action || "getAll");
    if (action === "update" || action === "create" || action === "deactivate") {
      const payload =
        body.payload && typeof body.payload === "object"
          ? (body.payload as Record<string, unknown>)
          : {};

      if (action === "update") {
        for (const key of BLOCKED_UPDATE_KEYS) {
          if (key in payload && payload[key] !== undefined) {
            return NextResponse.json(
              {
                success: false,
                message:
                  "Request status and treatment links must be updated via server actions.",
                data: null,
              },
              { status: 403 }
            );
          }
        }
      }

      if (action === "deactivate") {
        return NextResponse.json(
          {
            success: false,
            message: "Cancel Request via the Request treatment server action.",
            data: null,
          },
          { status: 403 }
        );
      }

      if (action === "create") {
        // Queue create is retired; intake is /occupant-requests.
        // Allow only if no relationship arrays are being seeded.
        for (const key of [
          "maintenanceIds",
          "incidentIds",
          "workOrderIds",
        ] as const) {
          const value = payload[key];
          if (Array.isArray(value) && value.length > 0) {
            return NextResponse.json(
              {
                success: false,
                message:
                  "Cannot seed treatment links on Request create via API proxy.",
                data: null,
              },
              { status: 403 }
            );
          }
        }
      }
    }

    const data = await postToAppsScript(
      body,
      { resource: "requests", action: "getAll" },
      "api/requests"
    );

    return NextResponse.json(data, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[api/requests] proxy error:", error);

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
