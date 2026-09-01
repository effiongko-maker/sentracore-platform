/**
 * Phase 31 — save latency + sheet I/O breakdown (live script context).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/measure-phase31-latency-breakdown.mts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
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

type Stage = { stage: string; ms: number };

function mark(stages: Stage[], stage: string, start: number) {
  stages.push({ stage, ms: Math.round(performance.now() - start) });
}

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
    .select(
      "id, first_name, last_name, full_name, avatar_url, job_title, organisation_id, status"
    )
    .eq("organisation_id", org.id)
    .limit(1)
    .maybeSingle();
  if (!profile) throw new Error("profile missing");

  const { data: authUserData } = await sb.auth.admin.getUserById(
    String(profile.id)
  );

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
    email: authUserData.user?.email ?? "validation@sentracore.local",
    profile: {
      id: String(profile.id),
      firstName: profile.first_name ? String(profile.first_name) : null,
      lastName: profile.last_name ? String(profile.last_name) : null,
      fullName: String(profile.full_name ?? "Validation"),
      avatarUrl: profile.avatar_url ? String(profile.avatar_url) : null,
      jobTitle: profile.job_title ? String(profile.job_title) : null,
      organisationId: String(org.id),
      status: String(profile.status) as "active",
    },
    organisation: {
      id: String(org.id),
      name: String(org.name),
      slug: String(org.slug),
      status: String(org.status) as "active",
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
  const report: Record<string, unknown> = {
    measuredAt: new Date().toISOString(),
    phase: 31,
  };

  const context = await buildContext();

  const maint = await MaintenanceService.createMaintenance({
    title: `P31 latency ${stamp}`,
    description: "phase31 save probe",
    facilityId: "FAC-0001",
    type: "corrective",
    source: "manual",
    priority: "medium",
    status: "scheduled",
    reportedAt: new Date().toISOString(),
  });
  report.fixtureId = maint.id;

  const exp1: Stage[] = [];
  let t0 = performance.now();
  await MaintenanceService.getMaintenance(maint.id);
  mark(exp1, "getMaintenance", t0);
  report.experiment1_getMaintenance = exp1;

  const exp2: Stage[] = [];
  t0 = performance.now();
  const gasUpdate = (await postToAppsScriptData(
    {
      resource: "maintenance",
      action: "update",
      payload: {
        id: maint.id,
        title: `P31 field ${stamp}`,
        _auditTiming: true,
      },
    },
    { resource: "maintenance", action: "update" },
    "phase31-gas-update"
  )) as Record<string, unknown>;
  mark(exp2, "updateMaintenance_http", t0);
  report.experiment2_updateMaintenance = exp2;
  report.experiment2_gas_timings = gasUpdate._serverTimings;

  const exp3: Stage[] = [];
  t0 = performance.now();
  await transitionMaintenance({
    entityId: maint.id,
    update: {
      title: `P31 simple ${stamp}`,
      priority: "high",
      updatedByUserId: context.userId,
    },
    context,
    options: { transitionSource: "form_update" },
  });
  mark(exp3, "transitionMaintenance_simple_edit", t0);
  report.experiment3_simple_transition = exp3;

  const exp4: Stage[] = [];
  t0 = performance.now();
  await transitionMaintenance({
    entityId: maint.id,
    update: {
      status: "in_progress",
      updatedByUserId: context.userId,
    },
    context,
    options: { transitionSource: "form_update" },
  });
  mark(exp4, "transitionMaintenance_status_change", t0);
  report.experiment4_status_transition = exp4;

  const withRequest = await MaintenanceService.createMaintenance({
    title: `P31 complete ${stamp}`,
    description: "request completion probe",
    facilityId: "FAC-0001",
    type: "corrective",
    source: "manual",
    priority: "medium",
    status: "in_progress",
    reportedAt: new Date().toISOString(),
    sourceRequestId: "REQ-PROBE-NOOP",
  });
  report.completeFixtureId = withRequest.id;

  const exp5: Stage[] = [];
  t0 = performance.now();
  await transitionMaintenance({
    entityId: withRequest.id,
    update: {
      status: "completed",
      completedAt: new Date().toISOString(),
      completionNotes: "p31 probe",
      updatedByUserId: context.userId,
    },
    context,
    options: { transitionSource: "form_update" },
  });
  mark(exp5, "transitionMaintenance_completed", t0);
  report.experiment5_completed = exp5;

  const metaProbe = await MaintenanceService.updateMaintenanceWithMeta(
    maint.id,
    { title: `P31 meta ${stamp}`, updatedByUserId: context.userId }
  );
  report.previousStatus_meta =
    metaProbe.previousStatus === metaProbe.entity.status
      ? "unchanged_status_ok"
      : {
          previous: metaProbe.previousStatus,
          next: metaProbe.entity.status,
        };

  console.log(JSON.stringify(report, null, 2));
  console.log("\nPHASE_31_LATENCY_BREAKDOWN: PASS");
}

main().catch((err) => {
  console.error("PHASE_31_LATENCY_BREAKDOWN: FAIL", err);
  process.exit(1);
});
