import { NextResponse } from "next/server";
import { gateApiCapability } from "@/lib/access/gateApi";
import {
  postToAppsScript,
  type AppsScriptProxyBody,
} from "@/services/api/appsScriptProxy";
import { overlayIncidentWorkload } from "@/lib/operational/workload/overlayIncidentWorkload";
import { FmIncidentRepository } from "@/modules/incidents/server/FmIncidentRepository";
import { resolveFmIncidentOrganisation } from "@/modules/incidents/server/FmIncidentServerService";

/**
 * Server-only proxy: bounded People / Asset workload summaries.
 * Requires ops.view (operational register context).
 *
 * Phase 2D: the Incident component of the asset summary is Supabase-
 * authoritative. Apps Script still counts Sheet Incidents (it is frozen), so
 * that component is replaced here. If the Incident source fails the request
 * FAILS — an asset workload is never reported with a silent zero.
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

    const payload =
      body.payload && typeof body.payload === "object"
        ? (body.payload as Record<string, unknown>)
        : {};
    const assetIds = Array.isArray(payload.assetIds)
      ? payload.assetIds.map((id) => String(id))
      : [];
    if (assetIds.length > 0 && data && typeof data === "object") {
      const { organisationId } = resolveFmIncidentOrganisation(gate.session);
      const incidentsByAsset = await new FmIncidentRepository(
        organisationId
      ).activeByAssetRefs(assetIds);
      const envelope = data as { data?: unknown };
      envelope.data = overlayIncidentWorkload(
        envelope.data as Parameters<typeof overlayIncidentWorkload>[0],
        assetIds,
        incidentsByAsset
      );
    }

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
