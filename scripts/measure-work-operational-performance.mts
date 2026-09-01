/**
 * Phase 28C — measure Work operational paths (server-side, live Apps Script).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/measure-work-operational-performance.mts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { orchestrateCreateWorkOrderFromMaintenance } from "../src/lib/operational/orchestration";
import { transitionMaintenance } from "../src/lib/operational/lifecycle/transitionOperationalEntity";
import type { ActionContext } from "../src/lib/actions/types";
import { MaintenanceService } from "../src/services/maintenance/MaintenanceService";

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

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function buildContext(): Promise<ActionContext> {
  const sb = admin();
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

async function time<T>(label: string, fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const start = performance.now();
  const value = await fn();
  const ms = Math.round(performance.now() - start);
  console.log(`${label}: ${ms}ms`);
  return { ms, value };
}

async function main() {
  const context = await buildContext();
  const stamp = Date.now();

  const maintenance = await MaintenanceService.createMaintenance({
    title: `Perf MNT ${stamp}`,
    description: "phase 28c measure",
    facilityId: "FAC-0001",
    type: "corrective",
    source: "manual",
    priority: "medium",
    status: "scheduled",
    reportedAt: new Date().toISOString(),
  });

  const simpleSave = await time("simple_work_save", async () => {
    const result = await transitionMaintenance({
      entityId: maintenance.id,
      update: {
        title: `Perf MNT updated ${stamp}`,
        status: "in_progress",
        priority: "high",
        updatedByUserId: context.userId,
      },
      context,
      options: { transitionSource: "form_update" },
    });
    return result.entity;
  });

  const statusTransition = await time("status_transition_hold", async () => {
    return transitionMaintenance({
      entityId: maintenance.id,
      update: {
        status: "on_hold",
        holdReason: "perf probe",
        updatedByUserId: context.userId,
      },
      context,
      options: { transitionSource: "form_update" },
    });
  });

  const woMaintenance = await MaintenanceService.createMaintenance({
    title: `Perf WO MNT ${stamp}`,
    description: "phase 28c wo measure",
    facilityId: "FAC-0001",
    type: "corrective",
    source: "manual",
    priority: "medium",
    status: "in_progress",
    reportedAt: new Date().toISOString(),
  });

  const createWo = await time("create_wo_from_work_detail", async () =>
    orchestrateCreateWorkOrderFromMaintenance({
      maintenanceId: woMaintenance.id,
      context,
    })
  );

  const treatClean = await time("create_wo_from_treat_clean", async () => {
    const m = await MaintenanceService.createMaintenance({
      title: `Perf Treat clean ${stamp}`,
      description: "no pre-save",
      facilityId: "FAC-0001",
      type: "corrective",
      source: "manual",
      priority: "medium",
      status: "in_progress",
      reportedAt: new Date().toISOString(),
    });
    return orchestrateCreateWorkOrderFromMaintenance({
      maintenanceId: m.id,
      context,
    });
  });

  const treatDirty = await time("create_wo_from_treat_dirty", async () => {
    const m = await MaintenanceService.createMaintenance({
      title: `Perf Treat dirty ${stamp}`,
      description: "with pre-save",
      facilityId: "FAC-0001",
      type: "corrective",
      source: "manual",
      priority: "medium",
      status: "in_progress",
      reportedAt: new Date().toISOString(),
    });
    const save = await transitionMaintenance({
      entityId: m.id,
      update: {
        title: `Perf Treat dirty edited ${stamp}`,
        status: "in_progress",
        priority: "high",
        updatedByUserId: context.userId,
      },
      context,
      options: { transitionSource: "form_update" },
    });
    return orchestrateCreateWorkOrderFromMaintenance({
      maintenanceId: m.id,
      context,
    });
  });

  console.log("\n=== PHASE_28C_MEASUREMENT_SUMMARY ===");
  console.log(
    JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        simple_work_save_ms: simpleSave.ms,
        status_transition_ms: statusTransition.ms,
        create_wo_from_work_detail_ms: createWo.ms,
        create_wo_from_treat_clean_ms: treatClean.ms,
        create_wo_from_treat_dirty_ms: treatDirty.ms,
        phase28b_baseline: {
          simple_work_save_ms: 12100,
          status_transition_ms: 9500,
          create_wo_from_work_detail_ms: 29000,
          create_wo_from_treat_ms: 41000,
        },
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error("MEASUREMENT FAILED", err);
  process.exit(1);
});
