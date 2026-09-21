/**
 * Admin Console V1 — control-plane hardening + UI verification.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-admin-console.mts
 *
 * Static + pure checks. Linked-database behaviour is proven by
 * scripts/verify-platform-iam-hardening-rollback.sql (rollback-only),
 * scripts/verify-platform-iam-hardening-objects.sql (read-only) and
 * scripts/verify-admin-console-live-read.mts (read-only).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { CAPABILITY_DOMAINS, catalogCoversAllAdministrableCapabilities, describeCapability } from "../src/modules/platform-admin/capabilityCatalog";
import { AUDIT_ACTIONS_BY_CATEGORY, auditCategoryForAction, describeAuditEvent } from "../src/modules/platform-admin/auditDescribe";
import { PLATFORM_ADMINISTRABLE_CAPABILITIES, PLATFORM_IAM_AUDIT_ACTIONS } from "../src/modules/platform-admin/types";
import { SUPER_ADMIN_OVERRIDE_CAPABILITIES, hasCapability } from "../src/lib/access/capabilities";
import { applyPlatformSuperAdmin, resolveOperatingAccessFromGrants, resolveProtectedActionAuthority } from "../src/lib/access/resolveAccess";
import { ADMIN_NAV_ITEMS } from "../src/modules/platform-admin/nav";
import { isAdminConsolePath, resolveCurrentWorkspaceId, isOperationsPath } from "../src/lib/platform/workspaces";

type Result = { name: string; ok: boolean; detail?: string };
const results: Result[] = [];
const read = (p: string) => readFileSync(resolve(p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function check(name: string, fn: () => void) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) });
  }
}
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const f = join(dir, e);
    if (statSync(f).isDirectory()) walk(f, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(f);
  }
  return out;
}

const migration = read("supabase/migrations/20260919220000_platform_iam_control_plane_hardening.sql");
const route = read("src/app/api/platform-admin/route.ts");
const reader = read("src/modules/platform-admin/server/AdminConsoleReader.ts");
const service = read("src/modules/platform-admin/server/PlatformAdminServerService.ts");
const layout = read("src/app/(app)/admin/layout.tsx");
const clientFiles = walk("src/modules/platform-admin/client");
const client = clientFiles.map((f) => strip(read(f))).join("\n");
const views = Object.fromEntries(
  ["OverviewView", "PeopleView", "PersonView", "AccessView", "ModulesView", "AuditView"].map((n) => [n, strip(read(`src/modules/platform-admin/client/${n}.tsx`))])
);

// ------------------------------------------------------------------ CONTROL PLANE
check("A1: legacy invite mutation path is retired; no caller remains", () => {
  assert(!existsSync(resolve("src/app/api/admin/invite-user/route.ts")), "route still exists");
  const offenders = walk("src").filter((f) => strip(readFileSync(f, "utf8")).includes("/api/admin/invite-user"));
  assert(offenders.length === 0, offenders.join(", "));
  assert(route.includes("createAccount") && route.includes("issueTemporaryPassword") && !route.includes("inviteAndAttachUser"), "canonical Create Account / Issue Temporary Password actions replace the invitation");
  assert(existsSync(resolve("src/app/api/admin/bootstrap-first-user/route.ts")), "secret-gated bootstrap must remain");
});
check("A2: direct profile-status/organisation mutation is closed (bypass flag only)", () => {
  const guard = migration.slice(migration.indexOf("create or replace function public.enforce_profile_update_guardrails"), migration.indexOf("comment on function public.enforce_profile_update_guardrails"));
  assert(guard.includes("sentracore.bypass_profile_acl"), "bypass flag");
  assert(!/is_platform_super_admin|can_manage_organisation/.test(guard), "role-based pass-through remains");
  assert(/new\.status is distinct from old\.status/.test(guard) && /new\.organisation_id is distinct from old\.organisation_id/.test(guard), "status/org guarded");
});
check("A2: direct JWT writes to authority tables are closed; reads preserved", () => {
  for (const policy of ["platform_capability_grants_insert", "platform_capability_grants_delete", "organisation_modules_write_managers", "user_role_assignments_insert", "user_role_assignments_update", "user_role_assignments_delete", "organisations_insert_super_admin", "organisations_update_managers", "organisations_delete_super_admin"]) {
    assert(migration.includes(`drop policy if exists ${policy}`), `${policy} not dropped`);
  }
  assert(/revoke insert, update, delete, truncate/.test(migration), "write grants not revoked");
  assert(!/drop policy[^;]*select/i.test(migration) && !/_select/.test(migration.replace(/--.*$/gm, "")), "read policies must be untouched");
});
check("A3: facility-assignment administration is audited atomically in platform_iam_audit_events", () => {
  assert(migration.includes("create trigger fm_facility_assignments_audit") && migration.includes("platform_iam_insert_audit_event"), "trigger reuses the IAM audit function");
  for (const a of ["facility_assignment.created", "facility_assignment.activated", "facility_assignment.deactivated", "facility_assignment.role_changed", "facility_assignment.facility_changed"]) {
    assert(migration.includes(a) && (PLATFORM_IAM_AUDIT_ACTIONS as readonly string[]).includes(a), `${a} missing`);
  }
  assert(/must name the acting profile/.test(migration), "unattributed change refused");
  assert(!/create table[^;]*audit/i.test(migration), "no second audit framework");
});
check("Audit actions all have a category and appear in exactly one filter group", () => {
  for (const a of PLATFORM_IAM_AUDIT_ACTIONS) {
    assert(auditCategoryForAction(a) !== null, `${a} uncategorised`);
    const groups = Object.values(AUDIT_ACTIONS_BY_CATEGORY).filter((g) => g.includes(a));
    assert(groups.length === 1, `${a} in ${groups.length} groups`);
  }
});
check("Every admin read/write is behind requirePlatformAdmin; actor never trusted from the client", () => {
  assert(route.indexOf("requirePlatformAdmin()") > 0 && route.indexOf("requirePlatformAdmin()") < route.indexOf("switch (action)"), "guard precedes dispatch");
  assert(!/body\.actor/.test(route) && !/actorProfileId:\s*body/.test(route), "client-supplied actor");
  for (const a of ["getOverview", "listPeople", "getPerson", "listModules", "listFacilities", "listAudit", "setFacilityAssignment"]) assert(route.includes(`"${a}"`), `${a} missing`);
  assert(!/grantSuperAdmin|revokeSuperAdmin|createOrganisation|editOrganisation|impersonat|resetPassword|(grant|revoke|set|insert|update)Finance(Grant|Access|Company)/i.test(route + service + reader), "unsupported administrative power added");
});
check("Tenant protections remain: assignment writes verify the profile belongs to the organisation", () => {
  assert(/target\.organisation_id !== input\.organisationId/.test(service), "profile/organisation check");
  assert(service.includes("Cannot offboard the acting Super Admin"), "self-offboard refusal");
  assert(reader.includes('.eq("organisation_id", organisationId)'), "reader scoped by organisation");
});
check("Reads fail loudly: no swallowed error is returned as an empty result", () => {
  assert(reader.includes("function must") && /throw|fail\(/.test(reader), "must() helper");
  assert(!/\.catch\(\(\)\s*=>\s*(\[\]|null)\)/.test(reader), "swallowed failure");
  const repo = read("src/modules/platform-admin/server/PlatformAdminRepository.ts");
  assert(repo.includes("capsResult.error || financeResult.error || linksResult.error"), "identity access read checks errors");
});
check("Authority law: Super Admin gains platform administration only — never business capability", () => {
  assert(SUPER_ADMIN_OVERRIDE_CAPABILITIES.join() === ["users.view", "users.manage", "platform.admin_override"].join(), "override set changed");
  const base = resolveOperatingAccessFromGrants({ email: "sa@example.com", name: "SA", role: "facility_manager", capabilities: [] });
  const sa = applyPlatformSuperAdmin(base, true);
  for (const c of ["ops.view", "ops.create", "ops.edit", "finance.view", "finance.pay", "approvals.manage", "requests.view", "fm.authorize_protected"] as const) {
    assert(!hasCapability(sa.capabilities, c), `Super Admin holds ${c}`);
  }
  assert(hasCapability(sa.capabilities, "platform.admin_override") && hasCapability(sa.capabilities, "users.manage"), "platform administration authority");
  const granted = applyPlatformSuperAdmin(resolveOperatingAccessFromGrants({ email: "sa@example.com", name: "SA", role: null, capabilities: ["ops.view", "fm.authorize_protected"] }), true);
  assert(hasCapability(granted.capabilities, "ops.view") && !hasCapability(granted.capabilities, "fm.authorize_protected"), "explicit grant stays authoritative; FM step-up authority is not carried by Super Admin");
  assert(resolveProtectedActionAuthority(sa)?.mode === "platform_override", "override mode still distinguishable");
});
check("Operating role / facility assignment / title never confer capability", () => {
  const fm = resolveOperatingAccessFromGrants({ email: "fm@example.com", name: "FM", role: "facility_manager", facility: "NCC Annex", capabilities: [] });
  assert(fm.capabilities.length === 0, "operating role produced capabilities");
});

// ------------------------------------------------------------------ CATALOG / AUDIT DESCRIPTION
check("Capability catalog covers all administrable capabilities exactly once; labels are human-first", () => {
  assert(catalogCoversAllAdministrableCapabilities(), "catalog does not cover every administrable capability");
  assert(PLATFORM_ADMINISTRABLE_CAPABILITIES.length === 25, "expected 25 (24 + Batcave entry)");
  assert(CAPABILITY_DOMAINS.every((d) => d.capabilities.every((c) => c.label && c.label !== c.key)), "raw keys used as labels");
  assert(describeCapability("ops.edit").label === "Edit operational records" && !describeCapability("nope.nope").known, "describeCapability");
});
check("Audit events render as WHO did WHAT to WHOM with readable names", () => {
  const n = { actor: "Ada", person: "Bola", facility: "NCC Annex", previousFacility: null, moduleName: "Facility Management" };
  assert(describeAuditEvent("capability.granted", { capability: "ops.view" }, n).headline === "Granted “View operational records” to Bola", "grant");
  assert(describeAuditEvent("capability.revoked", { capability: "ops.view" }, n).headline.startsWith("Revoked"), "revoke");
  assert(describeAuditEvent("module.enabled", { moduleSlug: "x" }, n).detail.some((d) => /no one was granted access/.test(d)), "module enable is availability only");
  const role = describeAuditEvent("facility_assignment.role_changed", { previousOperationalRole: "fm_staff", operationalRole: "facility_manager" }, n);
  assert(/NCC Annex/.test(role.headline) && role.detail.some((d) => /context, not permission/.test(d)), "role change is context");
  assert(describeAuditEvent("facility_assignment.activated", {}, n).headline.startsWith("Reactivated") && describeAuditEvent("facility_assignment.deactivated", {}, n).headline.startsWith("Deactivated"), "assignment status wording");
  assert(describeAuditEvent("user.offboarded", { revoked: { platformCapabilityGrants: 3 } }, n).detail[0] === "Revoked 3 platform capability grants", "offboard detail");
  assert(!/[0-9a-f]{8}-[0-9a-f]{4}/.test(describeAuditEvent("profile.suspended", { previousStatus: "active", status: "suspended" }, { ...n, person: null }).headline), "no uuid in headline");
});

// ------------------------------------------------------------------ UI
check("Admin route: server-side Super Admin gate; unauthorised users get no console", () => {
  assert(layout.includes("isPlatformSuperAdminFromSlugs") && layout.includes("getPlatformSession"), "server gate");
  assert(/if \(!session \|\| !allowed\)/.test(layout) && layout.indexOf("<AdminConsoleProvider") > layout.indexOf("if (!session || !allowed)"), "children only render when authorised");
  for (const p of ["", "people", "people/[profileId]", "access", "modules", "audit"]) assert(existsSync(resolve(`src/app/(app)/admin/${p ? p + "/" : ""}page.tsx`)), `/admin/${p} page`);
});
check("Navigation: Admin Console entry only for Super Admin; five sections; not treated as FM", () => {
  assert(ADMIN_NAV_ITEMS.map((i) => i.label).join() === "Overview,People,Access,Modules,Audit", "sections");
  const compass = read("src/components/platform/OrganisationalCompass.tsx");
  assert(/\{isSuperAdmin \? \(\s*<div className="os-compass-control-plane">/.test(compass) && compass.indexOf("os-compass-control-plane") > compass.indexOf("</div>\n        )}") && compass.indexOf("os-compass-control-plane") < compass.indexOf("<AppFooter />"), "entry gated by Super Admin, anchored above the footer");
  assert(isAdminConsolePath("/admin/people/x") && !isAdminConsolePath("/administration") && !isOperationsPath("/admin") && resolveCurrentWorkspaceId("/admin") === null, "path helpers");
  assert(!ADMIN_NAV_ITEMS.some((i) => /facilit|system/i.test(i.label)), "no fake System / Facilities section");
});
check("People / invite / status / offboard use the canonical control plane", () => {
  assert(views.PeopleView.includes('"listPeople"') && views.PeopleView.includes('"createAccount"') && views.PersonView.includes('"issueTemporaryPassword"'), "people + invite");
  assert(views.PersonView.includes('"setProfileStatus"') && views.PersonView.includes('"offboardUser"') && views.PersonView.includes('"setFacilityAssignment"') && views.PersonView.includes('"getPerson"'), "person actions");
  assert(!/\/api\/users|\/api\/admin|UserService/.test(client), "client bypasses the control plane");
  assert(views.PersonView.includes("isSelf") && /disabled=\{isSelf\}/.test(views.PersonView), "self actions disabled");
  assert(views.PersonView.includes("Revoked grants are not restored"), "offboarding consequence stated");
});
check("Access: explicit grants only; operating context and Super Admin are read-only", () => {
  assert(views.AccessView.includes('"grantPlatformCapability"') && views.AccessView.includes('"revokePlatformCapability"'), "audited grant/revoke");
  assert(/Read-only/.test(views.AccessView) && !/Select all|selectAll/i.test(views.AccessView), "read-only Super Admin / no select-all");
  assert(views.AccessView.includes("Descriptive — grants nothing") && /do not give — or remove — any capability/.test(views.AccessView), "operating context is not permission");
  assert(!/adminCall\([^)]*(SuperAdmin|finance)/i.test(views.AccessView), "no super-admin / finance write");
  assert(views.AccessView.includes("FinanceAccess") && !/finance_capability|financeGrant/i.test(client.replace(/platform_finance\./g, "")), "finance access is read-only");
});
check("Modules: canonical enable/disable; enabling never grants access", () => {
  assert(views.ModulesView.includes('"setOrganisationModule"'), "canonical action");
  assert(/does not give anyone access/.test(views.ModulesView) && /No one is granted access/.test(views.ModulesView), "distinction stated twice");
});
check("Audit uses real platform IAM events; failure is not an empty history", () => {
  assert(views.AuditView.includes('"listAudit"') && reader.includes("platform_iam_audit_events") && !/operational_events/.test(reader), "source");
  assert(/Couldn.t load administrative history/.test(views.AuditView) && /does not mean nothing has happened/.test(views.AuditView), "error state");
  assert(/No matching changes/.test(views.AuditView), "empty state is distinct");
});
check("Overview: real data only — no invented health/uptime/score/telemetry", () => {
  assert(views.OverviewView.includes('"getOverview"'), "real read");
  assert(!/uptime|health score|security score|integration health|latency|telemetry|deploy/i.test(views.OverviewView + reader.slice(reader.indexOf("async overview"))), "invented data");
});
check("Every surface distinguishes loading / failure / empty (DataBoundary)", () => {
  const b = read("src/modules/platform-admin/client/ui.tsx");
  assert(/Couldn.t load/.test(b) && /did not respond/.test(b) && /Loading \{what\}/.test(b), "DataBoundary states");
  for (const v of ["PeopleView", "PersonView", "AccessView", "ModulesView", "OverviewView"]) assert(views[v].includes("DataBoundary"), `${v} lacks DataBoundary`);
});
check("Mutations: disabled while submitting, refresh authoritative state, no optimistic security UI", () => {
  for (const v of ["PeopleView", "PersonView", "AccessView", "ModulesView"]) {
    assert(/busy/.test(views[v]) && /setBusy\(true\)/.test(views[v]), `${v} double-submit guard`);
    assert(!/optimistic/i.test(views[v]), `${v} optimistic`);
  }
  assert(/onDone\(\)|reload\(\)|onChanged\(\)/.test(client), "state refreshed after mutation");
});
check("Browser code never imports server modules or privileged clients", () => {
  assert(!/server-only|createAdminClient|@\/modules\/platform-admin\/server|SUPABASE_SERVICE_ROLE/.test(client), "server import in client");
});
check("Brand: user-facing occurrences are SentraCore™", () => {
  const files = [...clientFiles, "src/app/(app)/admin/layout.tsx"].map((f) => strip(read(f)));
  for (const t of files) assert(!/Sentracore|Sentra Core|SENTRACORE/.test(t.replace(/sentracore-platform/g, "")), "unbranded");
  assert(layout.includes("SentraCore™ Admin Console"), "layout brand");
});

let failed = 0;
for (const r of results) {
  if (!r.ok) failed += 1;
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `\n      ${r.detail}` : ""}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
console.log(failed === 0 ? "ADMIN_CONSOLE: PASS" : "ADMIN_CONSOLE: FAIL");
process.exit(failed === 0 ? 0 : 1);
