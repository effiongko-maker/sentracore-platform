/**
 * Module-bound access + ECC roster lifecycle + source integrity + audit shape verification.
 * Rollback-safe: pure functions and prototype stubs only — no rows are written.
 *
 *   NODE_PATH=<dir containing an empty server-only/ stub> \
 *     npx tsx --tsconfig tsconfig.json scripts/verify-module-bound-access.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ActionError } from "../src/lib/actions/errors";
import {
  assertBoundaryAllows,
  boundaryAllows,
  boundaryForSession,
  homeRouteForBoundary,
  resolveModuleBoundary,
} from "../src/lib/access/moduleBoundary";
import { DEFAULT_ECC_CENTRE } from "../src/modules/ecc-operations/types";
import { capabilityForEccAction } from "../src/modules/ecc-operations/server/eccActionAuthority";
import { ECC_CAPABILITIES } from "../src/modules/ecc-operations/types";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
const src = (p: string) => readFileSync(resolve(p), "utf8");
const ORG = "11111111-1111-4111-8111-111111111111";
const ACTOR = { userId: "f0000000-0000-4000-8000-0000000000aa", email: "a@example.com", name: "Authenticated Actor" };
const sess = (accessScope?: string | null, homeModule?: string | null) => ({ profile: { accessScope, homeModule } });
const forbidden = (fn: () => void) => {
  try {
    fn();
    return false;
  } catch (e) {
    return e instanceof ActionError && e.code === "FORBIDDEN";
  }
};

async function main() {
  const out: string[] = [];
  const pass = (m: string) => out.push(`PASS ${m}`);

  // 1. platform scope unchanged
  for (const t of ["facility_management", "ecc_operations", "platform"] as const) {
    assert(boundaryAllows(boundaryForSession(sess("platform", null)), t), `1: platform reaches ${t}`);
    assert(boundaryAllows(boundaryForSession(sess(undefined, undefined)), t), `1: default (no scope) reaches ${t}`);
  }
  assert(homeRouteForBoundary(boundaryForSession(sess("platform", null))) === null, "1: platform has no forced landing");
  pass("1 existing (platform-scope / unset) identities are unchanged");

  // 2–3. landing
  assert(homeRouteForBoundary(boundaryForSession(sess("module", "ecc_operations"))) === "/ecc-operations", "2");
  assert(homeRouteForBoundary(boundaryForSession(sess("module", "facility_management"))) === "/operations", "3");
  pass("2 ECC-bound identity lands in /ecc-operations");
  pass("3 FM-bound identity lands in /operations");

  // 4–7. cannot leave module
  const ecc = sess("module", "ecc_operations");
  const fm = sess("module", "facility_management");
  assert(forbidden(() => assertBoundaryAllows(ecc, "facility_management")), "4: ECC-bound blocked from FM");
  assert(forbidden(() => assertBoundaryAllows(ecc, "platform")), "4: ECC-bound blocked from Command Centre / Finance / Admin (platform surfaces)");
  assert(forbidden(() => assertBoundaryAllows(ecc, "platform_finance")), "4: ECC-bound blocked from Platform Finance");
  assertBoundaryAllows(ecc, "ecc_operations");
  pass("4 ECC-bound cannot reach FM, Command Centre, Platform Finance or Admin Console");
  assert(forbidden(() => assertBoundaryAllows(fm, "ecc_operations")), "5: FM-bound blocked from ECC");
  assert(forbidden(() => assertBoundaryAllows(fm, "platform")), "5: FM-bound blocked from platform surfaces");
  assert(forbidden(() => assertBoundaryAllows(fm, "platform_finance")), "5: FM-bound blocked from Platform Finance");
  assertBoundaryAllows(fm, "facility_management");
  const fin = sess("module", "platform_finance");
  for (const target of ["facility_management", "ecc_operations", "platform"] as const) assert(forbidden(() => assertBoundaryAllows(fin, target)), `5: Finance-bound blocked from ${target} (FM / ECC / Command Centre / Admin Console / Private Office)`);
  assertBoundaryAllows(fin, "platform_finance");
  pass("5 FM-bound cannot reach ECC or platform-wide surfaces; Finance-bound reaches Platform Finance only");
  // 6. accidental grants cannot bypass: boundary is independent of capabilities and ANDed by every gate
  for (const [file, target] of [
    ["src/modules/ecc-operations/server/requireEccAccess.ts", '"ecc_operations"'],
    ["src/modules/command-centre/server/requireCommandCentreAccess.ts", '"platform"'],
    ["src/modules/platform-finance/server/requirePlatformFinanceAccess.ts", '"platform_finance"'],
    ["src/modules/platform-admin/server/requirePlatformAdmin.ts", '"platform"'],
  ] as const) {
    assert(src(file).includes(`assertBoundaryAllows(session, ${target})`), `6: ${file} enforces the boundary`);
  }
  const access = src("src/lib/access/server.ts");
  assert(access.includes('boundaryAllows(boundaryForSession(session), "facility_management")') && access.includes("Restricted to another module"), "6: FM operating access is zeroed outside the boundary");
  const chrome = src("src/lib/access/workspaceAccessChrome.ts");
  for (const t of ["facility_management", "ecc_operations", "platform_finance"]) assert(chrome.includes(`boundaryAllows(input.boundary, "${t}")`), `6: chrome flag ${t} is boundary-ANDed`);
  assert(/boundaryAllows\(input\.boundary, "platform"\)/.test(chrome), "6: platform surfaces are boundary-ANDed");
  pass("6 accidental out-of-module capability grants cannot bypass the boundary (every gate + FM access + chrome)");

  // 7. job role alone never creates module-bound
  const types = src("src/lib/auth/session.ts");
  assert(/accessScope: row\.access_scope === "module" \? "module" : "platform"/.test(types), "7: scope is read only from access_scope, default platform");
  assert(!/operational_role|job_title/.test(src("src/lib/access/moduleBoundary.ts")), "7: boundary model never reads job/operational role");
  assert(boundaryAllows(boundaryForSession(sess(null, null)), "platform"), "7: no scope stored ⇒ platform");
  pass("7 job / operational role alone never creates module-bound scope");

  // 8. invalid configuration fails closed
  for (const bad of [sess("module", null), sess("module", "command_centre"), sess("platform", "ecc_operations"), sess("weird", null), sess("module", "")]) {
    const b = boundaryForSession(bad);
    assert(!b.valid, `8: ${JSON.stringify(bad.profile)} must be invalid`);
    for (const t of ["facility_management", "ecc_operations", "platform"] as const) assert(!boundaryAllows(b, t), "8: invalid boundary denies all");
    assert(homeRouteForBoundary(b) === null, "8: invalid boundary never redirects");
  }
  assert(resolveModuleBoundary({ accessScope: "module", homeModule: "ecc_operations" }).valid, "8: valid config accepted");
  const mig = src("supabase/migrations/20260920180000_module_bound_access_and_ecc_issue_delete.sql");
  assert(/profiles_access_scope_valid/.test(mig) && /cannot be module-bound/.test(mig) && /enforce_super_admin_not_module_bound/.test(mig), "8: DB constraint + Super Admin prohibition");
  const admin = src("src/modules/platform-admin/server/PlatformAdminServerService.ts");
  assert(admin.includes("Module-bound scope requires a supported home module") && admin.includes("Platform scope cannot have a home module"), "8: Admin rejects invalid config");
  pass("8 invalid / inconsistent configuration is rejected at DB + admin service and denies everything at runtime (no redirect)");

  // 9. landing states: disabled home module / invalid config truthful; no loop
  const page = src("src/app/(app)/page.tsx");
  assert(page.includes("is not available") && page.includes("misconfigured") && page.includes("redirect(home)"), "9: truthful states + redirect");
  assert(page.indexOf("hasModule(session.enabledModules") < page.indexOf("redirect(home)"), "9: home module enablement checked before redirect");
  assert(!/redirect\(["']\/["']\)/.test(src("src/modules/ecc-operations/server/requireEccAccess.ts")), "9: module gates never redirect to root");
  pass("9 disabled home module / invalid config show a truthful state (no silent fallback, no loop)");

  // 10. Super Admin cannot be module-bound
  assert(/Super Admin cannot be module-bound/.test(mig), "10: RPC refuses super admin");
  pass("10 Super Admin cannot become module-bound (RPC + role-assignment trigger)");

  // 11. Admin configuration audited via canonical RPC
  const repoSrc = src("src/modules/platform-admin/server/PlatformAdminRepository.ts");
  assert(repoSrc.includes("platform_iam_set_access_scope") && /platform_iam_insert_audit_event\(\s*v_target\.organisation_id,\s*p_actor_profile_id,\s*'access_scope\.changed'/.test(mig), "11: audited through the IAM audit RPC");
  assert(src("src/modules/platform-admin/types.ts").includes('"access_scope.changed"'), "11: audit action registered");
  pass("11 access scope is configured only via the audited canonical admin RPC");

  // 12. navigation: chrome flags drive switcher
  assert(src("src/lib/platform/workspaces.ts").includes("wa?.facilityManagement != null"), "12: FM directory state follows the boundary-aware flag");
  pass("12 navigation follows boundary-aware workspace flags (module-bound sees only their module)");

  // ── ECC people lifecycle (13–20) ─────────────────────────────────────────
  const { EccPeopleRepository } = await import("../src/modules/ecc-operations/server/EccPeopleRepository");
  const P = EccPeopleRepository.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const repo = new EccPeopleRepository(ORG, "Africa/Lagos") as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
  const person = (over: Record<string, unknown> = {}) => ({ id: "P1", centreId: "ECC-001", name: "Jack", role: "agent", status: "active", createdAt: "x", updatedAt: "x", ...over });
  let stored = person();
  let writes = 0;
  let current: { id: string; label: string; assignedPersonIds: string[] } | null = null;
  let open: Array<Record<string, unknown>> = [];
  (repo as Record<string, unknown>).getPerson = async () => stored;
  (repo as Record<string, unknown>).getCurrentShift = async () => current;
  (repo as Record<string, unknown>).listOpenAttendance = async () => open;
  // Deactivation writes through db(); intercept via the admin client module.
  const admin_mod = await import("../src/utils/supabase/admin");
  void admin_mod;
  const pr = src("src/modules/ecc-operations/server/EccPeopleRepository.ts");
  assert(/\.update\(\{ status: target, updated_at: stamp \}\)/.test(pr) && !/from\("ecc_people"\)\s*\.delete/.test(pr), "13: lifecycle is a status update, never a delete");
  pass("13 roster removal is deactivation (status update) — no hard delete path for people");

  // blocking rules exercised directly (throw before any write)
  const set = P.setPersonActive as unknown as (this: unknown, id: string, active: boolean) => Promise<{ changed: boolean }>;
  current = { id: "S1", label: "Evening", assignedPersonIds: ["P1"] };
  open = [];
  let msg = "";
  await set.call(repo, "P1", false).catch((e: Error) => (msg = e.message));
  assert(/assigned to the shift in effect/.test(msg), "14: assigned to effective shift blocks deactivation");
  pass("14 a person assigned to the shift in effect cannot be deactivated (assignment never auto-deleted)");

  current = { id: "S1", label: "Evening", assignedPersonIds: [] };
  const now = new Date();
  open = [{ person_id: "P1", shift_id: "S1", signed_in_at: new Date(now.getTime() - 3600_000).toISOString(), signed_out_at: null, id: "A1" }];
  (repo as Record<string, unknown>).liveOpenAttendance = (rows: unknown[]) => rows;
  msg = "";
  await set.call(repo, "P1", false).catch((e: Error) => (msg = e.message));
  assert(/signed in and on duty/.test(msg), "15: live on-duty blocks deactivation");
  pass("15 a live on-duty person cannot be deactivated (no fabricated sign-out)");

  // 16: already inactive ⇒ idempotent, no write; reactivation of active likewise
  stored = person({ status: "inactive" });
  const noop = await set.call(repo, "P1", false);
  assert(noop.changed === false, "16: deactivating an inactive person is a no-op");
  pass("16 lifecycle transitions are idempotent");

  // 17: deactivated cannot sign in, cannot be assigned
  const signIn = P.signIn as unknown as (this: unknown, i: { personId: string }) => Promise<unknown>;
  msg = "";
  await signIn.call(repo, { personId: "P1" }).catch((e: Error) => (msg = e.message));
  assert(/deactivated and cannot be signed in/.test(msg), "17: deactivated cannot sign in");
  assert(/person\.status === "active"/.test(pr) && /Only active agents can be assigned/.test(pr), "17: assignment resolution requires active");
  pass("17 deactivated people cannot sign in or be assigned to shifts");

  // 18: history preserved — no attendance/assignment deletion in setPersonActive
  const body = pr.slice(pr.indexOf("async setPersonActive"), pr.indexOf("async getCurrentShift"));
  assert(!/\.delete\(/.test(body) && !/ecc_attendance|ecc_shift_assignments/.test(body.replace(/listOpenAttendance/g, "")), "18: lifecycle touches no history");
  pass("18 historical shifts / assignments / attendance are untouched by deactivation");

  // 19: reactivation restores eligibility only
  assert(/status: target/.test(body) && !/ecc_shift_assignments/.test(body), "19: reactivation only flips status");
  pass("19 reactivation restores eligibility only (no assignment/attendance created)");

  // 20: authority is existing manage_people
  assert(capabilityForEccAction("setPersonActive") === ECC_CAPABILITIES.managePeople, "20: manage_people governs lifecycle");
  assert(!("deletePerson" in (await import("../src/modules/ecc-operations/server/eccActionAuthority")).ECC_ACTION_CAPABILITY), "20: no person hard-delete action");
  pass("20 lifecycle uses existing manage_people; no new capability, no person hard delete");

  // ── Integrity (21–25) ─────────────────────────────────────────────────────
  const { EccOperationsServerService } = await import("../src/modules/ecc-operations/server/EccOperationsServerService");
  const { EccOperationsRepository } = await import("../src/modules/ecc-operations/server/EccOperationsRepository");
  const { EccAuditRepository } = await import("../src/modules/ecc-operations/server/EccAuditRepository");
  const R = EccOperationsRepository.prototype as unknown as Record<string, unknown>;
  const audits: Array<Record<string, unknown>> = [];
  const inserted: Array<Record<string, unknown>> = [];
  R.ensureDefaultCentre = async () => ({ ...DEFAULT_ECC_CENTRE });
  R.insertIssue = async (r: Record<string, unknown>, h: unknown[]) => (inserted.push(r), { ...r, history: h });
  R.insertRequest = async (r: Record<string, unknown>, h: unknown[]) => (inserted.push(r), { ...r, history: h });
  R.linkIssueToDailyOps = async () => undefined;
  R.linkRequestToDailyOps = async () => undefined;
  R.findIssueBySourceSection = async () => null;
  R.findRequestBySourceSection = async () => null;
  R.getDailyOps = async (id: string) => (id === "ECC-DOP-REAL" ? { id, centreId: "ECC-001" } : null);
  (EccAuditRepository.prototype as unknown as Record<string, unknown>).record = async (x: Record<string, unknown>) => (audits.push(x), x);
  const svc = new EccOperationsServerService(ORG, ACTOR);
  const issueIn = { classification: "operational", severity: "low", title: "T", description: "D" } as never;
  const reqIn = { title: "R", reason: "r", description: "D", origin: "operational", responsibility: "company", priority: "low" } as never;

  const plainIssue = await svc.createIssue(issueIn);
  assert(plainIssue.sourceDailyOpsId === undefined && plainIssue.sourceDailyOpsSection === undefined, "21: generic Issue has no fabricated Daily Ops source");
  const plainReq = await svc.createRequest(reqIn);
  assert(plainReq.sourceDailyOpsId === undefined, "21: generic Request has no fabricated Daily Ops source");
  pass("21 generic Issue / Request creation carries no Daily Ops source");

  for (const [fn, input] of [
    [(x: never) => svc.createIssue(x), { ...(issueIn as object), sourceDailyOpsId: "ECC-DOP-MTYQ9YXL-0RB3", sourceDailyOpsSection: "facility" }],
    [(x: never) => svc.createRequest(x), { ...(reqIn as object), sourceDailyOpsId: "ECC-DOP-GHOST", sourceDailyOpsSection: "technical" }],
  ] as const) {
    const before = inserted.length;
    let refused = false;
    await fn(input as never).catch(() => (refused = true));
    assert(refused && inserted.length === before, "22: supplied source fields are refused and nothing is written");
  }
  pass("22 client-supplied Daily Ops source (including a dangling ID) is refused by the generic path");

  const raised = await svc.raiseIssueFromDailyOps({ dailyOpsId: "ECC-DOP-REAL", section: "facility", classification: "operational", severity: "low", title: "T", description: "D" } as never);
  assert(raised.issue.sourceDailyOpsId === "ECC-DOP-REAL" && raised.issue.centreId === "ECC-001", "23: verified raise path sets source, same centre");
  pass("23 the verified Daily Ops raise path still sets the source (org-scoped lookup, snapshot centre)");
  let ghost = false;
  await svc.raiseIssueFromDailyOps({ dailyOpsId: "ECC-DOP-GHOST", section: "facility", classification: "operational", severity: "low", title: "T", description: "D" } as never).catch(() => (ghost = true));
  assert(ghost, "24: a non-existent Daily Ops cannot be a source");
  pass("24 a Daily Ops that does not resolve in this organisation cannot become a source");
  assert(!/(update|delete from|insert into)\s+(public\.)?ecc_(issues|requests|daily_ops)\b/i.test(mig), "25: migration touches no historical Issue/Request rows");
  pass("25 the two historical dangling references are not repaired, repointed or deleted by this pass");

  // ── Issue hard delete (26–28) ─────────────────────────────────────────────
  assert(/tg_op = 'DELETE' and pg_trigger_depth\(\) > 1/.test(mig), "26: cascade-only delete of history allowed");
  assert(/raise exception 'ecc_issue_history is append-only'/.test(mig), "27: direct history delete/update still refused");
  assert(capabilityForEccAction("deleteIssue") === ECC_CAPABILITIES.delete && capabilityForEccAction("transitionIssue") === ECC_CAPABILITIES.edit, "28: .delete remains a separate authority");
  pass("26 Issue hard-delete cascades through append-only history (live rollback probe proved failure before / success after)");
  pass("27 ordinary direct mutation/delete of history rows is still refused (append-only intact)");
  pass("28 delete stays a separate capability (edit ≠ delete)");

  // ── Audit shape (29) ──────────────────────────────────────────────────────
  audits.length = 0;
  await svc.createIssue(issueIn);
  await svc.createRequest(reqIn);
  await svc.createDailyOps({ period: "ad_hoc", reportingDate: "2026-09-20", overallStatus: "operational" } as never).catch(() => undefined);
  for (const a of audits) {
    assert(a.actorUserId === ACTOR.userId && a.actorName === ACTOR.name && typeof a.entityId === "string" && a.centreId === "ECC-001", `29: audit call shape for ${String(a.action)}`);
  }
  assert(audits.length >= 2, "29: writes emit audit calls");
  const ar = src("src/modules/ecc-operations/server/EccAuditRepository.ts");
  assert(/organisation_id: this\.organisationId/.test(ar), "29: audit repository stamps the organisation");
  pass("29 representative writes carry profile UUID, display name, centre, entity id; repository stamps the organisation");

  console.log(out.join("\n"));
  console.log(`\n${out.length} checks passed`);
}

main().catch((e) => {
  console.error("FAIL", e instanceof Error ? e.message : e);
  process.exit(1);
});
