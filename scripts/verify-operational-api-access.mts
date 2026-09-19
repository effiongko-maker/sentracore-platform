/**
 * Operational API access enforcement verification.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-operational-api-access.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  accessCan,
  applyPlatformSuperAdmin,
  capabilityForOperationalProxyAction,
  capabilityForRequestsProxyAction,
  capabilitiesForRole,
  resolveOperatingAccessFromSheetUser,
  resolveProtectedActionAuthority,
  type AccessCapability,
  type OperationalProxyResource,
  type V1OperatingRole,
} from "../src/lib/access";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function readSrc(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function sheetAccess(role: V1OperatingRole, email = `${role}@example.com`) {
  const access = resolveOperatingAccessFromSheetUser(email, role, {
    id: `USR-${role}`,
    name: role,
    email,
    role:
      role === "facility_manager"
        ? "Facility Manager"
        : role === "fm_staff"
          ? "FM Staff"
          : role === "liaison_officer"
            ? "Liaison Officer"
            : role === "finance"
              ? "Finance"
              : "NCC / Client",
    status: "active",
    facility: "NCC Annex",
  });
  return {
    ...access,
    capabilities: [...capabilitiesForRole(role)],
  };
}

function expectAllowed(
  role: V1OperatingRole,
  capability: AccessCapability,
  allowed: boolean
) {
  const access = sheetAccess(role);
  assert(
    accessCan(access, capability) === allowed,
    `${role} ${allowed ? "should" : "must not"} have ${capability}`
  );
}

function main() {
  const resources: OperationalProxyResource[] = [
    "work-orders",
    "maintenance",
    "incidents",
    "approvals",
    "assets",
    "facilities",
    "master-data",
    "generator-log",
    "energy-reading",
    "diesel-usage",
    "consumables-update",
    "waste-log",
    "fumigation-log",
    "deep-cleaning-log",
  ];

  // --- Action → capability mapping ---
  for (const resource of [
    "work-orders",
    "maintenance",
    "incidents",
    "assets",
    "facilities",
    "master-data",
    "generator-log",
    "energy-reading",
    "diesel-usage",
    "consumables-update",
    "waste-log",
    "fumigation-log",
    "deep-cleaning-log",
  ] as const) {
    assert(
      capabilityForOperationalProxyAction(resource, "getAll") === "ops.view",
      `${resource} getAll → ops.view`
    );
    assert(
      capabilityForOperationalProxyAction(resource, "getById") === "ops.view",
      `${resource} getById → ops.view`
    );
    assert(
      capabilityForOperationalProxyAction(resource, "create") === "ops.create",
      `${resource} create → ops.create`
    );
    assert(
      capabilityForOperationalProxyAction(resource, "update") === "ops.edit",
      `${resource} update → ops.edit`
    );
    assert(
      capabilityForOperationalProxyAction(resource, "deactivate") === "ops.edit",
      `${resource} deactivate → ops.edit`
    );
  }

  assert(
    capabilityForOperationalProxyAction(
      "work-orders",
      "createFromMaintenance"
    ) === "ops.create",
    "createFromMaintenance → ops.create"
  );
  assert(
    capabilityForOperationalProxyAction("work-orders", "getFilterCatalog") ===
      "ops.view",
    "getFilterCatalog → ops.view"
  );
  assert(
    capabilityForOperationalProxyAction("master-data", "getLocationCatalog") ===
      "ops.view",
    "getLocationCatalog → ops.view"
  );
  assert(
    capabilityForOperationalProxyAction("approvals", "getAll") === "ops.view",
    "approvals getAll → ops.view"
  );
  assert(
    capabilityForOperationalProxyAction("approvals", "create") ===
      "approvals.manage",
    "approvals create → approvals.manage"
  );
  assert(
    capabilityForOperationalProxyAction("approvals", "update") ===
      "approvals.manage",
    "approvals update → approvals.manage"
  );
  assert(
    capabilityForOperationalProxyAction("approvals", "deactivate") ===
      "approvals.manage",
    "approvals deactivate → approvals.manage"
  );
  assert(
    capabilityForOperationalProxyAction("work-orders", "mysteryMutation") ===
      "ops.edit",
    "unknown WO action fails closed to ops.edit"
  );

  // --- Allowed roles ---
  for (const role of ["facility_manager", "fm_staff"] as const) {
    expectAllowed(role, "ops.view", true);
    expectAllowed(role, "ops.create", true);
    expectAllowed(role, "ops.edit", true);
    expectAllowed(role, "approvals.manage", true);
  }

  // --- Denied roles (writes) ---
  for (const role of ["liaison_officer", "finance"] as const) {
    expectAllowed(role, "ops.view", true);
    expectAllowed(role, "ops.create", false);
    expectAllowed(role, "ops.edit", false);
    expectAllowed(role, "approvals.manage", false);
  }

  // NCC: requests portal only — no ops.view (API isolation)
  expectAllowed("ncc_client", "ops.view", false);
  expectAllowed("ncc_client", "ops.create", false);
  expectAllowed("ncc_client", "ops.edit", false);
  expectAllowed("ncc_client", "approvals.manage", false);
  expectAllowed("ncc_client", "requests.view", true);

  // Finance / Liaison can read WO but not mutate — capability matrix
  assert(
    accessCan(sheetAccess("finance"), "ops.view") &&
      !accessCan(sheetAccess("finance"), "ops.create"),
    "Finance: view yes, create no"
  );
  assert(
    accessCan(sheetAccess("liaison_officer"), "ops.view") &&
      !accessCan(sheetAccess("liaison_officer"), "approvals.manage"),
    "Liaison: view yes, approvals.manage no"
  );
  assert(
    !accessCan(sheetAccess("ncc_client"), "ops.view") &&
      !accessCan(sheetAccess("ncc_client"), "ops.edit"),
    "NCC: no ops.view / ops.edit"
  );

  // --- Super Admin override ≠ FM protected ---
  const ncc = sheetAccess("ncc_client", "sa@example.com");
  assert(!accessCan(ncc, "ops.create"), "NCC denied create before override");
  const sa = applyPlatformSuperAdmin(
    resolveOperatingAccessFromSheetUser("sa@example.com", "ncc_client", {
      id: "USR-ncc",
      name: "ncc_client",
      email: "sa@example.com",
      role: "NCC / Client",
      status: "active",
      facility: "NCC Annex",
    }),
    true
  );
  assert(sa.role === "ncc_client", "SA keeps non-FM operating role");
  assert(sa.authorityKind === "platform_override", "SA authority kind");
  assert(!accessCan(sa, "ops.create"), "SA override does not allow ops.create");
  assert(!accessCan(sa, "ops.edit"), "SA override does not allow ops.edit");
  assert(!accessCan(sa, "approvals.manage"), "SA override does not allow approvals.manage");
  assert(accessCan(sa, "platform.admin_override"), "SA has platform override");
  assert(
    !accessCan(sa, "fm.authorize_protected"),
    "SA override must NOT satisfy fm.authorize_protected"
  );
  assert(
    resolveProtectedActionAuthority(sa)?.mode === "platform_override",
    "protected authority remains platform_override"
  );

  const fm = sheetAccess("facility_manager");
  assert(
    accessCan(fm, "fm.authorize_protected") &&
      !accessCan(fm, "platform.admin_override"),
    "FM has facility protected authority, not platform override"
  );

  // ops.submit exists on roles but is not mapped to a distinct proxy verb yet
  assert(
    capabilitiesForRole("fm_staff").includes("ops.submit"),
    "ops.submit remains on FM Staff matrix"
  );
  for (const resource of resources) {
    for (const action of [
      "getAll",
      "create",
      "update",
      "deactivate",
      "createFromMaintenance",
    ]) {
      assert(
        capabilityForOperationalProxyAction(resource, action) !== "ops.submit",
        `${resource}.${action} must not map to ops.submit (no distinct verb yet)`
      );
    }
  }

  // --- Routes gated ---
  for (const resource of resources) {
    const routePath = `src/app/api/${resource}/route.ts`;
    const src = readSrc(routePath);
    if (resource === "approvals") {
      assert(
        src.includes("gateApiCapability"),
        "approvals route uses gateApiCapability"
      );
      assert(
        src.includes("capabilityForOperationalProxyAction"),
        "approvals maps action → capability"
      );
      assert(
        src.includes("approval.record_decision") ||
          src.includes("Decision fields") ||
          src.includes("decisions must be recorded"),
        "approvals blocks decision mutations on proxy"
      );
      continue;
    }
    if (resource === "master-data") {
      assert(
        src.includes("gateApiCapability"),
        "master-data route uses gateApiCapability"
      );
      assert(
        src.includes("capabilityForOperationalProxyAction"),
        "master-data maps action → capability"
      );
      assert(
        !src.includes("postGatedOperationalProxy"),
        "master-data is not the all-Apps-Script gated proxy"
      );
      assert(
        src.includes("FmLocationServerService"),
        "master-data location entities use Supabase server service"
      );
      assert(
        src.includes("postToAppsScript"),
        "master-data vendors still call Apps Script"
      );
      assert(
        src.includes('entity === "vendors"') || src.includes("vendors"),
        "vendor entity is routed separately"
      );
      continue;
    }
    if (resource === "facilities") {
      assert(
        src.includes("gateApiCapability"),
        "facilities route uses gateApiCapability"
      );
      assert(
        src.includes("capabilityForOperationalProxyAction"),
        "facilities maps action → capability"
      );
      assert(
        !src.includes("postGatedOperationalProxy"),
        "facilities is not the Apps Script gated proxy"
      );
      assert(
        !src.includes("postToAppsScript"),
        "facilities does not call Apps Script after cutover"
      );
      assert(
        src.includes("FmFacilitiesServerService"),
        "facilities uses Supabase server service"
      );
      continue;
    }
    if (resource === "maintenance") {
      assert(src.includes("gateApiCapability"), "maintenance route uses gateApiCapability");
      assert(src.includes("capabilityForOperationalProxyAction"), "maintenance maps action → capability");
      assert(src.includes("FmWorkServerService"), "maintenance uses Supabase Work service");
      assert(!src.includes("postGatedOperationalProxy"), "maintenance no longer uses Apps Script proxy");
      continue;
    }
    if (resource === "work-orders") {
      assert(src.includes("gateApiCapability"), "work-orders route uses gateApiCapability");
      assert(src.includes("capabilityForOperationalProxyAction"), "work-orders maps action → capability");
      assert(src.includes("FmWorkInstructionServerService"), "work-orders uses Supabase Work Instruction service");
      assert(!src.includes("postGatedOperationalProxy"), "work-orders no longer uses Apps Script proxy");
      assert(!src.includes("postToAppsScript("), "work-orders route makes no Apps Script call");
      continue;
    }
    if (resource === "incidents") {
      assert(src.includes("gateApiCapability"), "incidents route uses gateApiCapability");
      assert(src.includes("capabilityForOperationalProxyAction"), "incidents maps action → capability");
      assert(src.includes("FmIncidentServerService"), "incidents uses Supabase Incident service");
      assert(!src.includes("postGatedOperationalProxy"), "incidents no longer uses Apps Script proxy");
      assert(!src.includes("postToAppsScript("), "incidents route makes no Apps Script call");
      continue;
    }
    if (resource === "assets") {
      assert(src.includes("gateApiCapability"), "assets route uses gateApiCapability");
      assert(src.includes("capabilityForOperationalProxyAction"), "assets maps action → capability");
      assert(src.includes("FmAssetServerService"), "assets uses Supabase Asset service");
      assert(!src.includes("postGatedOperationalProxy"), "assets no longer uses Apps Script proxy");
      assert(!src.includes("postToAppsScript("), "assets route makes no Apps Script call");
      continue;
    }
    assert(
      src.includes("postGatedOperationalProxy"),
      `${resource} route uses gated proxy`
    );
    assert(
      src.includes(`"${resource}"`) || src.includes(`'${resource}'`),
      `${resource} route passes resource id`
    );
  }

  const helper = readSrc("src/lib/access/postGatedOperationalProxy.ts");
  assert(helper.includes("gateApiCapability"), "helper uses gateApiCapability");
  assert(
    helper.includes("capabilityForOperationalProxyAction"),
    "helper maps action → capability"
  );

  // Finance / notifications / home not touched by this slice
  assert(
    !readSrc("src/app/api/cost-records/route.ts").includes(
      "postGatedOperationalProxy"
    ),
    "finance cost-records route unchanged by ops gate helper"
  );
  assert(
    readSrc("src/app/api/cost-records/route.ts").includes("finance.create"),
    "finance cost-records gate preserved"
  );

  // Requests proxy capability mapping + route gate
  assert(
    capabilityForRequestsProxyAction("getAll") === "requests.view",
    "requests getAll"
  );
  assert(
    capabilityForRequestsProxyAction("create") === "ops.create",
    "requests create"
  );
  assert(
    capabilityForRequestsProxyAction("update") === "ops.edit",
    "requests update"
  );
  const requestsRoute = readSrc("src/app/api/requests/route.ts");
  assert(
    requestsRoute.includes("capabilityForRequestsProxyAction"),
    "requests route capability gate"
  );
  assert(requestsRoute.includes("gateApiCapability"), "requests uses gateApi");

  assert(
    readSrc("src/app/api/operational-workload/route.ts").includes("ops.view"),
    "workload gated"
  );
  assert(
    readSrc("src/app/api/reporting-snapshot/route.ts").includes("gateApiCapability"),
    "reporting gated"
  );

  // Server-action capability enforcement (closes Apps Script bypass via executeAction)
  assert(
    readSrc("src/modules/work-orders/actions/createWorkOrder.ts").includes(
      'requiredCapability: "ops.create"'
    ),
    "createWorkOrder requires ops.create"
  );
  assert(
    readSrc(
      "src/modules/approvals/actions/approvalLifecycleActions.ts"
    ).includes('requiredCapability: "approvals.manage"'),
    "approval lifecycle requires approvals.manage"
  );
  assert(
    readSrc("src/modules/requests/actions/treatRequest.ts").includes(
      'requiredCapability: "ops.edit"'
    ),
    "request treatment mutations require ops.edit"
  );

  console.log("PASS verify-operational-api-access");
  console.log("  resources:", resources.join(", "));
  console.log(
    "  gates: ops.view / ops.create / ops.edit / approvals.manage; requests.view for /api/requests reads"
  );
  console.log(
    "  deferred: ops.submit (no distinct proxy verb); Apps Script /exec shared-secret hardening"
  );
}

main();
