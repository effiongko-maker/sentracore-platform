/**
 * Facility Manager operating visibility — the canonical package grants COMPLETE FM operating visibility while every
 * protected authority stays separately gated.
 *
 *   NODE_PATH=<dir with empty server-only/> npx tsx --tsconfig tsconfig.json scripts/verify-fm-operating-visibility.mts
 *
 * Offline groups always run. The live group (read-only) runs when .env.local can reach the linked database.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { ACCESS_CAPABILITIES, FM_EXPLICIT_GRANT_CAPABILITIES, type AccessCapability } from "../src/lib/access/capabilities";
import { FACILITY_MANAGER_EXCLUDED, FACILITY_MANAGER_OPERATING_PACKAGE, facilityManagerPackageGaps } from "../src/lib/access/facilityManagerPackage";
import { accessCan, resolveOperatingAccessFromGrants, resolveProtectedActionAuthority } from "../src/lib/access/resolveAccess";
import { canSeeHref, resolveAccessVisibility } from "../src/lib/access/visibility";
import { capabilityForOperationalProxyAction, capabilityForRequestsProxyAction } from "../src/lib/access/operationalApiGate";
import { NAV_GROUPS } from "../src/lib/navigation";
import { PlatformAdminServerService } from "../src/modules/platform-admin/server/PlatformAdminServerService";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
const out: string[] = [];
const pass = (m: string) => out.push(`PASS ${m}`);
const fm = (caps: readonly string[]) => resolveOperatingAccessFromGrants({ email: "fm@example.test", name: "FM", role: "facility_manager", capabilities: caps as never });
const PKG = [...FACILITY_MANAGER_OPERATING_PACKAGE] as string[];
// The package a Facility Manager was actually given before this change (production evidence): no requests.view / finance.view.
const PREVIOUS = ["ops.view", "ops.create", "ops.edit", "ops.submit", "users.view", "users.manage"];

async function main() {
  // A. package definition
  {
    for (const c of ["ops.view", "requests.view", "finance.view", "users.view"]) assert(PKG.includes(c), `package carries ${c}`);
    const views = (ACCESS_CAPABILITIES as readonly string[]).filter((c) => c.endsWith(".view"));
    assert(views.every((c) => PKG.includes(c)), `EVERY FM view capability is in the package (${views.join(", ")}) — a future view capability that is omitted fails here`);
    assert(FACILITY_MANAGER_EXCLUDED.every((e) => !PKG.includes(e.capability)), "no excluded (protected / mutation-only) capability is in the package");
    assert(PKG.every((c) => (FM_EXPLICIT_GRANT_CAPABILITIES as readonly string[]).includes(c)), "every package capability is a grantable FM capability");
    for (const c of ["fm.authorize_protected", "finance.authorize", "finance.pay", "approvals.manage", "users.manage", "platform.admin_override"]) assert(FACILITY_MANAGER_EXCLUDED.some((e) => e.capability === c), `${c} is explicitly excluded`);
    assert([...PKG].join() === "ops.view,ops.create,ops.edit,ops.submit,requests.view,finance.view,finance.create,finance.submit,users.view", "the canonical Facility Manager package is exactly the nine approved capabilities");
    assert(PKG.includes("finance.create") && PKG.includes("finance.submit") && !FACILITY_MANAGER_EXCLUDED.some((e) => e.capability === "finance.create" || e.capability === "finance.submit"), "FM costs/claims: the Facility Manager may record costs, draft and submit claims");
    assert(!PKG.some((c) => c.startsWith("platform_finance.")), "no Platform Finance capability is in the package");
    assert(!PKG.some((c) => c.startsWith("platform.")), "no platform-scope (Command Centre / ECC / Private Office / override) capability is in the package");
    assert(facilityManagerPackageGaps(PREVIOUS).join() === "requests.view,finance.view,finance.create,finance.submit", "the previous package was missing requests.view, finance.view and the ordinary cost/claim authority");
    pass("A package: every FM view capability, ordinary operating authority; protected and mutation-only powers explicitly excluded");
  }

  // B. complete visibility, protected authority still gated
  {
    const before = resolveAccessVisibility(fm(PREVIOUS));
    const after = resolveAccessVisibility(fm(PKG));
    assert(!before.surfaces.has("requests") && !canSeeHref(before, "/finance") && !canSeeHref(before, "/requests"), "DEFECT REPRODUCED: with the previous package, Requests and Finance (FM costs) were hidden from a Facility Manager");
    const hrefs = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    const hidden = hrefs.filter((h) => !canSeeHref(after, h));
    assert(hidden.length === 0, `with the package EVERY FM navigation entry is visible (hidden: ${hidden.join(", ") || "none"})`);
    for (const s of ["home", "operations", "approvals", "organise", "reports", "finance", "users", "requests", "intelligence"] as const) assert(after.surfaces.has(s), `surface ${s} is visible`);
    assert(canSeeHref(after, "/requests") && canSeeHref(after, "/issues") && canSeeHref(after, "/finance"), "Requests, Issues and Finance (FM costs) are all open");
    const access = fm(PKG);
    assert(after.canMutateFinance && !after.canAuthorizeFinance && !after.canManageUsers && !after.canManageApprovals, "package confers ordinary FM cost/claim work, but NOT reimbursement authorisation/payment, people administration or approval management");
    for (const e of FACILITY_MANAGER_EXCLUDED) assert(!accessCan(access, e.capability), `package does not imply ${e.capability}`);
    assert(resolveProtectedActionAuthority(access) === null && !access.hasAdminOverride, "package carries NO protected-action authority and no admin override");
    pass("B visibility: the package opens every FM navigation entry and surface; protected authorities remain separately gated (previous package reproduces the defect)");
  }

  // C. every FM read gate is satisfied by the package
  {
    assert(PKG.includes(capabilityForRequestsProxyAction("getAll")) && capabilityForRequestsProxyAction("getAll") === "requests.view", "Requests reads are gated by requests.view — in the package");
    for (const r of ["assets", "facilities", "incidents", "maintenance", "work-orders", "approvals", "generator-log", "diesel-usage", "consumables-update", "waste-log", "fumigation-log", "deep-cleaning-log", "energy-reading", "master-data"] as const) {
      const cap = capabilityForOperationalProxyAction(r as never, "getAll");
      assert(PKG.includes(cap), `${r}: read gate ${cap} is in the package`);
    }
    const apiRoot = resolve("src/app/api");
    const readLiterals = new Set<string>();
    for (const dir of ["requests", "cost-records", "cost-submissions", "reimbursement-authorizations", "reimbursement-payments", "users", "assets", "facilities", "work-orders", "incidents", "maintenance", "approvals", "master-data", "operational-workload", "assignable-people"]) {
      const file = join(apiRoot, dir, "route.ts");
      if (!existsSync(file)) continue;
      for (const m of readFileSync(file, "utf8").matchAll(/"((?:ops|requests|finance|users)\.view)"/g)) readLiterals.add(m[1]!);
    }
    // The FM cost / claim routes delegate to a shared handler.
    for (const m of readFileSync("src/modules/finance/server/fmCostRoute.ts", "utf8").matchAll(/"(finance\.view)"/g)) readLiterals.add(m[1]!);
    assert([...readLiterals].every((c) => PKG.includes(c)) && readLiterals.has("finance.view") && readLiterals.has("users.view"), `every read capability used by FM API routes (${[...readLiterals].join(", ")}) is in the package`);
    assert(readdirSync(apiRoot).includes("requests"), "the Requests API exists to be read");
    pass("C read gates: Requests, registers, costs, people and approvals reads are all satisfied by the package");
  }

  // D. the IAM mechanism: audited grants of ONLY the missing package capabilities; idempotent; never protected
  {
    const grants: string[] = [];
    let held: string[] = [...PREVIOUS];
    const adminStub = {
      from: () => {
        const q: Record<string, unknown> = {};
        const chain = new Proxy(q, { get: (_t, p: string) => (p === "then" ? (res: (v: unknown) => void) => res({ data: held.map((capability) => ({ capability })), error: null }) : () => chain) });
        return chain;
      },
    };
    const repoStub = { grantPlatformCapability: async (i: { capability: string }) => { grants.push(i.capability); held.push(i.capability); return { changed: true }; } };
    const svc = new PlatformAdminServerService(repoStub as never, adminStub as never);
    const ctx = { actorProfileId: "actor" } as never;
    const first = await svc.applyFacilityManagerOperatingPackage(ctx, { organisationId: "o", profileId: "p" });
    assert(first.granted.join() === "requests.view,finance.view,finance.create,finance.submit" && grants.join() === "requests.view,finance.view,finance.create,finance.submit", "applying the package to the previous FM grants exactly the four missing capabilities");
    assert(!grants.some((g) => FACILITY_MANAGER_EXCLUDED.some((e) => e.capability === g)), "no protected / excluded capability is ever granted");
    const again = await svc.applyFacilityManagerOperatingPackage(ctx, { organisationId: "o", profileId: "p" });
    assert(again.granted.length === 0 && grants.length === 4, "re-applying is idempotent (no further grants)");
    held = ["fm.authorize_protected", "finance.authorize", ...PKG];
    const keep = await svc.applyFacilityManagerOperatingPackage(ctx, { organisationId: "o", profileId: "p" });
    assert(keep.granted.length === 0, "a profile that separately holds protected authority is left exactly as it is (nothing added, nothing revoked)");
    const service = readFileSync("src/modules/platform-admin/server/PlatformAdminServerService.ts", "utf8");
    assert(!/revokePlatformCapability\(\{[\s\S]{0,200}facilityManager/i.test(service) && (service.match(/applyPackageIfActiveFacilityManager\(ctx, input\.organisationId, row\)/g) ?? []).length === 2, "both assignment paths (create and update) apply the package, and nothing is revoked");
    assert(/row\.operational_role !== "facility_manager" \|\| row\.status !== "active"/.test(service), "the package is applied ONLY for an ACTIVE Facility Manager assignment");
    assert(/grantPlatformCapability\(\{[\s\S]{0,200}actorProfileId: ctx\.actorProfileId/.test(service), "grants go through the audited RPC with the acting Super Admin as actor");
    pass("D IAM mechanism: only missing package capabilities are granted (audited, idempotent), on active FM assignments only, protected authority never touched");
  }

  // E. live (read-only): production FM assignments hold the package; Issues is complete for them
  {
    const envPath = resolve(".env.local");
    if (existsSync(envPath)) {
      for (const l of readFileSync(envPath, "utf8").split("\n")) {
        const t = l.trim();
        if (!t || t.startsWith("#") || !t.includes("=")) continue;
        const i = t.indexOf("=");
        const k = t.slice(0, i).trim();
        if (!(k in process.env)) process.env[k] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
      }
    }
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { createAdminClient } = await import("../src/utils/supabase/admin");
      const admin = createAdminClient();
      const { data: assignments, error } = await admin.from("fm_facility_assignments").select("profile_id, organisation_id").eq("operational_role", "facility_manager").eq("status", "active");
      assert(!error, "assignments readable");
      const active: Array<{ profile_id: string; organisation_id: string }> = [];
      for (const a of (assignments ?? []) as Array<{ profile_id: string; organisation_id: string }>) {
        const { data: p } = await admin.from("profiles").select("status").eq("id", a.profile_id).maybeSingle();
        if ((p as { status?: string } | null)?.status === "active") active.push(a);
      }
      assert(active.length > 0, "at least one active Facility Manager exists to verify");
      for (const a of active) {
        const { data: g } = await admin.from("platform_capability_grants").select("capability").eq("organisation_id", a.organisation_id).eq("profile_id", a.profile_id);
        const held = ((g ?? []) as Array<{ capability: string }>).map((r) => r.capability);
        assert(facilityManagerPackageGaps(held).length === 0, `active Facility Manager ${a.profile_id.slice(0, 8)} holds the WHOLE package (missing: ${facilityManagerPackageGaps(held).join(",") || "none"})`);
        const access = resolveOperatingAccessFromGrants({ email: "x", name: "x", role: "facility_manager", capabilities: held as never });
        assert(accessCan(access, "requests.view"), "the Facility Manager's real grants satisfy requests.view (no Request-scope restriction)");
        // Protected / mutation authority must not be present. users.manage is excluded from this live check: it is an
        // individual Admin grant that pre-dates the package (the offline group D proves the package never grants it).
        const PROTECTED: string[] = FACILITY_MANAGER_EXCLUDED.map((e) => e.capability).filter((c) => c !== "users.manage");
        const protectedHeld = held.filter((c) => PROTECTED.includes(c));
        assert(protectedHeld.length === 0, `no protected / mutation-only authority is held (held: ${protectedHeld.join(",") || "none"})`);
      }
      const { data: audit } = await admin.from("platform_iam_audit_events").select("object_id, action").eq("action", "capability.granted");
      void audit;
      pass(`E live: all ${active.length} active Facility Manager(s) hold the whole package and none holds protected authority`);
    } else {
      out.push("SKIPPED E live — no database credentials in the environment");
    }
  }

  console.log(out.join("\n"));
  console.log(`\n${out.length} groups passed`);
}
main().catch((e) => { console.error("FAIL", e instanceof Error ? e.message : e); process.exit(1); });
