/**
 * Phase 28C — Work operational performance quick wins.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-work-operational-performance-quick-wins.mts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { linkWorkOrderToMaintenance, normalizeMaintenanceRelationships } from "../src/lib/operational/relationships";
import { orchestrateCreateWorkOrderFromMaintenance } from "../src/lib/operational/orchestration";
import { transitionMaintenance } from "../src/lib/operational/lifecycle/transitionOperationalEntity";
import type { ActionContext } from "../src/lib/actions/types";
import { MaintenanceService } from "../src/services/maintenance/MaintenanceService";
import { WorkOrderService } from "../src/services/workOrders/WorkOrderService";
import { isMaintenanceFormDirty } from "../src/modules/maintenance/utils";
import { toCreateFormValues } from "../src/modules/maintenance/utils";
import type { Maintenance } from "../src/modules/maintenance/types";

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

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function read(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function verifyStaticContracts(): string[] {
  const results: string[] = [];

  // A — Treat save patches list instead of reloadFirstPage
  const workPage = read("src/modules/work/components/WorkPage.tsx");
  assert(workPage.includes("handleTreatSaved"), "handleTreatSaved exists");
  assert(workPage.includes("reconcileItem(updated)"), "Treat save reconciles item");
  assert(
    !workPage.includes("onSaved={async () => { await reloadFirstPage"),
    "Treat onSaved must not reloadFirstPage"
  );
  results.push("PASS A — Treat save uses reconcileItem (not reloadFirstPage)");

  const useWork = read("src/modules/work/hooks/useWork.ts");
  assert(useWork.includes("matchesWorkListFilters"), "filter reconciliation helper wired");
  assert(useWork.includes("const reconcileItem = useCallback"), "reconcileItem exported");
  results.push("PASS A — reconcileItem respects active filters");

  // B/C/D — orchestration quick wins
  const orch = read("src/lib/operational/orchestration/index.ts");
  assert(orch.includes("maintenanceSnapshot?: Maintenance"), "maintenanceSnapshot option");
  assert(
    orch.includes("options.maintenanceSnapshot ??"),
    "back-link read skipped when snapshot provided"
  );
  assert(
    !orch.match(
      /orchestrateCreateWorkOrderFromMaintenance[\s\S]*?return \{ maintenance: resolvedMaintenance, workOrder \};[\s\S]*?getMaintenance\(\s*options\.maintenanceId/
    ),
    "no final getMaintenance in create-from-maintenance response path"
  );
  assert(orch.includes('sideEffectMode: "after"'), "WO create defers side effects");
  assert(orch.includes("runOperationalSideEffects"), "uses established side-effect runner");
  assert(
    orch.includes("FACILITY_WORK_ORDER_CREATED"),
    "WO create event preserved"
  );
  assert(
    orch.includes("persistOperationalEventId(\"work_order\""),
    "operationalEventId persistence preserved (deferred)"
  );
  results.push("PASS B — no redundant final getMaintenance in create-from-maintenance");
  results.push("PASS C — back-link read skipped via maintenanceSnapshot");
  results.push("PASS D — FACILITY_WORK_ORDER_CREATED deferred via sideEffectMode after");

  // E/F — Treat create WO dirty gating
  const formModal = read("src/modules/maintenance/components/MaintenanceFormModal.tsx");
  assert(formModal.includes("isMaintenanceFormDirty"), "dirty helper used");
  assert(
    formModal.includes("if (formDirty) {") &&
      formModal.includes("const saveResult = await updateMaintenanceOperational"),
    "pre-save only when dirty"
  );
  assert(
    formModal.includes("await createWorkOrderFromMaintenance(maintenance.id)"),
    "create WO always invoked"
  );
  assert(
    formModal.includes("onSaved?.(result.data.maintenance)"),
    "create WO passes updated maintenance to onSaved"
  );
  results.push("PASS E — Treat create WO skips pre-save when form clean");
  results.push("PASS F — Treat create WO pre-saves when form dirty");

  const utils = read("src/modules/maintenance/utils.ts");
  assert(utils.includes("export function isMaintenanceFormDirty"), "dirty helper exported");
  results.push("PASS F — isMaintenanceFormDirty helper present");

  // Dirty helper sanity
  const sample = {
    id: "MNT-TEST",
    title: "Leak",
    description: "notes",
    facilityId: "FAC-0001",
    type: "corrective",
    source: "manual",
    priority: "medium",
    status: "in_progress",
    reportedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as Maintenance;
  const baseline = toCreateFormValues(sample);
  assert(!isMaintenanceFormDirty(sample, baseline), "identical form not dirty");
  assert(
    isMaintenanceFormDirty(sample, { ...baseline, title: "Changed" }),
    "title change is dirty"
  );
  results.push("PASS E/F — isMaintenanceFormDirty baseline semantics");

  return results;
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
  const { data: org, error: orgErr } = await sb
    .from("organisations")
    .select("id, name, slug, status")
    .eq("slug", "paychex")
    .maybeSingle();
  if (orgErr || !org) throw new Error(orgErr?.message ?? "org missing");

  const { data: profile, error: profileErr } = await sb
    .from("profiles")
    .select(
      "id, first_name, last_name, full_name, avatar_url, job_title, organisation_id, status"
    )
    .eq("organisation_id", org.id)
    .limit(1)
    .maybeSingle();
  if (profileErr || !profile) {
    throw new Error(profileErr?.message ?? "profile missing");
  }

  const { data: authUserData } = await sb.auth.admin.getUserById(
    String(profile.id)
  );
  const email = authUserData.user?.email ?? "validation@sentracore.local";

  const { data: moduleDef, error: moduleErr } = await sb
    .from("modules")
    .select("id, slug")
    .eq("slug", "facility_management")
    .maybeSingle();
  if (moduleErr || !moduleDef) {
    throw new Error(moduleErr?.message ?? "facility_management module missing");
  }

  const { data: orgModule, error: orgModErr } = await sb
    .from("organisation_modules")
    .select("id, organisation_id, module_id, status")
    .eq("organisation_id", org.id)
    .eq("module_id", moduleDef.id)
    .maybeSingle();
  if (orgModErr || !orgModule) {
    throw new Error(orgModErr?.message ?? "org module missing");
  }

  const moduleRow = {
    id: String(orgModule.id),
    moduleId: String(orgModule.module_id),
    slug: "facility_management" as const,
    name: "Facility Management",
    status: "enabled" as const,
  };

  return {
    userId: String(profile.id),
    email,
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

async function verifyLiveContracts(context: ActionContext): Promise<string[]> {
  const results: string[] = [];
  const stamp = Date.now();

  const maintenance = await MaintenanceService.createMaintenance({
    title: `Phase28C WO ${stamp}`,
    description: "quick wins verify",
    facilityId: "FAC-0001",
    type: "corrective",
    source: "manual",
    priority: "medium",
    status: "in_progress",
    reportedAt: new Date().toISOString(),
  });
  assert(!maintenance.workOrderId, "fresh maintenance has no WO");

  const created = await orchestrateCreateWorkOrderFromMaintenance({
    maintenanceId: maintenance.id,
    context,
  });

  // G — reciprocal links
  assert(created.workOrder.maintenanceId === maintenance.id, "WO → Work backlink");
  assert(
    created.maintenance.workOrderId === created.workOrder.id ||
      created.maintenance.workOrderIds?.includes(created.workOrder.id),
    "Work → WO backlink"
  );
  results.push("PASS G — Work ↔ WO reciprocal references on create");

  const reloadedMaint = await MaintenanceService.getMaintenance(maintenance.id);
  const reloadedWo = await WorkOrderService.getWorkOrder(created.workOrder.id);
  assert(reloadedWo?.maintenanceId === maintenance.id, "persisted WO → Work");
  assert(
    reloadedMaint?.workOrderId === created.workOrder.id ||
      reloadedMaint?.workOrderIds?.includes(created.workOrder.id),
    "persisted Work → WO"
  );
  results.push("PASS G — persisted reciprocal references");

  // H — idempotency
  const again = await orchestrateCreateWorkOrderFromMaintenance({
    maintenanceId: maintenance.id,
    context,
  });
  assert(again.workOrder.id === created.workOrder.id, "idempotent WO id");
  results.push("PASS H — existing WO idempotency");

  // Response contract — composed maintenance fields
  const rel = linkWorkOrderToMaintenance(
    normalizeMaintenanceRelationships(maintenance),
    created.workOrder.id
  );
  assert(
    created.maintenance.workOrderId === rel.workOrderId,
    "response maintenance.workOrderId correct"
  );
  assert(
    JSON.stringify(created.maintenance.workOrderIds ?? []) ===
      JSON.stringify(rel.workOrderIds),
    "response maintenance.workOrderIds correct"
  );
  assert(created.maintenance.requiresWorkOrder === true, "requiresWorkOrder set");
  results.push("PASS B/G — response maintenance composed without final read");

  // Simple save returns complete entity (via transition layer — same path as Treat save)
  const saveResult = await transitionMaintenance({
    entityId: maintenance.id,
    update: {
      title: `Phase28C updated ${stamp}`,
      status: "in_progress",
      updatedByUserId: context.userId,
    },
    context,
    options: { transitionSource: "form_update" },
  });
  assert(saveResult.entity.id === maintenance.id, "save returns maintenance id");
  assert(saveResult.entity.title.includes("Phase28C updated"), "save returns updated fields");
  results.push("PASS — transitionMaintenance returns complete entity");

  return results;
}

async function main() {
  const results = verifyStaticContracts();
  console.log(results.join("\n"));

  try {
    const context = await buildContext();
    const live = await verifyLiveContracts(context);
    console.log(live.join("\n"));
  } catch (err) {
    console.error(
      "BLOCKED live verification:",
      err instanceof Error ? err.message : String(err)
    );
    process.exit(2);
  }

  console.log("\nPHASE_28C_WORK_OPERATIONAL_PERFORMANCE_QUICK_WINS: PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
