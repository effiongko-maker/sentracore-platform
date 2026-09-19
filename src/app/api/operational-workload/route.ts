import { NextResponse } from "next/server";
import { gateApiCapability } from "@/lib/access/gateApi";
import type { ApiRequestEnvelope } from "@/lib/api/requestEnvelope";
import { composeWorkloadSummary } from "@/lib/operational/workload/composeWorkloadSummary";
import { FmIncidentRepository } from "@/modules/incidents/server/FmIncidentRepository";
import { resolveFmIncidentOrganisation } from "@/modules/incidents/server/FmIncidentServerService";
import { FmWorkRepository } from "@/modules/maintenance/server/FmWorkRepository";
import { FmWorkInstructionRepository } from "@/modules/work-orders/server/FmWorkInstructionRepository";

/**
 * Server-only bounded People / Asset workload summaries. Requires ops.view.
 *
 * Phase 2E: composed entirely from Supabase — Work Instructions (people +
 * assets), Work and Incidents (assets). No Apps Script call. If ANY source
 * fails the request FAILS: a workload is never reported with a silent zero.
 */
export async function POST(request: Request) {
  try {
    const gate = await gateApiCapability("ops.view");
    if (!gate.ok) return gate.response;

    let body: ApiRequestEnvelope = {};
    try {
      body = (await request.json()) as ApiRequestEnvelope;
    } catch {
      body = {};
    }
    const payload =
      body.payload && typeof body.payload === "object"
        ? (body.payload as Record<string, unknown>)
        : {};
    const strings = (value: unknown) =>
      Array.isArray(value) ? value.map((v) => String(v).trim()).filter(Boolean) : [];
    const assetIds = strings(payload.assetIds);
    const userIds = strings(payload.userIds);

    const { organisationId } = resolveFmIncidentOrganisation(gate.session);
    const [instructions, workByAsset, incidentsByAsset] = await Promise.all([
      new FmWorkInstructionRepository(organisationId).activeWorkload({ userIds, assetIds }),
      assetIds.length ? new FmWorkRepository(organisationId).activeByAssetIds(assetIds) : new Map<string, string[]>(),
      assetIds.length ? new FmIncidentRepository(organisationId).activeByAssetIds(assetIds) : new Map<string, string[]>(),
    ]);

    const summary = composeWorkloadSummary({
      instructionsByUser: instructions.byUser,
      instructionsByAsset: instructions.byAsset,
      workByAsset,
      incidentsByAsset,
    });
    return NextResponse.json(
      { success: true, message: "", data: summary },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[api/operational-workload] error:", error);
    return NextResponse.json(
      { success: false, message: "Workload sources are unavailable.", data: null },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
