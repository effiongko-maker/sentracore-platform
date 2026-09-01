/**
 * Phase 32 — verify status-transition pre-read elimination + _previousStatus contract.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-phase32-status-transition-read-elimination.mts
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
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

async function probeLiveMarker() {
  const stamp = Date.now();
  const created = await MaintenanceService.createMaintenance({
    title: `P32 probe ${stamp}`,
    description: "build marker probe",
    facilityId: "FAC-0001",
    type: "corrective",
    source: "manual",
    priority: "medium",
    status: "requested",
    reportedAt: new Date().toISOString(),
  });

  const raw = (await postToAppsScriptData(
    {
      resource: "maintenance",
      action: "update",
      payload: {
        id: created.id,
        title: `P32 probe updated ${stamp}`,
        _returnPreviousStatus: true,
        _auditTiming: true,
      },
    },
    { resource: "maintenance", action: "update" },
    "phase32-live-probe"
  )) as Record<string, unknown>;

  return {
    maintenanceId: created.id,
    buildMarker: raw._buildMarker,
    previousStatus: raw._previousStatus,
    hasPreviousStatus: raw._previousStatus != null,
    serverTimings: raw._serverTimings,
  };
}

async function main() {
  const stamp = Date.now();
  const context = await buildContext();
  const report: Record<string, unknown> = {
    measuredAt: new Date().toISOString(),
    phase: 32,
  };

  const liveProbe = await probeLiveMarker();
  report.liveProbe = liveProbe;
  const liveReady = liveProbe.hasPreviousStatus === true;
  report.live_v078_ready = liveReady;

  if (!liveReady) {
    console.log(JSON.stringify(report, null, 2));
    console.error(
      "PHASE_32_VERIFY: BLOCKED — live GAS does not return _previousStatus. Deploy v0.7.8 first."
    );
    process.exit(2);
  }

  const maint = await MaintenanceService.createMaintenance({
    title: `P32 contract ${stamp}`,
    description: "phase32 contract",
    facilityId: "FAC-0001",
    type: "corrective",
    source: "manual",
    priority: "medium",
    status: "requested",
    reportedAt: new Date().toISOString(),
  });
  report.fixtureId = maint.id;

  // C1 — simple field edit
  let t0 = performance.now();
  const c1 = await transitionMaintenance({
    entityId: maint.id,
    update: {
      title: `P32 title ${stamp}`,
      updatedByUserId: context.userId,
    },
    context,
  });
  report.c1_simple_edit_ms = Math.round(performance.now() - t0);
  const c1Checks = {
    statusUnchanged: c1.entity.status === "requested",
    noStatusChange: c1.statusChanged === false,
    noEvent: c1.eventEmitted === false,
    title: c1.entity.title === `P32 title ${stamp}`,
  };
  report.c1 = c1Checks;

  // C2 — status transition requested → in_progress
  t0 = performance.now();
  const c2 = await transitionMaintenance({
    entityId: maint.id,
    update: {
      status: "in_progress",
      updatedByUserId: context.userId,
    },
    context,
  });
  report.c2_status_transition_ms = Math.round(performance.now() - t0);
  const c2Checks = {
    previousStatus: c2.previousStatus,
    nextStatus: c2.entity.status,
    statusChanged: c2.statusChanged === true,
    eventEmitted: c2.eventEmitted === true,
    correctPrevious: c2.previousStatus === "requested",
  };
  report.c2 = c2Checks;

  // C3 — completion with invalid request id (documents eval path runs)
  const completeMaint = await MaintenanceService.createMaintenance({
    title: `P32 complete ${stamp}`,
    description: "completion probe",
    facilityId: "FAC-0001",
    type: "corrective",
    source: "manual",
    priority: "medium",
    status: "in_progress",
    reportedAt: new Date().toISOString(),
    sourceRequestId: "REQ-PROBE-NOOP",
  });
  report.completeFixtureId = completeMaint.id;

  t0 = performance.now();
  const c3 = await transitionMaintenance({
    entityId: completeMaint.id,
    update: {
      status: "completed",
      completedAt: new Date().toISOString(),
      completionNotes: "p32 completion probe",
      updatedByUserId: context.userId,
    },
    context,
  });
  report.c3_completed_ms = Math.round(performance.now() - t0);
  report.c3 = {
    previousStatus: c3.previousStatus,
    status: c3.entity.status,
    statusChanged: c3.statusChanged === true,
    eventEmitted: c3.eventEmitted === true,
    sourceRequestId: c3.entity.sourceRequestId,
    requestEvalAttempted: true,
  };
  report.c3_note =
    "Request evaluation invoked for sourceRequestId; REQ-PROBE-NOOP may not exist — eval error is expected and non-blocking.";

  writeFileSync(
    "/tmp/phase32-fixtures.json",
    JSON.stringify(
      {
        workId: maint.id,
        completeId: completeMaint.id,
        buildMarker: liveProbe.buildMarker,
      },
      null,
      2
    )
  );

  const failed: string[] = [];
  if (!c1Checks.statusUnchanged) failed.push("c1.statusUnchanged");
  if (!c1Checks.noStatusChange) failed.push("c1.noStatusChange");
  if (!c1Checks.noEvent) failed.push("c1.noEvent");
  if (!c2Checks.correctPrevious) failed.push("c2.previousStatus");
  if (!c2Checks.statusChanged) failed.push("c2.statusChanged");
  if (!c2Checks.eventEmitted) failed.push("c2.eventEmitted");
  if (c3.previousStatus !== "in_progress") failed.push("c3.previousStatus");

  console.log(JSON.stringify(report, null, 2));
  if (failed.length) {
    console.error("PHASE_32_VERIFY: FAIL", failed);
    process.exit(1);
  }
  console.log("PHASE_32_VERIFY: PASS");
}

main().catch((err) => {
  console.error("PHASE_32_VERIFY: FAIL", err);
  process.exit(1);
});
