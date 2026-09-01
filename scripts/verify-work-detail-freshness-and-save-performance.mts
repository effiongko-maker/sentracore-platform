/**
 * Phase 31 — list/detail freshness contract + single-round-trip transition save.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-work-detail-freshness-and-save-performance.mts
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
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
  const checks: Record<string, boolean | string> = {};

  const created = await MaintenanceService.createMaintenance({
    title: `P31 freshness ${stamp}`,
    description: "requiresWo list/detail probe",
    facilityId: "FAC-0001",
    type: "corrective",
    source: "manual",
    priority: "medium",
    status: "in_progress",
    reportedAt: new Date().toISOString(),
    requiresWorkOrder: true,
  });

  const listPage = await MaintenanceService.listMaintenance({
    page: 1,
    pageSize: 8,
    search: created.id,
    status: "all",
  });
  const listRow = listPage.data.find((r) => r.id === created.id);
  checks.list_row_present = Boolean(listRow);
  checks.list_requiresWorkOrder = listRow?.requiresWorkOrder === true;

  const fresh = await MaintenanceService.getMaintenance(created.id);
  checks.getById_requiresWorkOrder = fresh?.requiresWorkOrder === true;
  checks.getById_no_workOrder =
    !fresh?.workOrderId && (fresh?.workOrderIds?.length ?? 0) === 0;

  const t0 = performance.now();
  const { entity, previousStatus, statusChanged, eventEmitted } =
    await transitionMaintenance({
      entityId: created.id,
      update: {
        title: `P31 save ${stamp}`,
        priority: "high",
        updatedByUserId: context.userId,
      },
      context,
    });
  const simpleSaveMs = Math.round(performance.now() - t0);
  checks.simple_save_ms = String(simpleSaveMs);
  checks.simple_save_title = entity.title === `P31 save ${stamp}`;
  checks.simple_save_no_status_event =
    statusChanged === false && eventEmitted === false;
  checks.previousStatus_returned = typeof previousStatus === "string";

  const t1 = performance.now();
  const statusResult = await transitionMaintenance({
    entityId: created.id,
    update: {
      status: "on_hold",
      holdReason: "p31 status probe",
      updatedByUserId: context.userId,
    },
    context,
  });
  const statusMs = Math.round(performance.now() - t1);
  checks.status_transition_ms = String(statusMs);
  checks.status_changed = statusResult.statusChanged === true;
  checks.status_persisted = statusResult.entity.status === "on_hold";

  const fixtures = {
    workId: created.id,
    requiresWorkOrder: true,
    simpleSaveMs,
    statusMs,
  };
  writeFileSync("/tmp/phase31-fixtures.json", JSON.stringify(fixtures, null, 2));

  const failed = Object.entries(checks).filter(
    ([, v]) => v === false || v === "false"
  );
  console.log(JSON.stringify({ checks, fixtures }, null, 2));
  if (failed.length) {
    console.error("PHASE_31_VERIFY: FAIL", failed);
    process.exit(1);
  }
  console.log("PHASE_31_VERIFY: PASS");
}

main().catch((err) => {
  console.error("PHASE_31_VERIFY: FAIL", err);
  process.exit(1);
});
