/**
 * Request ↔ Treatment completion lifecycle verification.
 *
 * Pure matrix + live Sheets/orchestration tests.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-request-treatment-completion.mts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ActionContext } from "@/lib/actions/types";
import {
  allLinkedTreatmentsSuccessfullyTerminal,
  evaluateRequestAfterTreatmentCompletion,
} from "@/lib/operational/orchestration/evaluateRequestAfterTreatment";
import {
  transitionIncident,
  transitionMaintenance,
} from "@/lib/operational/lifecycle/transitionOperationalEntity";
import { IncidentService } from "@/services/incidents/IncidentService";
import { MaintenanceService } from "@/services/maintenance/MaintenanceService";
import { RequestService } from "@/services/requests/RequestService";
import { postToAppsScriptData } from "@/services/api/appsScriptProxy";

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

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
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

async function createRequest(tag: string) {
  return RequestService.createRequest({
    title: `RTC ${tag} ${Date.now()}`,
    description: `request-treatment-completion verify ${tag}`,
    facilityId: "FAC-0001",
    requestType: "maintenance",
    status: "submitted",
    reporterName: "RTC Verify",
    reporterContact: "rtc-verify@example.com",
    occurredAt: new Date().toISOString(),
  });
}

async function createTreatment(
  kind: "maintenance" | "incident",
  requestId: string,
  context: ActionContext
) {
  const bundle = await postToAppsScriptData(
    {
      resource: "requests",
      action: "createTreatment",
      payload: {
        requestId,
        kind,
        childInput: {
          title: `RTC child ${kind} ${Date.now()}`,
          description: `RTC ${kind}`,
          facilityId: "FAC-0001",
        },
        actorUserId: context.userId,
        idempotencyKey: `rtc-${kind}-${requestId}-${Date.now()}-${Math.random()}`,
      },
    },
    { resource: "requests", action: "createTreatment" },
    "verify-request-treatment-completion"
  );
  return bundle as {
    request: { id: string; status: string; maintenanceIds?: string[]; incidentIds?: string[] };
    maintenance?: { id: string; status: string };
    incident?: { id: string; status: string };
  };
}

async function main() {
  const results: string[] = [];

  // ── Pure decision matrix ──────────────────────────────────────────
  assert(
    allLinkedTreatmentsSuccessfullyTerminal({
      maintenanceIds: ["M1"],
      incidentIds: [],
      maintenances: [{ id: "M1", status: "completed" }],
      incidents: [],
    }),
    "single completed MNT"
  );
  results.push("PASS pure: single MNT completed → eligible");

  assert(
    allLinkedTreatmentsSuccessfullyTerminal({
      maintenanceIds: [],
      incidentIds: ["I1"],
      maintenances: [],
      incidents: [{ id: "I1", status: "resolved" }],
    }),
    "single resolved INC"
  );
  results.push("PASS pure: single INC resolved → eligible");

  assert(
    !allLinkedTreatmentsSuccessfullyTerminal({
      maintenanceIds: ["M1", "M2"],
      incidentIds: [],
      maintenances: [
        { id: "M1", status: "completed" },
        { id: "M2", status: "in_progress" },
      ],
      incidents: [],
    }),
    "active sibling blocks"
  );
  results.push("PASS pure: completed + in_progress → not eligible");

  assert(
    allLinkedTreatmentsSuccessfullyTerminal({
      maintenanceIds: ["M1"],
      incidentIds: ["I1"],
      maintenances: [{ id: "M1", status: "completed" }],
      incidents: [{ id: "I1", status: "resolved" }],
    }),
    "mixed types both successful"
  );
  results.push("PASS pure: MNT completed + INC resolved → eligible");

  assert(
    !allLinkedTreatmentsSuccessfullyTerminal({
      maintenanceIds: ["M1", "M2"],
      incidentIds: [],
      maintenances: [
        { id: "M1", status: "completed" },
        { id: "M2", status: "cancelled" },
      ],
      incidents: [],
    }),
    "cancelled is not success"
  );
  results.push("PASS pure: completed + cancelled → not eligible");

  assert(
    !allLinkedTreatmentsSuccessfullyTerminal({
      maintenanceIds: [],
      incidentIds: [],
      maintenances: [],
      incidents: [],
    }),
    "no treatments"
  );
  results.push("PASS pure: no linked treatments → not eligible");

  assert(
    !allLinkedTreatmentsSuccessfullyTerminal({
      maintenanceIds: ["M1"],
      incidentIds: [],
      maintenances: [null],
      incidents: [],
    }),
    "missing child"
  );
  results.push("PASS pure: missing child → not eligible");

  // ── Live orchestration ────────────────────────────────────────────
  const context = await buildContext();

  // TEST 1: REQ → MNT completed → REQ resolved
  {
    const req = await createRequest("t1");
    const bundle = await createTreatment("maintenance", req.id, context);
    const mntId = bundle.maintenance!.id;
    assert(bundle.request.status === "being_treated", "t1 treat status");
    await transitionMaintenance({
      entityId: mntId,
      update: { status: "completed", updatedByUserId: context.userId },
      context,
      options: { transitionSource: "form_update" },
    });
    const after = await RequestService.getRequest(req.id);
    assert(after?.status === "resolved", `t1 expected resolved got ${after?.status}`);
    results.push("PASS TEST1: single MNT completed → Request resolved");
  }

  // TEST 2: REQ → INC resolved → REQ resolved
  {
    const req = await createRequest("t2");
    const bundle = await createTreatment("incident", req.id, context);
    const incId = bundle.incident!.id;
    await transitionIncident({
      entityId: incId,
      update: { status: "resolved", updatedByUserId: context.userId },
      context,
      options: { transitionSource: "form_update" },
    });
    const after = await RequestService.getRequest(req.id);
    assert(after?.status === "resolved", `t2 expected resolved got ${after?.status}`);
    results.push("PASS TEST2: single INC resolved → Request resolved");
  }

  // TEST 3: REQ → MNT completed + MNT in_progress → being_treated
  {
    const req = await createRequest("t3");
    const a = await createTreatment("maintenance", req.id, context);
    const b = await createTreatment("maintenance", req.id, context);
    await transitionMaintenance({
      entityId: a.maintenance!.id,
      update: { status: "completed", updatedByUserId: context.userId },
      context,
    });
    const mid = await RequestService.getRequest(req.id);
    assert(
      mid?.status === "being_treated",
      `t3 mid expected being_treated got ${mid?.status}`
    );
    // leave B in requested/in_progress
    await transitionMaintenance({
      entityId: b.maintenance!.id,
      update: { status: "in_progress", updatedByUserId: context.userId },
      context,
    });
    const after = await RequestService.getRequest(req.id);
    assert(
      after?.status === "being_treated",
      `t3 expected being_treated got ${after?.status}`
    );
    results.push("PASS TEST3: completed + active → remains being_treated");
  }

  // TEST 4: REQ → MNT completed + INC resolved → resolved
  {
    const req = await createRequest("t4");
    const m = await createTreatment("maintenance", req.id, context);
    const i = await createTreatment("incident", req.id, context);
    await transitionMaintenance({
      entityId: m.maintenance!.id,
      update: { status: "completed", updatedByUserId: context.userId },
      context,
    });
    const mid = await RequestService.getRequest(req.id);
    assert(mid?.status === "being_treated", `t4 mid ${mid?.status}`);
    await transitionIncident({
      entityId: i.incident!.id,
      update: { status: "resolved", updatedByUserId: context.userId },
      context,
    });
    const after = await RequestService.getRequest(req.id);
    assert(after?.status === "resolved", `t4 expected resolved got ${after?.status}`);
    results.push("PASS TEST4: MNT completed + INC resolved → Request resolved");
  }

  // TEST 5: REQ → MNT cancelled → NOT resolved
  {
    const req = await createRequest("t5");
    const bundle = await createTreatment("maintenance", req.id, context);
    await transitionMaintenance({
      entityId: bundle.maintenance!.id,
      update: { status: "cancelled", updatedByUserId: context.userId },
      context,
    });
    const after = await RequestService.getRequest(req.id);
    assert(
      after?.status === "being_treated",
      `t5 expected being_treated got ${after?.status}`
    );
    results.push("PASS TEST5: MNT cancelled → Request not auto-resolved");
  }

  // TEST 6: already resolved → idempotent
  {
    const req = await createRequest("t6");
    const bundle = await createTreatment("maintenance", req.id, context);
    await transitionMaintenance({
      entityId: bundle.maintenance!.id,
      update: { status: "completed", updatedByUserId: context.userId },
      context,
    });
    const resolved = await RequestService.getRequest(req.id);
    assert(resolved?.status === "resolved", "t6 setup");
    const replay = await evaluateRequestAfterTreatmentCompletion({
      sourceRequestId: req.id,
      context,
    });
    assert(replay.outcome === "already_terminal", `t6 ${replay.outcome}`);
    const after = await RequestService.getRequest(req.id);
    assert(after?.status === "resolved", "t6 still resolved");
    results.push("PASS TEST6: already resolved replay is idempotent");
  }

  // TEST 7: completion retry
  {
    const req = await createRequest("t7");
    const bundle = await createTreatment("maintenance", req.id, context);
    await transitionMaintenance({
      entityId: bundle.maintenance!.id,
      update: { status: "completed", updatedByUserId: context.userId },
      context,
    });
    await transitionMaintenance({
      entityId: bundle.maintenance!.id,
      update: { status: "completed", updatedByUserId: context.userId },
      context,
    });
    const after = await RequestService.getRequest(req.id);
    assert(after?.status === "resolved", `t7 ${after?.status}`);
    const mnt = await MaintenanceService.getMaintenance(bundle.maintenance!.id);
    assert(mnt?.status === "completed", "t7 mnt still completed");
    results.push("PASS TEST7: repeated completion remains stable");
  }

  // TEST 8: concurrent completion of two treatments
  {
    const req = await createRequest("t8");
    const m = await createTreatment("maintenance", req.id, context);
    const i = await createTreatment("incident", req.id, context);
    await Promise.all([
      transitionMaintenance({
        entityId: m.maintenance!.id,
        update: { status: "completed", updatedByUserId: context.userId },
        context,
      }),
      transitionIncident({
        entityId: i.incident!.id,
        update: { status: "resolved", updatedByUserId: context.userId },
        context,
      }),
    ]);
    const after = await RequestService.getRequest(req.id);
    assert(after?.status === "resolved", `t8 expected resolved got ${after?.status}`);
    results.push("PASS TEST8: concurrent completions → Request resolved");
  }

  // TEST 9: no linked treatment → no auto-resolve
  {
    const req = await createRequest("t9");
    const evalResult = await evaluateRequestAfterTreatmentCompletion({
      sourceRequestId: req.id,
      context,
    });
    assert(evalResult.outcome === "no_treatments", `t9 ${evalResult.outcome}`);
    const after = await RequestService.getRequest(req.id);
    assert(after?.status === "submitted", `t9 ${after?.status}`);
    results.push("PASS TEST9: no treatments → no automatic resolution");
  }

  // TEST 10: no Work Order involved
  {
    const req = await createRequest("t10");
    const bundle = await createTreatment("maintenance", req.id, context);
    const mntBefore = await MaintenanceService.getMaintenance(bundle.maintenance!.id);
    assert(!mntBefore?.workOrderId, "t10 no WO before");
    await transitionMaintenance({
      entityId: bundle.maintenance!.id,
      update: { status: "completed", updatedByUserId: context.userId },
      context,
    });
    const mntAfter = await MaintenanceService.getMaintenance(bundle.maintenance!.id);
    assert(!mntAfter?.workOrderId, "t10 no WO created");
    const after = await RequestService.getRequest(req.id);
    assert(after?.status === "resolved", `t10 ${after?.status}`);
    results.push("PASS TEST10: Request resolves without Work Order");
  }

  // Spot-check create still leaves being_treated
  {
    const req = await createRequest("regression-create");
    const bundle = await createTreatment("maintenance", req.id, context);
    assert(bundle.request.status === "being_treated", "create treat");
    assert(bundle.maintenance?.id, "mnt created");
    results.push("PASS regression: createTreatment still works");
  }

  console.log("\n=== request treatment completion verify ===");
  for (const line of results) console.log(line);
  console.log("RESULT: PASS");
}

main().catch((err) => {
  console.error("RESULT: FAIL", err);
  process.exit(1);
});
