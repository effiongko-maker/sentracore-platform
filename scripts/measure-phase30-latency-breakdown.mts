/**
 * Phase 30 — layer-by-layer latency breakdown (live, script context).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/measure-phase30-latency-breakdown.mts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "../src/utils/supabase/admin";
import { orchestrateCreateWorkOrderFromMaintenance } from "../src/lib/operational/orchestration";
import { transitionMaintenance } from "../src/lib/operational/lifecycle/transitionOperationalEntity";
import {
  maintenanceWorkOrderLeaseKey,
  runExclusiveOperationalAction,
} from "../src/lib/operational/idempotency/actionLease";
import type { ActionContext } from "../src/lib/actions/types";
import { MaintenanceService } from "../src/services/maintenance/MaintenanceService";
import { WorkOrderService } from "../src/services/workOrders/WorkOrderService";
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

async function measureLeaseOps(
  organisationId: string,
  scopeKey: string
): Promise<Stage[]> {
  const stages: Stage[] = [];
  const supa = createAdminClient();

  let t0 = performance.now();
  const { data: readRow } = await supa
    .from("operational_action_leases")
    .select("id, status, updated_at")
    .eq("organisation_id", organisationId)
    .eq("scope_key", scopeKey)
    .maybeSingle();
  mark(stages, "lease_read", t0);

  t0 = performance.now();
  const now = new Date().toISOString();
  const probeKey = `${scopeKey}:probe:${Date.now()}`;
  const { error: insertErr } = await supa
    .from("operational_action_leases")
    .insert({
      organisation_id: organisationId,
      scope_key: probeKey,
      status: "in_progress",
      created_at: now,
      updated_at: now,
    });
  mark(stages, "lease_insert_probe", t0);

  if (!insertErr) {
    t0 = performance.now();
    await supa
      .from("operational_action_leases")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("organisation_id", organisationId)
      .eq("scope_key", probeKey);
    mark(stages, "lease_complete_probe", t0);

    t0 = performance.now();
    await supa
      .from("operational_action_leases")
      .delete()
      .eq("organisation_id", organisationId)
      .eq("scope_key", probeKey);
    mark(stages, "lease_delete_probe", t0);
  } else {
    stages.push({ stage: "lease_insert_probe", ms: stages.at(-1)?.ms ?? 0 });
  }

  void readRow;
  return stages;
}

async function measureCreateWoPath(context: ActionContext, maintenanceId: string) {
  const stages: Stage[] = [];
  const scopeKey = maintenanceWorkOrderLeaseKey(maintenanceId);

  let t0 = performance.now();
  await MaintenanceService.getMaintenance(maintenanceId);
  mark(stages, "recovery_read_pre_lease", t0);

  const leaseStages = await measureLeaseOps(
    context.organisation.id,
    scopeKey
  );
  stages.push(...leaseStages);

  t0 = performance.now();
  await orchestrateCreateWorkOrderFromMaintenance({
    maintenanceId,
    context,
  });
  mark(stages, "orchestrate_full_including_lease_events", t0);

  return { stages };
}

async function measureSimpleSave(context: ActionContext, maintenanceId: string) {
  const stages: Stage[] = [];

  let t0 = performance.now();
  await MaintenanceService.getMaintenance(maintenanceId);
  mark(stages, "transition_read", t0);

  t0 = performance.now();
  await MaintenanceService.updateMaintenance(maintenanceId, {
    title: `P30 save ${Date.now()}`,
    status: "in_progress",
    priority: "high",
    updatedByUserId: context.userId,
  });
  mark(stages, "transition_write", t0);

  t0 = performance.now();
  await transitionMaintenance({
    entityId: maintenanceId,
    update: {
      title: `P30 save full ${Date.now()}`,
      status: "in_progress",
      priority: "medium",
      updatedByUserId: context.userId,
    },
    context,
    options: { transitionSource: "form_update" },
  });
  mark(stages, "transition_full_with_event_eval", t0);

  return stages;
}

async function main() {
  const stamp = Date.now();
  const report: Record<string, unknown> = { measuredAt: new Date().toISOString() };

  let t0 = performance.now();
  const context = await buildContext();
  report.context_build_ms = Math.round(performance.now() - t0);

  const woMaint = await MaintenanceService.createMaintenance({
    title: `P30 latency WO ${stamp}`,
    description: "phase30 breakdown",
    facilityId: "FAC-0001",
    type: "corrective",
    source: "manual",
    priority: "medium",
    status: "in_progress",
    reportedAt: new Date().toISOString(),
    requiresWorkOrder: true,
  });

  const saveMaint = await MaintenanceService.createMaintenance({
    title: `P30 latency save ${stamp}`,
    description: "phase30 save",
    facilityId: "FAC-0001",
    type: "corrective",
    source: "manual",
    priority: "medium",
    status: "scheduled",
    reportedAt: new Date().toISOString(),
  });

  const gasProbeMaint = await MaintenanceService.createMaintenance({
    title: `P30 gas probe ${stamp}`,
    description: "direct gas timing",
    facilityId: "FAC-0001",
    type: "corrective",
    source: "manual",
    priority: "medium",
    status: "in_progress",
    reportedAt: new Date().toISOString(),
    requiresWorkOrder: true,
  });

  report.create_wo_path = await measureCreateWoPath(context, woMaint.id);

  t0 = performance.now();
  const gasDirect = (await postToAppsScriptData(
    {
      resource: "work-orders",
      action: "createFromMaintenance",
      payload: {
        maintenanceId: gasProbeMaint.id,
        actorUserId: context.userId,
      },
    },
    { resource: "work-orders", action: "createFromMaintenance" },
    "phase30-gas-direct"
  )) as Record<string, unknown>;
  report.gas_direct_http_ms = Math.round(performance.now() - t0);
  report.gas_direct_timings = gasDirect.timings;

  t0 = performance.now();
  const gasIdem = (await postToAppsScriptData(
    {
      resource: "work-orders",
      action: "createFromMaintenance",
      payload: { maintenanceId: gasProbeMaint.id, actorUserId: context.userId },
    },
    { resource: "work-orders", action: "createFromMaintenance" },
    "phase30-gas-idem"
  )) as Record<string, unknown>;
  report.gas_idempotent_http_ms = Math.round(performance.now() - t0);
  report.gas_idempotent = {
    created: gasIdem.created,
    woId: (gasIdem.workOrder as { id?: string })?.id,
  };
  report.simple_save = await measureSimpleSave(context, saveMaint.id);

  t0 = performance.now();
  await transitionMaintenance({
    entityId: saveMaint.id,
    update: {
      status: "on_hold",
      holdReason: "p30 status probe",
      updatedByUserId: context.userId,
    },
    context,
    options: { transitionSource: "form_update" },
  });
  report.status_transition_ms = Math.round(performance.now() - t0);

  // Idempotency on same maintenance (already has WO from orchestrate call)
  t0 = performance.now();
  const idem = await runExclusiveOperationalAction({
    organisationId: context.organisation.id,
    scopeKey: maintenanceWorkOrderLeaseKey(woMaint.id),
    actorProfileId: context.profile.id,
    entityType: "work_order",
    recoverExisting: async () => {
      const fresh = await MaintenanceService.getMaintenance(woMaint.id);
      if (!fresh?.workOrderId) return null;
      const wo = await WorkOrderService.getWorkOrder(fresh.workOrderId);
      if (!wo) return null;
      return { entityId: wo.id, value: wo };
    },
    create: async () => {
      throw new Error("should not create on idempotent path");
    },
  });
  report.idempotent_recover_ms = Math.round(performance.now() - t0);
  report.idempotent_wo_id = idem.id;

  console.log(JSON.stringify(report, null, 2));
  console.log("\nPHASE_30_LATENCY_BREAKDOWN: PASS");
}

main().catch((err) => {
  console.error("PHASE_30_LATENCY_BREAKDOWN: FAIL", err);
  process.exit(1);
});
