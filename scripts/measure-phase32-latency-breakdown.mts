/**
 * Phase 32 — closure latency measurements (script context).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/measure-phase32-latency-breakdown.mts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { orchestrateCreateWorkOrderFromMaintenance } from "../src/lib/operational/orchestration";
import { transitionMaintenance } from "../src/lib/operational/lifecycle/transitionOperationalEntity";
import type { ActionContext } from "../src/lib/actions/types";
import { MaintenanceService } from "../src/services/maintenance/MaintenanceService";
import { postToAppsScriptData } from "../src/services/api/appsScriptProxy";

function loadEnvLocal() {
  const path = resolve(".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
}

loadEnvLocal();

async function buildContext(): Promise<ActionContext> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  const sb = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: org } = await sb
    .from("organisations")
    .select("id, name, slug, status")
    .eq("slug", "paychex")
    .maybeSingle();
  if (!org) throw new Error("org missing");

  const { data: profile } = await sb
    .from("profiles")
    .select("id, first_name, last_name, full_name, organisation_id, status")
    .eq("organisation_id", org.id)
    .limit(1)
    .maybeSingle();
  if (!profile) throw new Error("profile missing");

  const { data: moduleDef } = await sb
    .from("modules")
    .select("id, slug")
    .eq("slug", "facility_management")
    .maybeSingle();
  const { data: orgModule } = await sb
    .from("organisation_modules")
    .select("id, organisation_id, module_id, status")
    .eq("organisation_id", org.id)
    .eq("module_id", moduleDef!.id)
    .maybeSingle();

  const moduleRow = {
    id: String(orgModule!.id),
    moduleId: String(orgModule!.module_id),
    slug: "facility_management" as const,
    name: "Facility Management",
    status: "enabled" as const,
  };

  return {
    userId: String(profile.id),
    email: "validation@sentracore.local",
    profile: {
      id: String(profile.id),
      firstName: null,
      lastName: null,
      fullName: "Validation",
      avatarUrl: null,
      jobTitle: null,
      organisationId: String(org.id),
      status: "active",
    },
    organisation: {
      id: String(org.id),
      name: String(org.name),
      slug: String(org.slug),
      status: "active",
    },
    roleAssignments: [],
    roleSlugs: ["organisation_owner"],
    enabledModules: [moduleRow as never],
    department: null,
    module: moduleRow as never,
    authz: {
      hasRole: () => true,
      hasPlatformRole: () => true,
      hasOrganisationRole: () => true,
      hasDepartmentRole: () => true,
      isPlatformSuperAdmin: () => true,
    },
    now: new Date().toISOString(),
  };
}

async function main() {
  const stamp = Date.now();
  const context = await buildContext();
  const report: Record<string, unknown> = {
    measuredAt: new Date().toISOString(),
    phase: 32,
    context: "script",
  };

  const probe = (await postToAppsScriptData(
    {
      resource: "maintenance",
      action: "update",
      payload: {
        id: (
          await MaintenanceService.createMaintenance({
            title: `P32 marker ${stamp}`,
            facilityId: "FAC-0001",
            type: "corrective",
            source: "manual",
            priority: "medium",
            status: "requested",
            reportedAt: new Date().toISOString(),
          })
        ).id,
        _returnPreviousStatus: true,
      },
    },
    { resource: "maintenance", action: "update" },
    "phase32-marker-probe"
  )) as Record<string, unknown>;
  report.live_build_marker = probe._buildMarker;
  report.live_previous_status = probe._previousStatus;

  const saveMaint = await MaintenanceService.createMaintenance({
    title: `P32 save ${stamp}`,
    facilityId: "FAC-0001",
    type: "corrective",
    source: "manual",
    priority: "medium",
    status: "in_progress",
    reportedAt: new Date().toISOString(),
  });

  let t0 = performance.now();
  await transitionMaintenance({
    entityId: saveMaint.id,
    update: { title: `P32 field ${stamp}`, updatedByUserId: context.userId },
    context,
  });
  report.simple_field_save_ms = Math.round(performance.now() - t0);

  const statusMaint = await MaintenanceService.createMaintenance({
    title: `P32 status ${stamp}`,
    facilityId: "FAC-0001",
    type: "corrective",
    source: "manual",
    priority: "medium",
    status: "requested",
    reportedAt: new Date().toISOString(),
  });

  t0 = performance.now();
  await transitionMaintenance({
    entityId: statusMaint.id,
    update: { status: "in_progress", updatedByUserId: context.userId },
    context,
  });
  report.status_transition_ms = Math.round(performance.now() - t0);

  const woMaint = await MaintenanceService.createMaintenance({
    title: `P32 wo ${stamp}`,
    facilityId: "FAC-0001",
    type: "corrective",
    source: "manual",
    priority: "medium",
    status: "in_progress",
    reportedAt: new Date().toISOString(),
    requiresWorkOrder: true,
  });

  t0 = performance.now();
  await orchestrateCreateWorkOrderFromMaintenance({
    maintenanceId: woMaint.id,
    context,
  });
  report.create_wo_from_work_ms = Math.round(performance.now() - t0);

  console.log(JSON.stringify(report, null, 2));
  console.log("\nPHASE_32_LATENCY_BREAKDOWN: PASS");
}

main().catch((err) => {
  console.error("PHASE_32_LATENCY_BREAKDOWN: FAIL", err);
  process.exit(1);
});
