/**
 * Admin Console → Person → Access → Platform Finance access, administered under the explicit control-plane grant
 * platform_finance.access.manage. Static checks on the migration / UI / route, plus behaviour of the server module
 * against an in-memory model of the audited finance_iam_* functions. No database access.
 *
 *   NODE_PATH=<dir with empty server-only/> npx tsx --tsconfig tsconfig.json scripts/verify-finance-access-administration.mts
 */
import { readFileSync, readdirSync } from "node:fs";
import {
  FINANCE_ACCESS_ASSIGNABLE_CAPABILITIES,
  loadFinanceAccessEditor,
  updateFinanceAccess,
} from "../src/modules/platform-admin/server/financeAccessAdministration";
import { PLATFORM_ADMINISTRABLE_CAPABILITIES, PLATFORM_FINANCE_ACCESS_MANAGE } from "../src/modules/platform-admin/types";
import { CAPABILITY_DOMAINS } from "../src/modules/platform-admin/capabilityCatalog";
import { groupFinanceCapabilities } from "../src/modules/platform-admin/client/financeCapabilityGroups";
import { PLATFORM_FINANCE_CAPABILITIES } from "../src/modules/platform-finance/types";

function check(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const read = (p: string) => readFileSync(p, "utf8");
const sqlStrip = (s: string) => s.replace(/--.*$/gm, "");
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
function fnBody(sql: string, name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  check(start >= 0, `function ${name} defined`);
  const open = sql.indexOf("$$", start);
  return sql.slice(open + 2, sql.indexOf("$$", open + 2));
}

// ---------------------------------------------------------------------------------------------------------------
// In-memory model of the tables and the finance_iam_* functions (mirrors the migration's SQL).
// ---------------------------------------------------------------------------------------------------------------
type Row = Record<string, unknown>;
const ORG = "org-1";
const ORG2 = "org-2";
const EFFIONG = "p-effiong"; // Super Admin + explicit access.manage, no Finance access
const VICTOR = "p-victor"; // Super Admin (and override-capable) without access.manage
const TOSIN = "p-tosin";
const SUSPENDED = "p-suspended";
const OUTSIDER = "p-outsider"; // another organisation
const PAYCHEX = "co-paychex";
const OTHER_CO = "co-other";
const FOREIGN_CO = "co-foreign";

function makeDb() {
  const t: Record<string, Row[]> = {
    profiles: [
      { id: EFFIONG, organisation_id: ORG, status: "active" },
      { id: VICTOR, organisation_id: ORG, status: "active" },
      { id: TOSIN, organisation_id: ORG, status: "active" },
      { id: SUSPENDED, organisation_id: ORG, status: "suspended" },
      { id: OUTSIDER, organisation_id: ORG2, status: "active" },
    ],
    platform_capability_grants: [
      { id: "g1", organisation_id: ORG, profile_id: EFFIONG, capability: PLATFORM_FINANCE_ACCESS_MANAGE },
      { id: "g2", organisation_id: ORG, profile_id: VICTOR, capability: "platform.command_centre.view" },
    ],
    finance_capability_grants: [],
    finance_company_access: [],
    finance_companies: [
      { id: PAYCHEX, organisation_id: ORG, name: "PayChex" },
      { id: OTHER_CO, organisation_id: ORG, name: "Other Co" },
      { id: FOREIGN_CO, organisation_id: ORG2, name: "Foreign" },
    ],
    finance_financial_account_access: [],
    finance_audit_events: [],
  };
  const touched = new Set<string>();
  const rpcCalls: string[] = [];
  let seq = 0;

  const fail = (message: string) => ({ data: null, error: { message: `finance_iam: ${message}` } });
  function requireAdmin(actor: string, org: string, target: string): string | null {
    const a = t.profiles.find((p) => p.id === actor);
    if (!a || a.organisation_id !== org || a.status !== "active") return "actor is not an active member of the organisation";
    if (!t.platform_capability_grants.some((g) => g.organisation_id === org && g.profile_id === actor && g.capability === PLATFORM_FINANCE_ACCESS_MANAGE))
      return "Finance access administration is not authorised";
    if (actor === target) return "you cannot change your own Finance access";
    const tg = t.profiles.find((p) => p.id === target);
    if (!tg || tg.organisation_id !== org) return "target profile is not a member of the organisation";
    if (tg.status !== "active") return "Finance access can only be changed for active accounts";
    return null;
  }
  const audit = (org: string, company: string | null, actor: string, action: string, target: string, detail: Row) =>
    t.finance_audit_events.push({ organisation_id: org, company_id: company, actor_profile_id: actor, action, object_type: "profile", object_id: target, details: { target_profile_id: target, ...detail } });

  function rpc(fn: string, args: Row) {
    rpcCalls.push(fn);
    const actor = String(args.p_actor_profile_id), org = String(args.p_organisation_id), target = String(args.p_target_profile_id);
    const refusal = requireAdmin(actor, org, target);
    if (refusal) return fail(refusal);
    if (fn === "finance_iam_grant_capability" || fn === "finance_iam_revoke_capability") {
      const cap = String(args.p_capability);
      const i = t.finance_capability_grants.findIndex((g) => g.organisation_id === org && g.profile_id === target && g.capability === cap);
      if (fn === "finance_iam_grant_capability") {
        if (!(Object.values(PLATFORM_FINANCE_CAPABILITIES) as string[]).includes(cap)) return fail(`capability ${cap} is not a Platform Finance capability`);
        if (i >= 0) return { data: false, error: null };
        t.finance_capability_grants.push({ id: `c${++seq}`, organisation_id: org, profile_id: target, capability: cap });
        audit(org, null, actor, "finance.access.capability_granted", target, { capability: cap });
      } else {
        if (i < 0) return { data: false, error: null };
        t.finance_capability_grants.splice(i, 1);
        audit(org, null, actor, "finance.access.capability_revoked", target, { capability: cap });
      }
      return { data: true, error: null };
    }
    const company = String(args.p_company_id);
    const i = t.finance_company_access.findIndex((g) => g.organisation_id === org && g.profile_id === target && g.company_id === company);
    if (fn === "finance_iam_grant_company_access") {
      if (!t.finance_companies.some((c) => c.id === company && c.organisation_id === org)) return fail("company is not a Finance company of the organisation");
      if (i >= 0) return { data: false, error: null };
      t.finance_company_access.push({ id: `a${++seq}`, organisation_id: org, profile_id: target, company_id: company });
      audit(org, company, actor, "finance.access.company_granted", target, { company_id: company });
      return { data: true, error: null };
    }
    if (fn === "finance_iam_revoke_company_access") {
      if (t.finance_financial_account_access.some((a) => a.profile_id === target && a.company_id === company))
        return fail("remove this person's restricted financial-account access in the company first");
      if (i < 0) return { data: false, error: null };
      t.finance_company_access.splice(i, 1);
      audit(org, company, actor, "finance.access.company_revoked", target, { company_id: company });
      return { data: true, error: null };
    }
    throw new Error(`unexpected rpc ${fn}`);
  }

  function from(table: string) {
    touched.add(table);
    const filters: Array<[string, unknown]> = [];
    let cols: string | null = null;
    const rows = () => (t[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
    const project = (r: Row) => (cols ? Object.fromEntries(cols.split(",").map((c) => c.trim()).map((c) => [c, r[c]])) : r);
    const q = {
      select(c: string) { cols = c; return q; },
      eq(k: string, v: unknown) { filters.push([k, v]); return q; },
      order() { return q; },
      async maybeSingle() { const r = rows(); return { data: r[0] ? project(r[0]) : null, error: null }; },
      then(res: (v: { data: Row[]; error: null }) => unknown, rej?: (e: unknown) => unknown) {
        return Promise.resolve({ data: rows().map(project), error: null }).then(res, rej);
      },
      insert() { throw new Error(`direct insert into ${table}`); },
      delete() { throw new Error(`direct delete from ${table}`); },
      update() { throw new Error(`direct update of ${table}`); },
      upsert() { throw new Error(`direct upsert into ${table}`); },
    };
    return q;
  }
  return { t, touched, rpcCalls, client: { from, rpc: async (fn: string, args: Row) => rpc(fn, args) } };
}

const target = (db: ReturnType<typeof makeDb>, id: string) => {
  const p = db.t.profiles.find((r) => r.id === id);
  return p ? { organisation_id: p.organisation_id as string | null, status: String(p.status) } : null;
};
async function rejects(p: Promise<unknown>, code: string, pattern: RegExp) {
  try {
    await p;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    check(err.code === code && pattern.test(err.message ?? ""), `expected ${code} /${pattern.source}/, got ${err.code} ${err.message}`);
    return;
  }
  throw new Error(`expected rejection ${code} /${pattern.source}/`);
}

async function main() {
  const out: string[] = [];
  const migration = read("supabase/migrations/20260924100000_finance_access_administration.sql");
  const sql = sqlStrip(migration);
  const moduleSrc = read("src/modules/platform-admin/server/financeAccessAdministration.ts");
  const panel = read("src/modules/platform-admin/client/FinanceAccessPanel.tsx");
  const accessView = read("src/modules/platform-admin/client/AccessView.tsx");
  const route = read("src/app/api/platform-admin/route.ts");
  const service = read("src/modules/platform-admin/server/PlatformAdminServerService.ts");
  const financeGuard = read("src/modules/platform-finance/server/requirePlatformFinanceAccess.ts");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = (db: ReturnType<typeof makeDb>) => db.client as any;
  const opCaps = Object.values(PLATFORM_FINANCE_CAPABILITIES) as string[];

  // 1. Explicit control-plane authority.
  const requireAdmin = sqlStrip(fnBody(migration, "finance_iam_require_access_admin"));
  check(/from public\.platform_capability_grants[\s\S]*capability = 'platform_finance\.access\.manage'/.test(requireAdmin), "DB authority reads the explicit platform_capability_grants row");
  check(!/finance_capability_grants|finance_company_access/.test(requireAdmin), "DB authority never consults Finance grants or company membership");
  check(/\.from\("platform_capability_grants"\)[\s\S]{0,200}\.eq\("capability", PLATFORM_FINANCE_ACCESS_MANAGE\)/.test(moduleSrc), "server authority reads the explicit grant row");
  check((PLATFORM_ADMINISTRABLE_CAPABILITIES as readonly string[]).includes(PLATFORM_FINANCE_ACCESS_MANAGE), "administrable through the existing Admin Console grant path");
  check(CAPABILITY_DOMAINS.some((d) => d.id === "platform_finance_admin" && d.capabilities.some((c) => c.key === PLATFORM_FINANCE_ACCESS_MANAGE)), "offered in Access → Platform Finance administration");
  check(/or capability = 'platform_finance\.access\.manage'/.test(sql) && /'platform\.executive\.private_office\.access',\s*'platform_finance\.access\.manage',/.test(sql), "format check and platform IAM allowlist accept it");
  out.push("PASS 1 platform_finance.access.manage is an explicit platform_capability_grants (control-plane) grant");

  // 2 / 3. Super Admin / platform.admin_override do not imply it.
  check(!/super_admin|is_platform_super_admin|admin_override|role_slug/i.test(requireAdmin), "DB authority has no Super Admin / override shortcut");
  const moduleCode = moduleSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  check(!/SuperAdmin|super_admin|admin_override|accessCan|hasPlatformCapability|roleSlugs/.test(moduleCode), "server authority has no Super Admin / override shortcut");
  {
    const db = makeDb(); // VICTOR is a Super Admin (reaches the Admin Console) without the explicit grant.
    const ed = await loadFinanceAccessEditor(admin(db), { organisationId: ORG, profileId: TOSIN, actorProfileId: VICTOR, target: target(db, TOSIN) });
    check(ed.canManage === false && ed.reason === null, "Super Admin without the grant gets the read-only summary");
    check(!db.touched.has("finance_companies") && !db.touched.has("finance_capability_grants"), "no editor data loaded without the grant");
    await rejects(updateFinanceAccess(admin(db), { organisationId: ORG, profileId: TOSIN, actorProfileId: VICTOR, target: target(db, TOSIN), companyIds: [PAYCHEX], capabilities: [] }), "FORBIDDEN", /access\.manage/);
    check(db.rpcCalls.length === 0 && db.t.finance_company_access.length === 0, "nothing written");
  }
  out.push("PASS 2-3 Super Admin alone, and platform.admin_override, do not imply access.manage (server and database)");

  // 4-7. access.manage grants no Finance entry, company access, capability or data.
  check(!opCaps.includes(PLATFORM_FINANCE_ACCESS_MANAGE), "not an operational Finance capability");
  const allowlist = sqlStrip(fnBody(migration, "finance_iam_is_allowed_capability"));
  const allowed = [...allowlist.matchAll(/'(platform_finance\.[a-z0-9_.]+)'/g)].map((m) => m[1]);
  check(allowed.length === opCaps.length && opCaps.every((c) => allowed.includes(c)) && !allowed.includes(PLATFORM_FINANCE_ACCESS_MANAGE), "DB Finance allowlist == operational capabilities, without access.manage");
  const workspace = financeGuard.slice(financeGuard.indexOf("export async function requirePlatformFinanceWorkspaceAccess"));
  check(/\.from\("finance_capability_grants"\)/.test(workspace) && !/platform_capability_grants|access\.manage/.test(financeGuard), "Finance entry still requires a finance_capability_grants row; access.manage is never read by Finance");
  check(!/insert into public\.platform_capability_grants/.test(sql) && !/manage_setup/.test(sql.replace(/'platform_finance\.manage_setup',?/g, "")), "no manage_setup / Super Admin bootstrap");
  const tables = new Set([...moduleSrc.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1]));
  check([...tables].every((x) => ["platform_capability_grants", "finance_capability_grants", "finance_company_access", "finance_companies"].includes(x)), `server module reads access tables only (${[...tables].join(", ")})`);
  check(/\.from\("finance_companies"\)\s*\.select\("id, name"\)/.test(moduleSrc), "company names only — no Finance operational data");
  {
    const db = makeDb();
    await updateFinanceAccess(admin(db), { organisationId: ORG, profileId: TOSIN, actorProfileId: EFFIONG, target: target(db, TOSIN), companyIds: [PAYCHEX], capabilities: [opCaps[0]] });
    check(!db.t.finance_capability_grants.some((g) => g.profile_id === EFFIONG) && !db.t.finance_company_access.some((g) => g.profile_id === EFFIONG), "administering gives the administrator no Finance rows");
  }
  out.push("PASS 4-7 access.manage gives no Platform Finance entry, company access, Finance capability or Finance data");

  // 8. A holder administers another active same-organisation person entirely from the Admin Console.
  {
    const db = makeDb();
    const ed = await loadFinanceAccessEditor(admin(db), { organisationId: ORG, profileId: TOSIN, actorProfileId: EFFIONG, target: target(db, TOSIN) });
    check(ed.canManage === true && ed.companies.map((c) => c.id).join() === [PAYCHEX, OTHER_CO].join() && !ed.companies.some((c) => c.id === FOREIGN_CO), "editor lists this organisation's companies only");
    const r = await updateFinanceAccess(admin(db), { organisationId: ORG, profileId: TOSIN, actorProfileId: EFFIONG, target: target(db, TOSIN), companyIds: [PAYCHEX], capabilities: [opCaps[0], opCaps[1]] });
    check(r.granted === 3 && r.revoked === 0 && r.selectedCompanyIds.join() === PAYCHEX && r.selectedCapabilities.length === 2, "grants applied");
    check(db.rpcCalls.join() === "finance_iam_grant_company_access,finance_iam_grant_capability,finance_iam_grant_capability", "company scope granted before capabilities");
  }
  check(route.includes('case "getFinanceAccessEditor"') && route.includes('case "updateFinanceAccess"') && /financeCapabilities/.test(route), "Admin Console route actions");
  check(/async getFinanceAccessEditor\(/.test(service) && /async updateFinanceAccess\(/.test(service), "service methods");
  check(accessView.includes("<FinanceAccessPanel organisationId={organisationId} profileId={p.profileId}") && !/administered inside Platform Finance/.test(accessView), "Access page renders the panel; misleading copy gone");
  check(panel.includes('adminCall<FinanceAccessEditor>("getFinanceAccessEditor"') && panel.includes('adminCall<FinanceAccessUpdateResult>("updateFinanceAccess"'), "panel uses the Admin Console API");
  check(!readdirSync("src/app/(app)/platform-finance").includes("access"), "no /platform-finance/access route");
  out.push("PASS 8 a holder administers an active same-organisation person's Finance access from Admin Console → Access");

  // 9 / 10. Self and cross-organisation refused; inactive refused; foreign company refused.
  {
    const db = makeDb();
    const self = await loadFinanceAccessEditor(admin(db), { organisationId: ORG, profileId: EFFIONG, actorProfileId: EFFIONG, target: target(db, EFFIONG) });
    check(self.canManage === false && /your own/.test(String(self.reason)), "self: read-only with reason");
    await rejects(updateFinanceAccess(admin(db), { organisationId: ORG, profileId: EFFIONG, actorProfileId: EFFIONG, target: target(db, EFFIONG), companyIds: [PAYCHEX], capabilities: [] }), "VALIDATION_ERROR", /your own/);
    await rejects(updateFinanceAccess(admin(db), { organisationId: ORG, profileId: OUTSIDER, actorProfileId: EFFIONG, target: target(db, OUTSIDER), companyIds: [], capabilities: [opCaps[0]] }), "VALIDATION_ERROR", /not a member/);
    await rejects(updateFinanceAccess(admin(db), { organisationId: ORG2, profileId: OUTSIDER, actorProfileId: EFFIONG, target: target(db, OUTSIDER), companyIds: [], capabilities: [opCaps[0]] }), "FORBIDDEN", /access\.manage/);
    await rejects(updateFinanceAccess(admin(db), { organisationId: ORG, profileId: SUSPENDED, actorProfileId: EFFIONG, target: target(db, SUSPENDED), companyIds: [], capabilities: [opCaps[0]] }), "VALIDATION_ERROR", /active accounts/);
    await rejects(updateFinanceAccess(admin(db), { organisationId: ORG, profileId: TOSIN, actorProfileId: EFFIONG, target: target(db, TOSIN), companyIds: [FOREIGN_CO], capabilities: [] }), "VALIDATION_ERROR", /not a Finance company/);
    await rejects(updateFinanceAccess(admin(db), { organisationId: ORG, profileId: TOSIN, actorProfileId: EFFIONG, target: target(db, TOSIN), companyIds: [], capabilities: [PLATFORM_FINANCE_ACCESS_MANAGE] }), "VALIDATION_ERROR", /not an assignable/);
    check(db.rpcCalls.length === 0 && db.t.finance_audit_events.length === 0, "refusals write nothing");
    // The database enforces the same rules if the server check were bypassed.
    const direct = await db.client.rpc("finance_iam_grant_capability", { p_actor_profile_id: EFFIONG, p_organisation_id: ORG, p_target_profile_id: EFFIONG, p_capability: opCaps[0] });
    check(direct.error && /your own/.test(direct.error.message), "database refuses self-change");
  }
  check(/if p_actor_profile_id = p_target_profile_id then\s*raise exception 'finance_iam: you cannot change your own/.test(requireAdmin), "DB self refusal");
  check(/v_actor\.organisation_id is distinct from p_organisation_id/.test(requireAdmin) && /v_target\.organisation_id is distinct from p_organisation_id/.test(requireAdmin), "DB same-organisation for actor and target");
  check(/where id = p_company_id and organisation_id = p_organisation_id/.test(sqlStrip(fnBody(migration, "finance_iam_grant_company_access"))), "DB company ownership");
  out.push("PASS 9-10 self, cross-organisation, inactive, foreign-company and access.manage-as-Finance-capability changes are refused");

  // 11 / 12. Audited grant / revoke.
  for (const [fn, action] of [
    ["finance_iam_grant_capability", "finance.access.capability_granted"],
    ["finance_iam_revoke_capability", "finance.access.capability_revoked"],
    ["finance_iam_grant_company_access", "finance.access.company_granted"],
    ["finance_iam_revoke_company_access", "finance.access.company_revoked"],
  ] as const) {
    const body = sqlStrip(fnBody(migration, fn));
    check(/security definer/.test(migration.slice(migration.indexOf(`function public.${fn}(`), migration.indexOf(`function public.${fn}(`) + 400)), `${fn} security definer`);
    check(body.indexOf("perform public.finance_iam_require_access_admin(") < body.search(/insert into public\.finance_(capability_grants|company_access)|delete from/), `${fn} authorises before writing`);
    const guard = body.search(/if v_(inserted|deleted) is null then\s*return false;/);
    check(guard >= 0 && guard < body.indexOf("insert into public.finance_audit_events") && body.includes(`'${action}'`), `${fn} audits ${action} only after a change`);
  }
  {
    const db = makeDb();
    const base = { organisationId: ORG, profileId: TOSIN, actorProfileId: EFFIONG, target: target(db, TOSIN) };
    await updateFinanceAccess(admin(db), { ...base, companyIds: [PAYCHEX, OTHER_CO], capabilities: [opCaps[0], opCaps[1]] });
    const r = await updateFinanceAccess(admin(db), { ...base, companyIds: [PAYCHEX], capabilities: [opCaps[1]] });
    check(r.granted === 0 && r.revoked === 2, "revokes applied");
    const actions = db.t.finance_audit_events.map((e) => e.action);
    check(actions.filter((a) => a === "finance.access.company_granted").length === 2 && actions.filter((a) => a === "finance.access.capability_granted").length === 2, "grants audited");
    check(actions.includes("finance.access.company_revoked") && actions.includes("finance.access.capability_revoked"), "revokes audited");
    check(db.t.finance_audit_events.every((e) => e.actor_profile_id === EFFIONG && e.object_id === TOSIN && e.organisation_id === ORG), "audit carries actor, target, organisation");
    // Restricted financial-account access blocks company revocation.
    db.t.finance_financial_account_access.push({ profile_id: TOSIN, company_id: PAYCHEX });
    await rejects(updateFinanceAccess(admin(db), { ...base, companyIds: [], capabilities: [opCaps[1]] }), "VALIDATION_ERROR", /financial-account access/);
    check(db.t.finance_company_access.some((a) => a.company_id === PAYCHEX), "company kept while account access remains");
  }
  check(/finance_financial_account_access[\s\S]*f\.company_id = p_company_id[\s\S]*raise exception/.test(sqlStrip(fnBody(migration, "finance_iam_revoke_company_access"))), "DB guard on dangling financial-account access");
  out.push("PASS 11-12 company and capability grant/revoke are audited (actor, target, organisation); account-access guard holds");

  // 13. Only differences are persisted; unchanged state is neither rewritten nor audited.
  {
    const db = makeDb();
    const base = { organisationId: ORG, profileId: TOSIN, actorProfileId: EFFIONG, target: target(db, TOSIN) };
    await updateFinanceAccess(admin(db), { ...base, companyIds: [PAYCHEX], capabilities: [opCaps[0]] });
    const calls = db.rpcCalls.length, events = db.t.finance_audit_events.length;
    const r = await updateFinanceAccess(admin(db), { ...base, companyIds: [PAYCHEX, PAYCHEX], capabilities: [opCaps[0]] });
    check(r.granted === 0 && r.revoked === 0 && db.rpcCalls.length === calls && db.t.finance_audit_events.length === events, "unchanged save: no calls, no audit");
    // A non-assignable held capability is left untouched.
    db.t.finance_capability_grants.push({ id: "legacy", organisation_id: ORG, profile_id: TOSIN, capability: "platform_finance.legacy_key" });
    await updateFinanceAccess(admin(db), { ...base, companyIds: [PAYCHEX], capabilities: [] });
    check(db.t.finance_capability_grants.some((g) => g.id === "legacy"), "non-assignable capability untouched");
  }
  check(/on conflict \(profile_id, organisation_id, capability\) do nothing/.test(sql) && /on conflict \(profile_id, company_id\) do nothing/.test(sql), "DB idempotent inserts");
  out.push("PASS 13 only differences are persisted; unchanged state is not rewritten or audited");

  // 14. Direct unaudited write paths closed; the browser writes nothing directly.
  for (const p of ["finance_company_access_insert", "finance_company_access_delete", "finance_capability_grants_insert", "finance_capability_grants_delete"]) {
    check(new RegExp(`drop policy if exists ${p} on public\\.`).test(sql), `policy ${p} dropped`);
  }
  check(!/create policy/i.test(sql), "no new policy");
  for (const fn of ["finance_iam_grant_capability", "finance_iam_revoke_capability", "finance_iam_grant_company_access", "finance_iam_revoke_company_access"]) {
    check(sql.includes(`from anon, authenticated;`) && new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from anon, authenticated;`).test(sql) && new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role;`).test(sql) && !new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to (anon|authenticated)`).test(sql), `${fn} callable only by the server`);
  }
  const clientDir = "src/modules/platform-admin/client";
  for (const f of readdirSync(clientDir)) {
    check(!/finance_company_access|finance_capability_grants|finance_iam_|createClient|supabase/.test(read(`${clientDir}/${f}`).replace(/\/\*[\s\S]*?\*\//g, "")), `${f} never writes Finance access directly`);
  }
  out.push("PASS 14 unaudited insert/delete policies dropped; functions are service-role only; the browser has no direct path");

  // 15. Read-only summary without access.manage; no dead action.
  check(/editable \? \(\s*<FinanceAccessForm/.test(panel) && /<FinanceAccessSummary access=\{access\} \/>\s*\{editable \?/.test(panel), "summary always shown; form only when editable");
  check(/aside=\{editable \? undefined : "Read-only here"\}/.test(panel), "read-only label without authority");
  check(!/Save Finance access|Discard changes|type="checkbox"|Select all/.test(panel.slice(0, panel.indexOf("function FinanceAccessForm"))), "no management action outside the editable form");
  check(!/financial_account|financialAccount/.test(panel.slice(panel.indexOf("function FinanceAccessForm"))), "financial-account access summarised only, never edited");
  check(/disabled=\{saving \|\| !dirty\}/.test(panel) && /if \(saving \|\| !dirty\) return;/.test(panel), "save disabled while saving / unchanged");
  out.push("PASS 15 users without access.manage keep the read-only summary; no dead action");

  // 16. access.manage never offered in the target's Finance checklist.
  check(!FINANCE_ACCESS_ASSIGNABLE_CAPABILITIES.includes(PLATFORM_FINANCE_ACCESS_MANAGE), "not assignable in the Finance checklist");
  check(/groupFinanceCapabilities\(editor\.assignableCapabilities\)/.test(panel) && !panel.replace(/\/\*[\s\S]*?\*\//g, "").includes("access.manage"), "checklist renders server list only");
  const grouped = groupFinanceCapabilities(opCaps);
  const flat = grouped.flatMap((g) => g.keys);
  check(flat.length === opCaps.length && new Set(flat).size === opCaps.length && opCaps.every((c) => flat.includes(c)) && !grouped.some((g) => g.id === "other"), "presentation groups cover every capability exactly once");
  check(groupFinanceCapabilities([...opCaps, "platform_finance.unknown.key"]).some((g) => g.id === "other" && g.keys.includes("platform_finance.unknown.key")), "an unknown key is never hidden");
  out.push("PASS 16 access.manage is not in the target's Finance capability checklist; grouping is presentation-only and complete");

  // 17 / 18. Finance entry and company isolation unchanged.
  check(read("src/modules/platform-finance/server/requirePlatformFinanceAccess.ts") === financeGuard, "Finance guard read");
  check(/SA does not auto-receive capabilities/.test(financeGuard) && /SA does not bypass/.test(financeGuard), "Finance guard contract intact");
  check(!/finance_company_access_select|finance_capability_grants_select|alter table public\.finance_company_access|alter table public\.finance_capability_grants/.test(sql), "select policies and Finance tables untouched");
  out.push("PASS 17-18 Platform Finance entry and company isolation are unchanged (guards untouched; only insert/delete policies dropped)");

  // Migration re-states the previous platform allowlists exactly, plus one key.
  const prev = sqlStrip(read("supabase/migrations/20260922220000_executive_private_office_capability_rename.sql"));
  const lastCheck = (s: string) => { const i = s.lastIndexOf("add constraint platform_capability_grants_capability_format"); return norm(s.slice(i, s.indexOf(");", s.indexOf("fm.authorize_protected", i)) + 2)); };
  check(lastCheck(sql).replace(" or capability = 'platform_finance.access.manage'", "") === lastCheck(prev), "format check otherwise identical to the previous definition");
  check(norm(fnBody(migration, "platform_iam_is_allowed_platform_capability")).replace(" 'platform_finance.access.manage',", "") === norm(fnBody(prev, "platform_iam_is_allowed_platform_capability")), "platform allowlist otherwise identical");
  out.push("PASS migration re-states the previous platform capability check and allowlist exactly, plus access.manage");

  for (const line of out) console.log(line);
  console.log("verify-finance-access-administration: PASS");
}

main().catch((error) => {
  console.error("FAIL", error instanceof Error ? error.message : error);
  process.exit(1);
});
