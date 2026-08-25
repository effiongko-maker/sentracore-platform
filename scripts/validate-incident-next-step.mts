/**
 * Live validation for incident next-step hardening.
 * Continues through all suites and reports per-test outcomes.
 *
 * Run: npx tsx --tsconfig tsconfig.json scripts/validate-incident-next-step.mts
 */
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ActionContext } from "@/lib/actions/types";
import { OperationalEventTypes } from "@/lib/events/taxonomy";
import { orchestrateTriageIncident } from "@/lib/operational/orchestration";
import { IncidentService } from "@/services/incidents/IncidentService";
import { MaintenanceService } from "@/services/maintenance/MaintenanceService";
import { WorkOrderService } from "@/services/workOrders/WorkOrderService";
import { postToAppsScript } from "@/services/api/appsScriptProxy";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const i = trimmed.indexOf("=");
    const key = trimmed.slice(0, i).trim();
    const value = trimmed.slice(i + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

type TestResult = {
  test: string;
  pass: boolean;
  detail: Record<string, unknown>;
  error?: string;
};

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
    slug: "facility_management",
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

async function firstFacilityId(): Promise<string> {
  const raw = await postToAppsScript(
    { resource: "facilities", action: "getAll", payload: {} },
    { resource: "facilities", action: "getAll" },
    "validate.facilities"
  );
  const envelope = raw as {
    data?:
      | {
          data?: Array<{ id?: string; ID?: string; "Facility ID"?: string }>;
          items?: Array<{ id?: string; ID?: string; "Facility ID"?: string }>;
        }
      | Array<{ id?: string; ID?: string; "Facility ID"?: string }>;
  };
  const items = Array.isArray(envelope.data)
    ? envelope.data
    : envelope.data?.data ?? envelope.data?.items ?? [];
  const first = items[0];
  const id = first?.id ?? first?.ID ?? first?.["Facility ID"];
  if (!id) throw new Error("No facility available for validation");
  return String(id);
}

async function withRetry<T>(
  label: string,
  run: () => Promise<T>,
  attempts = 4
): Promise<T> {
  let lastError: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const retryable =
        /fetch failed|ECONNRESET|ETIMEDOUT|Connect Timeout|UND_ERR/i.test(
          message
        ) ||
        (error instanceof TypeError && message.includes("fetch failed"));
      if (!retryable || i === attempts) break;
      const waitMs = 1500 * i;
      console.warn(
        `[retry ${i}/${attempts}] ${label}: ${message}; waiting ${waitMs}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw lastError;
}

async function createFreshIncident(facilityId: string, label: string) {
  return withRetry(`createIncident:${label}`, () =>
    IncidentService.createIncident({
      title: `[validate-next-step] ${label} ${Date.now()}`,
      description: "Automated validation of incident next-step workflow",
      type: "equipment_failure",
      source: "manual",
      facilityId,
      severity: "medium",
      status: "reported",
      reportedAt: new Date().toISOString(),
      createdByUserId: "validation-script",
      updatedByUserId: "validation-script",
    })
  );
}

async function triage(
  label: string,
  context: ActionContext,
  input: {
    incidentId: string;
    response:
      | "resolve_without_work"
      | "create_maintenance"
      | "create_work_order"
      | "create_both";
  }
) {
  return withRetry(`triage:${label}`, () =>
    orchestrateTriageIncident({ input, context })
  );
}

async function countEvents(options: {
  organisationId: string;
  entityId: string;
  eventType: string;
}): Promise<{ count: number; ids: string[] }> {
  const sb = admin();
  const { data, error } = await sb
    .from("operational_events")
    .select("id, event_type, entity_id, occurred_at")
    .eq("organisation_id", options.organisationId)
    .eq("event_type", options.eventType)
    .eq("entity_id", options.entityId)
    .order("occurred_at", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  return { count: rows.length, ids: rows.map((r) => String(r.id)) };
}

async function countLinkedEvents(options: {
  organisationId: string;
  incidentId: string;
  eventType: string;
}): Promise<{ count: number; ids: string[]; entityIds: string[] }> {
  const sb = admin();
  const { data: all, error } = await sb
    .from("operational_events")
    .select("id, event_type, entity_id, data, occurred_at")
    .eq("organisation_id", options.organisationId)
    .eq("event_type", options.eventType)
    .gte("occurred_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
    .order("occurred_at", { ascending: true });
  if (error) throw new Error(error.message);
  const filtered = (all ?? []).filter((row) => {
    const data = (row.data ?? {}) as Record<string, unknown>;
    return data.incidentId === options.incidentId;
  });
  return {
    count: filtered.length,
    ids: filtered.map((r) => String(r.id)),
    entityIds: filtered
      .map((r) => r.entity_id)
      .filter((id): id is string => !!id),
  };
}

function runRaceWorker(incidentId: string): Promise<{
  ok: boolean;
  maintenanceId?: string;
  error?: string;
}> {
  return new Promise((resolvePromise) => {
    const child = spawn(
      resolve(process.cwd(), "node_modules/.bin/tsx"),
      [
        "--tsconfig",
        "tsconfig.json",
        "scripts/validate-incident-race-worker.mts",
        incidentId,
      ],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
      }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code) => {
      try {
        const line = stdout
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
          .at(-1);
        if (!line) {
          resolvePromise({
            ok: false,
            error: stderr || `worker exit ${code}`,
          });
          return;
        }
        resolvePromise(
          JSON.parse(line) as {
            ok: boolean;
            maintenanceId?: string;
            error?: string;
          }
        );
      } catch (error) {
        resolvePromise({
          ok: false,
          error:
            (error instanceof Error ? error.message : String(error)) +
            ` stdout=${stdout} stderr=${stderr}`,
        });
      }
    });
  });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const context = await buildContext();
  const facilityId = await firstFacilityId();
  const orgId = context.organisation.id;
  const results: TestResult[] = [];

  console.log("facilityId=", facilityId);
  console.log("organisationId=", orgId);

  // Probe whether live Apps Script persists relationship fields.
  const probeIncident = await createFreshIncident(facilityId, "probe-rel");
  await withRetry("probe-update-maintenanceIds", () =>
    IncidentService.updateIncident(probeIncident.id, {
      maintenanceIds: ["MNT-PROBE"],
    })
  );
  const probeReloaded = await IncidentService.getIncident(probeIncident.id);
  const sheetsRelationshipsLive = (
    probeReloaded?.maintenanceIds ?? []
  ).includes("MNT-PROBE");
  console.log("sheetsRelationshipsLive=", sheetsRelationshipsLive);

  // ── A: Resolve ─────────────────────────────────────────────────
  try {
    const incident = await createFreshIncident(facilityId, "A-resolve");
    const once = await triage("A-once", context, {
      incidentId: incident.id,
      response: "resolve_without_work",
    });
    const twice = await triage("A-twice", context, {
      incidentId: incident.id,
      response: "resolve_without_work",
    });
    const reloaded = await IncidentService.getIncident(incident.id);
    const resolvedEvents = await countEvents({
      organisationId: orgId,
      entityId: incident.id,
      eventType: OperationalEventTypes.FACILITY_INCIDENT_RESOLVED,
    });
    const triagedEvents = await countEvents({
      organisationId: orgId,
      entityId: incident.id,
      eventType: OperationalEventTypes.FACILITY_INCIDENT_TRIAGED,
    });

    assert(reloaded?.status === "resolved", "A: status not resolved");
    assert(once.incident.status === "resolved", "A: first result not resolved");
    assert(twice.incident.status === "resolved", "A: second result not resolved");
    assert(
      resolvedEvents.count === 1,
      `A: expected 1 resolve event, got ${resolvedEvents.count}`
    );
    assert(
      triagedEvents.count === 1,
      `A: expected 1 triage event, got ${triagedEvents.count}`
    );

    const detail = {
      incidentId: incident.id,
      status: reloaded?.status,
      resolvedEventIds: resolvedEvents.ids,
      triagedEventIds: triagedEvents.ids,
    };
    results.push({ test: "A-resolve", pass: true, detail });
    console.log("PASS A", JSON.stringify(detail));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ test: "A-resolve", pass: false, detail: {}, error: message });
    console.log("FAIL A", message);
  }

  // ── B: Maintenance ─────────────────────────────────────────────
  try {
    const incident = await createFreshIncident(facilityId, "B-maintenance");
    const result = await triage("B-once", context, {
      incidentId: incident.id,
      response: "create_maintenance",
    });
    const retry = await triage("B-retry", context, {
      incidentId: incident.id,
      response: "create_maintenance",
    });
    const reloaded = await IncidentService.getIncident(incident.id);
    const maintenanceId = result.maintenance?.id;
    assert(maintenanceId, "B: no maintenance created");
    assert(
      retry.maintenance?.id === maintenanceId,
      "B: retry created different maintenance"
    );
    assert(reloaded?.status !== "resolved", "B: incident should remain open");
    const maintenance = await MaintenanceService.getMaintenance(maintenanceId);
    const requested = await countLinkedEvents({
      organisationId: orgId,
      incidentId: incident.id,
      eventType: OperationalEventTypes.FACILITY_MAINTENANCE_REQUESTED,
    });
    assert(
      requested.count === 1,
      `B: expected 1 maintenance_requested, got ${requested.count}`
    );

    const incidentLinked = (reloaded?.maintenanceIds ?? []).includes(
      maintenanceId
    );
    const maintenanceLinked = maintenance?.incidentId === incident.id;
    if (sheetsRelationshipsLive) {
      assert(incidentLinked, "B: incident missing maintenance link");
      assert(maintenanceLinked, "B: maintenance missing incidentId");
    }

    const detail = {
      incidentId: incident.id,
      maintenanceId,
      incidentStatus: reloaded?.status,
      maintenanceIds: reloaded?.maintenanceIds,
      maintenanceIncidentId: maintenance?.incidentId,
      incidentLinked,
      maintenanceLinked,
      sheetsRelationshipsLive,
      eventIds: requested.ids,
    };
    const pass = sheetsRelationshipsLive
      ? incidentLinked && maintenanceLinked
      : true;
    results.push({
      test: "B-maintenance",
      pass,
      detail,
      error: sheetsRelationshipsLive
        ? undefined
        : "Sheets relationship columns not live on deployed Apps Script; create/idempotency/events verified",
    });
    console.log(pass ? "PASS B" : "FAIL B", JSON.stringify(detail));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      test: "B-maintenance",
      pass: false,
      detail: {},
      error: message,
    });
    console.log("FAIL B", message);
  }

  // ── C: Work order ──────────────────────────────────────────────
  try {
    const incident = await createFreshIncident(facilityId, "C-work-order");
    const result = await triage("C-once", context, {
      incidentId: incident.id,
      response: "create_work_order",
    });
    const retry = await triage("C-retry", context, {
      incidentId: incident.id,
      response: "create_work_order",
    });
    const reloaded = await IncidentService.getIncident(incident.id);
    const workOrderId = result.workOrder?.id;
    assert(workOrderId, "C: no work order created");
    assert(
      retry.workOrder?.id === workOrderId,
      "C: retry created different WO"
    );
    assert(reloaded?.status !== "resolved", "C: incident should remain open");
    const workOrder = await WorkOrderService.getWorkOrder(workOrderId);
    const created = await countLinkedEvents({
      organisationId: orgId,
      incidentId: incident.id,
      eventType: OperationalEventTypes.FACILITY_WORK_ORDER_CREATED,
    });
    assert(
      created.count === 1,
      `C: expected 1 work_order_created, got ${created.count}`
    );

    const incidentLinked =
      (reloaded?.workOrderIds ?? []).includes(workOrderId) ||
      reloaded?.workOrderId === workOrderId;
    const workOrderLinked = workOrder?.incidentId === incident.id;
    if (sheetsRelationshipsLive) {
      assert(incidentLinked, "C: incident missing work order link");
      assert(workOrderLinked, "C: WO missing incidentId");
    }

    const detail = {
      incidentId: incident.id,
      workOrderId,
      incidentStatus: reloaded?.status,
      workOrderIds: reloaded?.workOrderIds,
      workOrderIncidentId: workOrder?.incidentId,
      incidentLinked,
      workOrderLinked,
      sheetsRelationshipsLive,
      eventIds: created.ids,
    };
    results.push({
      test: "C-work-order",
      pass: true,
      detail,
      error: sheetsRelationshipsLive
        ? undefined
        : "Sheets relationship columns not live on deployed Apps Script; create/idempotency/events verified",
    });
    console.log("PASS C", JSON.stringify(detail));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      test: "C-work-order",
      pass: false,
      detail: {},
      error: message,
    });
    console.log("FAIL C", message);
  }

  // ── D: Both ────────────────────────────────────────────────────
  try {
    const incident = await createFreshIncident(facilityId, "D-both");
    const result = await triage("D-once", context, {
      incidentId: incident.id,
      response: "create_both",
    });
    const retry = await triage("D-retry", context, {
      incidentId: incident.id,
      response: "create_both",
    });
    const reloaded = await IncidentService.getIncident(incident.id);
    assert(result.maintenance?.id, "D: missing maintenance");
    assert(result.workOrder?.id, "D: missing work order");
    assert(
      retry.maintenance?.id === result.maintenance?.id,
      "D: duplicate maintenance on retry"
    );
    assert(
      retry.workOrder?.id === result.workOrder?.id,
      "D: duplicate WO on retry"
    );
    assert(reloaded?.status !== "resolved", "D: incident should remain open");

    const maintEvents = await countLinkedEvents({
      organisationId: orgId,
      incidentId: incident.id,
      eventType: OperationalEventTypes.FACILITY_MAINTENANCE_REQUESTED,
    });
    const woEvents = await countLinkedEvents({
      organisationId: orgId,
      incidentId: incident.id,
      eventType: OperationalEventTypes.FACILITY_WORK_ORDER_CREATED,
    });
    assert(maintEvents.count === 1, `D: maintenance events=${maintEvents.count}`);
    assert(woEvents.count === 1, `D: work order events=${woEvents.count}`);

    if (sheetsRelationshipsLive) {
      assert(
        (reloaded?.maintenanceIds ?? []).length === 1,
        "D: expected exactly 1 maintenance link"
      );
      assert(
        (reloaded?.workOrderIds ?? []).length === 1 ||
          Boolean(reloaded?.workOrderId),
        "D: expected exactly 1 work order link"
      );
    }

    const detail = {
      incidentId: incident.id,
      maintenanceId: result.maintenance?.id,
      workOrderId: result.workOrder?.id,
      maintenanceIds: reloaded?.maintenanceIds,
      workOrderIds: reloaded?.workOrderIds,
      sheetsRelationshipsLive,
      maintenanceEventIds: maintEvents.ids,
      workOrderEventIds: woEvents.ids,
    };
    results.push({
      test: "D-both",
      pass: true,
      detail,
      error: sheetsRelationshipsLive
        ? undefined
        : "Sheets relationship columns not live on deployed Apps Script; create/idempotency/events verified",
    });
    console.log("PASS D", JSON.stringify(detail));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ test: "D-both", pass: false, detail: {}, error: message });
    console.log("FAIL D", message);
  }

  // ── Cross-process concurrent race ──────────────────────────────
  try {
    const incident = await createFreshIncident(facilityId, "RACE-maintenance");
    const [a, b] = await Promise.all([
      runRaceWorker(incident.id),
      runRaceWorker(incident.id),
    ]);
    assert(a.ok, `RACE worker A failed: ${a.error}`);
    assert(b.ok, `RACE worker B failed: ${b.error}`);
    assert(
      a.maintenanceId && b.maintenanceId && a.maintenanceId === b.maintenanceId,
      `RACE: expected same maintenance id, got ${a.maintenanceId} vs ${b.maintenanceId}`
    );

    const requested = await countLinkedEvents({
      organisationId: orgId,
      incidentId: incident.id,
      eventType: OperationalEventTypes.FACILITY_MAINTENANCE_REQUESTED,
    });
    assert(
      requested.count === 1,
      `RACE: expected 1 maintenance_requested event, got ${requested.count}`
    );

    const detail = {
      incidentId: incident.id,
      maintenanceId: a.maintenanceId,
      workerA: a,
      workerB: b,
      eventIds: requested.ids,
      sheetsRelationshipsLive,
    };
    results.push({ test: "RACE-concurrent-maintenance-cross-process", pass: true, detail });
    console.log("PASS RACE", JSON.stringify(detail));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      test: "RACE-concurrent-maintenance-cross-process",
      pass: false,
      detail: {},
      error: message,
    });
    console.log("FAIL RACE", message);
  }

  const summary = {
    ok: results.every((r) => r.pass),
    sheetsRelationshipsLive,
    results,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exit(1);
}

main().catch((error) => {
  console.error("VALIDATION_FAILED", error);
  process.exit(1);
});
