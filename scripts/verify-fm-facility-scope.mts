/**
 * FM facility scope — verification against the LIVE database (read-only) using the real repositories.
 *
 * Proves, for NCC Annex (FAC-0001) and CSIRT (FAC-0002):
 *  - an NCC-only user cannot read CSIRT records (lists AND direct detail reads), and vice versa;
 *  - a multi-assigned user sees the union in "All facilities" and can narrow to either;
 *  - the all-facilities scope sees both;
 *  - Client Payments are FM-WIDE: the 8 with no facility (NGN 67,644,404.05) are visible from NCC Annex, CSIRT and
 *    All facilities; a Client Payment WITH a facility obeys facility scope (no cross-facility leak);
 *  - Approvals keep their derived facility (via Work Order): ones with no facility-bearing parent are All-only;
 *  - multi-facility Work (fm_work_facilities) is visible from each of its facilities;
 *  - creation: Facility is a normal dropdown of AUTHORISED facilities (one ⇒ preselected; several ⇒ user chooses);
 *    no "choose a facility" interception; out-of-scope creation is refused server-side;
 *  - Facilities is in the FM sidebar (Organise, ahead of Assets) and both active facilities are listed.
 * Writes nothing.
 *
 *   NODE_PATH=<dir with empty server-only/> npx tsx --tsconfig tsconfig.json scripts/verify-fm-facility-scope.mts
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const p = resolve(".env.local");
  if (!existsSync(p)) return;
  for (const l of readFileSync(p, "utf8").split("\n")) {
    const t = l.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    if (!(k in process.env)) process.env[k] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
  }
}
const results: string[] = [];
function check(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  loadEnvLocal();
  const S = await import("../src/lib/access/facilityScope");
  const { resolveScopedFacilityId } = await import("../src/lib/platform/scopedFacility");
  const { resolveOperatingAccessFromGrants } = await import("../src/lib/access/resolveAccess");

  // ---- Pure rules ----------------------------------------------------------------------------------------------
  const A = { id: "11111111-1111-4111-8111-111111111111", name: "Alpha" };
  const B = { id: "22222222-2222-4222-8222-222222222222", name: "Beta" };
  const single = S.resolveWorkspaceFacility({ authorised: [A], mode: "assigned" });
  check(!single.context.allowAll && single.context.selection === A.id, "one facility: scoped to it, no All option");
  check(!single.scope.unrestricted && !single.scope.includeUnattributed, "one facility: no facility-less records");
  const multi = S.resolveWorkspaceFacility({ authorised: [A, B], mode: "assigned" });
  check(multi.context.allowAll && multi.context.selection === "all", "multi: defaults to All facilities");
  check(!multi.scope.unrestricted && multi.scope.includeUnattributed && multi.scope.facilityIds.length === 2, "multi All = union + facility-less");
  const narrowed = S.resolveWorkspaceFacility({ authorised: [A, B], mode: "assigned", requested: B.id });
  check(narrowed.context.selection === B.id && !narrowed.scope.unrestricted && narrowed.scope.facilityIds.join() === B.id, "multi can narrow");
  const forged = S.resolveWorkspaceFacility({ authorised: [A], mode: "assigned", requested: B.id });
  check(forged.context.selection === A.id, "a requested facility outside the authorised set is ignored");
  const everything = S.resolveWorkspaceFacility({ authorised: [A, B], mode: "all" });
  check(everything.scope.unrestricted, "all-facilities scope + All = unrestricted");
  const none = S.resolveWorkspaceFacility({ authorised: [], mode: "assigned" });
  check(!none.scope.unrestricted && none.scope.facilityIds.length === 0 && none.scope.includeUnattributed, "no assignment ⇒ facility-less only (fails closed)");
  check(S.scopeAllowsFacilities(single.scope, [A.id]) && !S.scopeAllowsFacilities(single.scope, [B.id]) && !S.scopeAllowsFacilities(single.scope, [null]), "single scope membership");
  check(S.scopeAllowsFacilities(narrowed.scope, [A.id, B.id]), "multi-facility record visible from any of its facilities");
  const defaults = resolveOperatingAccessFromGrants({ email: "x", name: "x", capabilities: [] });
  check(defaults.facilityScopeMode === "assigned" && !defaults.fmFacilityScope.unrestricted, "access defaults fail closed");
  // Initial facility (the resolver's pure core): exactly one authorised facility ⇒ preselected; several ⇒ none (the
  // user picks from the dropdown); editing keeps the record's own facility.
  check(resolveScopedFacilityId([A, B], null, A.id) === A.id, "one authorised facility: preselected");
  check(resolveScopedFacilityId([A, B], null, "") === "", "several authorised facilities: no silent default — the user chooses");
  check(resolveScopedFacilityId([A, B], B.id, A.id) === B.id, "editing keeps the record's own facility");
  const onlyA = S.repoScopeFromAccess({ fmFacilityScope: single.scope, facilityScopeMode: "assigned", authorisedFacilities: [A] });
  check(onlyA.canOperateIn(A.id) && !onlyA.canOperateIn(B.id), "creation refused outside authorised facilities");
  check(S.scopeAllowsFmWide(single.scope, null) && S.scopeAllowsFmWide(narrowed.scope, null), "FM-wide: no facility ⇒ visible in any single-facility view");
  check(S.scopeAllowsFmWide(single.scope, A.id) && !S.scopeAllowsFmWide(single.scope, B.id), "FM-wide: a facility-bearing record still obeys facility scope");
  check(S.fmWideScopeClause(single.scope) === `facility_id.in.(${A.id}),facility_id.is.null`, "FM-wide clause admits own facility + no facility only");
  results.push("PASS pure: workspace resolution, membership, fail-closed defaults, FM-wide rule, initial-facility rule");

  // Creation UX: no interception; the Facility field is a dropdown of authorised facilities.
  const exists = (path: string) => existsSync(path);
  check(!exists("src/hooks/useCreationFacilityPrompt.tsx"), "the 'Choose a facility' prompt is removed");
  const select = readFileSync("src/components/operational/AuthorisedFacilitySelect.tsx", "utf8");
  check(select.includes("access?.authorisedFacilities"), "dropdown options = authorised facilities");
  for (const form of [
    "src/modules/requests/components/RequestFormModal.tsx",
    "src/modules/maintenance/components/MaintenanceFormModal.tsx",
    "src/modules/incidents/components/IncidentFormModal.tsx",
    "src/modules/issues/components/LogIssueModal.tsx",
    "src/modules/finance/components/CostRecordFormModal.tsx",
    "src/components/operational/InheritedFacilityField.tsx",
  ]) {
    check(readFileSync(form, "utf8").includes("<AuthorisedFacilitySelect"), `${form}: Facility is a dropdown`);
  }
  const resolver = readFileSync("src/hooks/useScopedFacilityResolver.ts", "utf8");
  check(!/workspaceFacility|prompt/i.test(resolver.replace(/\/\*[\s\S]*?\*\//g, "")), "initial facility never depends on workspace context or a prompt");
  results.push("PASS creation UX: prompt removed; authorised-facility dropdown in Request, Work, Incident, Log issue, Cost and inherited-field forms");

  // ---- Live (read-only) through the real repositories ------------------------------------------------------------
  const { createAdminClient } = await import("../src/utils/supabase/admin");
  const admin = createAdminClient();
  const { data: orgs } = await admin.from("organisations").select("id").eq("status", "active");
  check((orgs ?? []).length === 1, "one active organisation");
  const org = String((orgs![0] as { id: string }).id);
  const { data: facs } = await admin.from("fm_facilities").select("id,code,name,status").eq("organisation_id", org).eq("status", "active");
  const ncc = (facs ?? []).find((f) => f.code === "FAC-0001")!;
  const csirt = (facs ?? []).find((f) => f.code === "FAC-0002")!;
  check(ncc && csirt, "both live facilities active");
  const NCC = { id: String(ncc.id), name: String(ncc.name) };
  const CSIRT = { id: String(csirt.id), name: String(csirt.name) };

  const scopeFor = (authorised: typeof NCC[], mode: "assigned" | "all", requested?: string) => {
    const w = S.resolveWorkspaceFacility({ authorised, mode, requested });
    return S.repoScopeFromAccess({ fmFacilityScope: w.scope, facilityScopeMode: mode, authorisedFacilities: authorised });
  };
  const users = {
    nccOnly: scopeFor([NCC], "assigned"),
    csirtOnly: scopeFor([CSIRT], "assigned"),
    multiAll: scopeFor([NCC, CSIRT], "assigned"),
    multiNcc: scopeFor([NCC, CSIRT], "assigned", NCC.id),
    multiCsirt: scopeFor([NCC, CSIRT], "assigned", CSIRT.id),
    allScope: scopeFor([NCC, CSIRT], "all"),
  };

  const { FmWorkRepository } = await import("../src/modules/maintenance/server/FmWorkRepository");
  const { FmWorkInstructionRepository } = await import("../src/modules/work-orders/server/FmWorkInstructionRepository");
  const { FmRequestRepository } = await import("../src/modules/requests/server/FmRequestRepository");
  const { FmApprovalRepository } = await import("../src/modules/approvals/server/FmApprovalRepository");
  const { FmCostRepository } = await import("../src/modules/finance/server/FmCostRepository");

  // Ground truth (unscoped) for comparison.
  const truth = {
    work: await new FmWorkRepository(org, admin).listRows(),
    wi: (await new FmWorkInstructionRepository(org, admin).listPage({ page: 1, pageSize: 1000 } as never)).rows,
    req: (await new FmRequestRepository(org, admin).listPage({ page: 1, pageSize: 1000 } as never)).rows,
    apr: (await new FmApprovalRepository(org, admin).listPage({ page: 1, pageSize: 500 } as never)).rows,
    cost: (await new FmCostRepository(org, admin).listCosts({ page: 1, pageSize: 1000 } as never)).rows,
    sub: (await new FmCostRepository(org, admin).listSubmissions({ page: 1, pageSize: 500 } as never)).rows,
  };
  const { data: wf } = await admin.from("fm_work_facilities").select("work_id,facility_id").eq("organisation_id", org);
  const extra = new Map<string, string[]>();
  for (const r of wf ?? []) extra.set(String(r.work_id), [...(extra.get(String(r.work_id)) ?? []), String(r.facility_id)]);
  const workFacilities = (w: { id: string; facility_id: string }) => [w.facility_id, ...(extra.get(w.id) ?? [])];
  const expectCount = <T,>(rows: T[], allow: (row: T) => boolean) => rows.filter(allow).length;

  const summary: string[] = [];
  for (const [name, scope] of Object.entries(users)) {
    const allows = (ids: Array<string | null>) => S.scopeAllowsFacilities(scope.read, ids);
    const work = await new FmWorkRepository(org, admin, scope).listRows();
    const wi = (await new FmWorkInstructionRepository(org, admin, scope).listPage({ page: 1, pageSize: 1000 } as never)).rows;
    const req = (await new FmRequestRepository(org, admin, scope).listPage({ page: 1, pageSize: 1000 } as never)).rows;
    const apr = (await new FmApprovalRepository(org, admin, scope).listPage({ page: 1, pageSize: 500 } as never)).rows;
    const costRepo = new FmCostRepository(org, admin, scope);
    const cost = (await costRepo.listCosts({ page: 1, pageSize: 1000 } as never)).rows;
    const sub = (await costRepo.listSubmissions({ page: 1, pageSize: 500 } as never)).rows;
    const totals = await costRepo.aggregateTotals();

    check(work.length === expectCount(truth.work, (w) => allows(workFacilities(w))), `${name}: Work scoped incl. multi-facility`);
    check(work.every((w) => allows(workFacilities(w))), `${name}: no out-of-scope Work`);
    check(wi.length === expectCount(truth.wi, (r) => allows([r.facility_id])), `${name}: Work Orders scoped`);
    check(req.length === expectCount(truth.req, (r) => allows([r.facility_id])), `${name}: Issues/Requests scoped`);
    check(cost.length === expectCount(truth.cost, (r) => allows([r.facility_id])), `${name}: Costs scoped`);
    check(totals.totalCount === cost.length, `${name}: cost totals use the same scope`);
    check(sub.length === expectCount(truth.sub, (r) => S.scopeAllowsFmWide(scope.read, r.facility_id)), `${name}: Client Payments follow the FM-wide rule`);
    check(sub.every((r) => S.scopeAllowsFmWide(scope.read, r.facility_id)), `${name}: no facility-scoped Client Payment leaks across facilities`);
    summary.push(`${name.padEnd(10)} work ${String(work.length).padStart(3)} · WO ${String(wi.length).padStart(3)} · issues ${String(req.length).padStart(2)} · approvals ${String(apr.length).padStart(2)} · costs ${String(cost.length).padStart(3)} · client payments ${sub.length}`);
  }

  // Specific expectations the brief asks for.
  const count = async (scope: typeof users.nccOnly) => ({
    apr: (await new FmApprovalRepository(org, admin, scope).listPage({ page: 1, pageSize: 500 } as never)).rows.length,
    sub: (await new FmCostRepository(org, admin, scope).listSubmissions({ page: 1, pageSize: 500 } as never)).rows.length,
    costs: (await new FmCostRepository(org, admin, scope).listCosts({ page: 1, pageSize: 1000 } as never)).rows,
  });
  const facilityLessApprovals = truth.apr.filter((a) => !a.work_instruction_id).length;
  const facilityLessPayments = truth.sub.filter((s) => !s.facility_id).length;
  // Approvals: existing derived-facility rule (unchanged) — no facility-bearing parent ⇒ All facilities only.
  for (const key of ["nccOnly", "csirtOnly", "multiNcc", "multiCsirt"] as const) {
    const apr = (await new FmApprovalRepository(org, admin, users[key]).listPage({ page: 1, pageSize: 500 } as never)).rows;
    check(apr.every((a) => a.work_instruction_id), `${key}: single-facility view shows only Work-Order-attributed Approvals`);
  }
  for (const key of ["multiAll", "allScope"] as const) {
    const apr = (await new FmApprovalRepository(org, admin, users[key]).listPage({ page: 1, pageSize: 500 } as never)).rows;
    check(apr.length === truth.apr.length, `${key}: All facilities includes Approvals without a facility-bearing parent`);
  }
  // Client Payments: FM-wide — all 8 (NGN 67,644,404.05) from every authorised facility context.
  const fmWide = truth.sub.filter((x) => !x.facility_id);
  const fmWideKobo = fmWide.reduce((t, x) => t + Math.round(Number(x.claim_amount) * 100), 0);
  check(fmWide.length === 8 && fmWideKobo === 6_764_440_405, `8 FM-wide Client Payments totalling NGN 67,644,404.05 (got ${fmWide.length} / ${fmWideKobo / 100})`);
  const cpLines: string[] = [];
  for (const [key, scope] of Object.entries(users)) {
    const repo = new FmCostRepository(org, admin, scope);
    const sub = (await repo.listSubmissions({ page: 1, pageSize: 500 } as never)).rows;
    const visible = sub.filter((x) => !x.facility_id);
    const kobo = visible.reduce((t, x) => t + Math.round(Number(x.claim_amount) * 100), 0);
    check(visible.length === 8 && kobo === fmWideKobo, `${key}: all 8 FM-wide Client Payments visible (got ${visible.length} / ${kobo / 100})`);
    for (const cp of fmWide) check(Boolean(await repo.getSubmission(cp.code)), `${key}: ${cp.code} opens directly`);
    cpLines.push(`${key}: ${visible.length} · NGN ${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`);
  }
  results.push(`PASS FM-wide Client Payments visible in every context — ${cpLines.join("; ")}`);

  const nccCosts = (await count(users.nccOnly)).costs;
  const csirtCosts = (await count(users.csirtOnly)).costs;
  check(nccCosts.every((c) => c.facility_id === NCC.id) && csirtCosts.every((c) => c.facility_id === CSIRT.id), "cost records never cross facilities");
  check((await count(users.multiAll)).costs.length === nccCosts.length + csirtCosts.length, "multi All = NCC ∪ CSIRT costs");
  results.push(`PASS live lists (${facilityLessApprovals} approvals without a facility-bearing parent, ${facilityLessPayments} FM-wide client payments):\n    ${summary.join("\n    ")}`);

  // Direct detail reads cannot bypass scope.
  const csirtWork = truth.work.find((w) => w.facility_id === CSIRT.id && !(extra.get(w.id) ?? []).includes(NCC.id))!;
  const nccWork = truth.work.find((w) => w.facility_id === NCC.id && !(extra.get(w.id) ?? []).includes(CSIRT.id))!;
  const sharedWork = truth.work.find((w) => (extra.get(w.id) ?? []).includes(NCC.id) && (extra.get(w.id) ?? []).includes(CSIRT.id));
  const csirtWi = truth.wi.find((r) => r.facility_id === CSIRT.id)!;
  const nccWi = truth.wi.find((r) => r.facility_id === NCC.id)!;
  const csirtCost = truth.cost.find((r) => r.facility_id === CSIRT.id)!;
  const nccCost = truth.cost.find((r) => r.facility_id === NCC.id)!;
  const nccReq = truth.req.find((r) => r.facility_id === NCC.id)!;
  const aprNoWi = truth.apr.find((a) => !a.work_instruction_id)!;
  const cpNoFac = truth.sub.find((s) => !s.facility_id)!;
  const W = (s: typeof users.nccOnly) => new FmWorkRepository(org, admin, s);
  const WI = (s: typeof users.nccOnly) => new FmWorkInstructionRepository(org, admin, s);
  const C = (s: typeof users.nccOnly) => new FmCostRepository(org, admin, s);
  check(!(await W(users.nccOnly).getByIdOrCode(csirtWork.code)) && !(await W(users.nccOnly).getByIdOrCode(csirtWork.id)), "NCC-only cannot open a CSIRT Work (code or UUID)");
  check(!(await W(users.csirtOnly).getByIdOrCode(nccWork.code)), "CSIRT-only cannot open an NCC Work");
  check(Boolean(await W(users.nccOnly).getByIdOrCode(nccWork.code)), "NCC-only can open an NCC Work");
  if (sharedWork) {
    check(Boolean(await W(users.nccOnly).getByIdOrCode(sharedWork.code)) && Boolean(await W(users.csirtOnly).getByIdOrCode(sharedWork.code)), "multi-facility Work opens from each facility");
  }
  check(!(await WI(users.nccOnly).getByIdOrCode(csirtWi.code)) && !(await WI(users.csirtOnly).getByIdOrCode(nccWi.code)), "Work Orders: no cross-facility detail reads");
  check(!(await C(users.nccOnly).getCost(csirtCost.code)) && !(await C(users.csirtOnly).getCost(nccCost.code)), "Costs: no cross-facility detail reads");
  check(!(await new FmRequestRepository(org, admin, users.csirtOnly).getByIdOrCode(nccReq.code)), "Issues: CSIRT-only cannot open an NCC request");
  check(!(await new FmApprovalRepository(org, admin, users.multiNcc).getByIdOrCode(aprNoWi.code)) && Boolean(await new FmApprovalRepository(org, admin, users.multiAll).getByIdOrCode(aprNoWi.code)), "facility-less Approval: only in All facilities");
  check(Boolean(await C(users.multiCsirt).getSubmission(cpNoFac.code)) && Boolean(await C(users.nccOnly).getSubmission(cpNoFac.code)), "FM-wide Client Payment opens from any facility context");
  check(Boolean(await W(users.allScope).getByIdOrCode(csirtWork.code)) && Boolean(await W(users.allScope).getByIdOrCode(nccWork.code)), "all-facilities scope opens both");
  results.push(`PASS direct detail reads cannot bypass scope (Work ${csirtWork.code}/${nccWork.code}${sharedWork ? `, shared ${sharedWork.code}` : ""}, WO ${csirtWi.code}, cost ${csirtCost.code}, approval ${aprNoWi.code}, client payment ${cpNoFac.code})`);

  // Creation guard (no write): out-of-scope creation is refused before anything is inserted.
  let refused = false;
  try {
    await W(users.nccOnly).create({ facilityId: CSIRT.id } as never, "00000000-0000-0000-0000-000000000000");
  } catch (e) {
    refused = /not authorised to create Work in this facility/i.test(String((e as Error).message));
  }
  check(refused, "NCC-only cannot create Work in CSIRT (refused before any insert)");
  results.push("PASS creation: out-of-scope create refused server-side before insert");

  // Facilities in the sidebar + both listed.
  const nav = readFileSync("src/lib/navigation.ts", "utf8");
  const organise = nav.slice(nav.indexOf('id: "organise"'), nav.indexOf('id: "operate"'));
  check(organise.indexOf('href: "/facilities"') > -1 && organise.indexOf('href: "/facilities"') < organise.indexOf('href: "/assets"'), "Facilities in Organise, ahead of Assets");
  const { FmFacilitiesRepository } = await import("../src/modules/facilities/server/FmFacilitiesRepository");
  const facRows = (await new FmFacilitiesRepository(org).listRows()).filter((r) => r.status === "active");
  check(facRows.length === 2 && facRows.some((r) => r.code === "FAC-0001") && facRows.some((r) => r.code === "FAC-0002"), "both active facilities listed");
  const assigned = await new FmFacilitiesRepository(org).assignedPeopleCounts();
  results.push(`PASS Facilities: sidebar restored; active facilities listed — NCC Annex (${assigned.get(NCC.id) ?? 0} assigned), CSIRT (${assigned.get(CSIRT.id) ?? 0} assigned)`);

  for (const line of results) console.log(line);
  console.log("verify-fm-facility-scope: PASS");
}
main().catch((e) => { console.error("FAIL", e instanceof Error ? e.message : e); process.exit(1); });
