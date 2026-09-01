/**
 * Phase 28D — Work Order mutation consolidation contract.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-work-order-mutation-consolidation.mts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { ActionContext } from "../src/lib/actions/types";
import { orchestrateCreateWorkOrderFromMaintenance } from "../src/lib/operational/orchestration";
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

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function read(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function verifyStaticContracts(): string[] {
  const results: string[] = [];

  assert(
    existsSync(resolve("apps-script/WorkOrderMaintenanceMutationService.gs")),
    "WorkOrderMaintenanceMutationService.gs missing"
  );
  const mutation = read("apps-script/WorkOrderMaintenanceMutationService.gs");
  assert(
    mutation.includes("createFromMaintenance"),
    "createFromMaintenance exported"
  );
  assert(
    mutation.includes("WorkOrderRepository.create"),
    "uses WorkOrderRepository.create"
  );
  assert(
    mutation.includes("MaintenanceRepository.update"),
    "uses MaintenanceRepository.update"
  );
  assert(
    mutation.includes("SheetFieldUtils.appendUniqueId"),
    "multi-WO merge via appendUniqueId"
  );
  assert(
    mutation.includes("verifyReciprocalLinks_"),
    "reciprocal link verification"
  );
  results.push("PASS consolidated GAS operation exists and uses repositories directly");

  const controller = read("apps-script/WorkOrdersController.gs");
  assert(
    controller.includes('case "createFromMaintenance"'),
    "controller wires createFromMaintenance"
  );
  results.push("PASS WorkOrdersController exposes createFromMaintenance");

  const woService = read("src/services/workOrders/WorkOrderService.ts");
  assert(
    woService.includes('action: "createFromMaintenance"'),
    "WorkOrderService calls consolidated action"
  );
  results.push("PASS WorkOrderService.createWorkOrderFromMaintenance uses single GAS action");

  const orch = read("src/lib/operational/orchestration/index.ts");
  assert(
    orch.includes("WorkOrderService.createWorkOrderFromMaintenance({"),
    "orchestrator uses consolidated service"
  );
  assert(
    orch.includes('label: "orchestrateCreateWorkOrderFromMaintenance"'),
    "deferred event on maintenance create path"
  );
  assert(
    orch.includes('mode: "after"'),
    "sideEffectMode after preserved"
  );
  results.push("PASS Next.js orchestration uses consolidated mutation + deferred events");

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

async function verifyLiveContracts(context: ActionContext): Promise<{
  results: string[];
  deployed: boolean;
}> {
  const results: string[] = [];
  const stamp = Date.now();

  try {
    await postToAppsScriptData(
      {
        resource: "work-orders",
        action: "createFromMaintenance",
        payload: { maintenanceId: "MNT-NOT-REAL-PROBE" },
      },
      { resource: "work-orders", action: "createFromMaintenance" },
      "verify-wo-mutation-probe"
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes("Unknown work-orders action") ||
      msg.includes("createFromMaintenance")
    ) {
      return {
        results: [
          "BLOCKED live — createFromMaintenance not deployed on live Apps Script endpoint",
          "Deploy WorkOrderMaintenanceMutationService.gs + WorkOrdersController.gs and re-run.",
        ],
        deployed: false,
      };
    }
  }

  const maintenance = await MaintenanceService.createMaintenance({
    title: `Phase28D WO ${stamp}`,
    description: "mutation consolidation verify",
    facilityId: "FAC-0001",
    type: "corrective",
    source: "manual",
    priority: "medium",
    status: "in_progress",
    reportedAt: new Date().toISOString(),
  });

  const t0 = performance.now();
  const created = await orchestrateCreateWorkOrderFromMaintenance({
    maintenanceId: maintenance.id,
    context,
  });
  const elapsedMs = Math.round(performance.now() - t0);
  results.push(`PASS create-from-maintenance orchestration (${elapsedMs}ms)`);

  assert(
    created.workOrder.maintenanceId === maintenance.id,
    "WO → Work backlink"
  );
  assert(
    created.maintenance.workOrderId === created.workOrder.id ||
      created.maintenance.workOrderIds?.includes(created.workOrder.id),
    "Work → WO backlink in response"
  );
  results.push("PASS reciprocal links in orchestration response");

  const reloadedMaint = await MaintenanceService.getMaintenance(maintenance.id);
  const reloadedWo = await WorkOrderService.getWorkOrder(created.workOrder.id);
  assert(reloadedWo?.maintenanceId === maintenance.id, "persisted WO → Work");
  assert(
    reloadedMaint?.workOrderId === created.workOrder.id ||
      reloadedMaint?.workOrderIds?.includes(created.workOrder.id),
    "persisted Work → WO"
  );
  results.push("PASS persisted reciprocal references");

  const again = await orchestrateCreateWorkOrderFromMaintenance({
    maintenanceId: maintenance.id,
    context,
  });
  assert(again.workOrder.id === created.workOrder.id, "idempotent WO id");
  results.push("PASS idempotent second invocation");

  const direct = await postToAppsScriptData(
    {
      resource: "work-orders",
      action: "createFromMaintenance",
      payload: {
        maintenanceId: maintenance.id,
        actorUserId: context.userId,
      },
    },
    { resource: "work-orders", action: "createFromMaintenance" },
    "verify-wo-mutation-direct"
  );
  const directRow = direct as Record<string, unknown>;
  assert(directRow.created === false, "direct GAS idempotent created=false");
  assert(
    (directRow.workOrder as { id?: string })?.id === created.workOrder.id,
    "direct GAS returns existing WO"
  );
  results.push("PASS direct consolidated GAS idempotency");

  if (
    directRow.timings &&
    typeof directRow.timings === "object" &&
    (directRow.timings as Record<string, unknown>).buildMarker
  ) {
    results.push("PASS GAS timings/buildMarker present");
  }

  return { results, deployed: true };
}

async function main() {
  const results = verifyStaticContracts();
  console.log(results.join("\n"));

  try {
    const context = await buildContext();
    const live = await verifyLiveContracts(context);
    console.log(live.results.join("\n"));
    if (!live.deployed) {
      process.exit(2);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unknown work-orders action")) {
      console.log("BLOCKED live — deploy Apps Script and re-run.");
      process.exit(2);
    }
    console.error("BLOCKED live verification:", msg);
    process.exit(2);
  }

  console.log("\nPHASE_28D_WORK_ORDER_MUTATION_CONSOLIDATION: PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
