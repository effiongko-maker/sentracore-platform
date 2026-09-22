/**
 * Command Centre V1 executive-console foundation verification.
 * Non-mutating: pure functions, prototype stubs and source inspection only.
 *
 *   NODE_PATH=<dir containing an empty server-only/ stub> \
 *     npx tsx --tsconfig tsconfig.json scripts/verify-command-centre-executive-console.mts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  ATTENTION_DISPLAY_LIMIT,
  composeExecutiveAttention,
  eccCoverageAttentionItem,
  eccIssueRequestAttentionItems,
  financeAttentionItems,
  fmAttentionFromPicture,
  type DomainAttentionResult,
} from "../src/modules/command-centre/server/composeExecutiveAttention";
import { composeLastVisitChanges } from "../src/modules/command-centre/server/composeLastVisitChanges";
import {
  isEntryNavigation,
  resolveLandingRoute,
} from "../src/lib/access/landingWorkspace";
import { resolveModuleBoundary } from "../src/lib/access/moduleBoundary";
import type { WorkspaceAccessChrome } from "../src/lib/access/workspaceAccessChrome";
import type { EccIssue, EccPeopleSnapshot, EccRequest } from "../src/modules/ecc-operations/types";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
const src = (p: string) => readFileSync(resolve(p), "utf8");
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const loaded = (domain: DomainAttentionResult["domain"], items: DomainAttentionResult["items"] = []): DomainAttentionResult => ({ domain, status: "loaded", items });
const issue = (over: Partial<EccIssue>): EccIssue => ({ id: "I1", centreId: "ECC-001", title: "T", classification: "technical", severity: "low", status: "identified", ...over }) as EccIssue;
const request = (over: Partial<EccRequest>): EccRequest => ({ id: "R1", centreId: "ECC-001", title: "R", priority: "low", status: "submitted", responsibility: "company", ...over }) as EccRequest;
const picture = (over: Record<string, unknown> = {}) => ({
  maintenance: { state: "healthy", critical: 0, inProgress: 0, awaitingAction: 0, overdue: 0 },
  workOrders: { state: "healthy", awaitingAction: 0, overdue: 0 },
  approvals: { state: "healthy", awaitingAction: 0 },
  ...over,
}) as Parameters<typeof fmAttentionFromPicture>[0];

async function main() {
  const out: string[] = [];
  const pass = (m: string) => out.push(`PASS ${m}`);

  // ── A. Executive attention ────────────────────────────────────────────────
  {
    assert(financeAttentionItems({ pendingCount: 2, amountDetail: "₦1" }).length === 1, "A: Finance pending CEO decision qualifies");
    assert(financeAttentionItems({ pendingCount: 0, amountDetail: null }).length === 0, "A: zero pending is a real zero");
    const esc = eccIssueRequestAttentionItems({ issues: [issue({ status: "escalated", severity: "medium" })], requests: [] });
    assert(esc.length === 1 && /Escalated/.test(esc[0].detail ?? ""), "A: ECC escalation qualifies");
    const urgent = eccIssueRequestAttentionItems({
      issues: [issue({ id: "I2", severity: "critical" }), issue({ id: "I3", severity: "high" })],
      requests: [request({ priority: "urgent" }), request({ id: "R2", priority: "high" })],
    });
    assert(urgent.length === 4 && urgent.filter((i) => i.tone === "critical").length === 2, "A: ECC critical/high issues and urgent/high requests qualify with existing semantics");
    const ordinary = eccIssueRequestAttentionItems({
      issues: [issue({ severity: "low" }), issue({ id: "I9", severity: "medium", status: "in_treatment" }), issue({ id: "I8", severity: "critical", status: "resolved" })],
      requests: [request({ priority: "medium" }), request({ id: "R9", priority: "urgent", status: "closed" })],
    });
    assert(ordinary.length === 0, "A: ordinary open ECC items and closed/resolved items do not qualify");
    const shift = { id: "S", label: "Evening" } as never;
    const snap = (assigned: number, signedIn: number, hasShift = true) =>
      ({ currentShift: { shift: hasShift ? shift : null, agentsAssigned: assigned, agentsSignedIn: signedIn } }) as unknown as EccPeopleSnapshot;
    assert(eccCoverageAttentionItem(snap(2, 0)) !== null, "A: shift in effect, agents assigned, nobody signed in ⇒ provable coverage gap");
    assert(eccCoverageAttentionItem(snap(2, 1)) === null, "A: partial coverage is not an absence");
    assert(eccCoverageAttentionItem(snap(0, 0, true)) === null, "A: shift with no assignments is not asserted");
    assert(eccCoverageAttentionItem(snap(0, 0, false)) === null, "A: NO shift in effect is never an alert (model cannot tell 'not expected' from 'uncovered')");
    const fm = fmAttentionFromPicture(picture({ maintenance: { state: "healthy", critical: 3, inProgress: 9, awaitingAction: 50, overdue: 4 }, workOrders: { state: "healthy", awaitingAction: 5, overdue: 2 }, approvals: { state: "healthy", awaitingAction: 40 } }));
    assert(fm.items.some((i) => i.id === "fm:critical_work") && fm.items.some((i) => i.id === "fm:overdue_work") && fm.status === "loaded", "A: FM Critical and Overdue Work qualify");
    const fmOrdinary = fmAttentionFromPicture(picture({ maintenance: { state: "healthy", critical: 0, inProgress: 200, awaitingAction: 300, overdue: 0 }, approvals: { state: "healthy", awaitingAction: 99 } }));
    assert(fmOrdinary.items.length === 0 && fmOrdinary.status === "loaded", "A: ordinary open/in-progress/awaiting Work and FM approvals do not qualify (no executive ownership established)");
    const svcSrc = src("src/modules/command-centre/server/composeExecutiveAttention.ts");
    assert(!/approvals\.(awaitingAction|state)/.test(svcSrc), "A: FM Approvals are deliberately not read as CEO decisions");
    // incomplete source set can never yield a global "nothing requires attention"
    for (const bad of ["unavailable", "restricted", "partial"] as const) {
      const r = composeExecutiveAttention([loaded("finance"), { domain: "ecc", status: bad, items: [] }, loaded("facility_management")]);
      assert(r.state !== "empty" && !r.complete && !/No qualifying/.test(r.summary), `A: ${bad} domain prevents a global empty claim`);
    }
    const all = composeExecutiveAttention([loaded("finance"), loaded("ecc"), loaded("facility_management")]);
    assert(all.state === "empty" && all.complete && /No qualifying executive exceptions found in Finance, ECC, Facility Management/.test(all.summary), "A: all domains loaded and empty ⇒ truthful empty");
    const notEnabled = composeExecutiveAttention([loaded("finance"), { domain: "ecc", status: "not_enabled", items: [] }, loaded("facility_management")]);
    assert(notEnabled.complete && !/ECC/.test(notEnabled.summary), "A: a non-enabled domain is not claimed as evaluated");
    const none = composeExecutiveAttention([{ domain: "finance", status: "not_enabled", items: [] }]);
    assert(none.state !== "empty" && !none.complete, "A: nothing evaluated ⇒ no empty claim");
    assert(ATTENTION_DISPLAY_LIMIT >= 4, "A: display limit sane");
    pass("A executive attention: Finance/ECC/FM qualifying signals only; ordinary open items and FM approvals excluded; ECC 'no shift' not asserted; incomplete sources never produce 'nothing requires attention'");
  }

  // ── B. Truthfulness ───────────────────────────────────────────────────────
  {
    const known = composeExecutiveAttention([
      loaded("finance", financeAttentionItems({ pendingCount: 1, amountDetail: null })),
      { domain: "ecc", status: "unavailable", items: [] },
      loaded("facility_management"),
    ]);
    assert(known.items.length === 1 && known.state === "healthy" && !known.complete && /partial view/.test(known.summary), "B: successful domains stay visible when another fails; result is marked partial");
    assert(known.coverage.find((c) => c.domain === "ecc")?.note, "B: the failed domain is named");
    const restricted = composeExecutiveAttention([{ domain: "finance", status: "restricted", items: [] }, loaded("ecc"), loaded("facility_management")]);
    assert(restricted.coverage.find((c) => c.domain === "finance")?.status === "restricted" && !/could not be evaluated|unavailable/i.test(restricted.coverage[0].note ?? ""), "B: restricted is reported as restricted, not as a source failure");
    const zero = composeExecutiveAttention([loaded("finance"), loaded("ecc"), loaded("facility_management")]);
    assert(zero.state === "empty", "B: zero remains data");

    const { CommandCentreServerService } = await import("../src/modules/command-centre/server/CommandCentreServerService");
    const proto = CommandCentreServerService.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
    // decisions: restricted ≠ unavailable
    const dec = (q: unknown) => proto.composeDecisions.call({}, q) as { state: string; reason: string | null };
    assert(dec({ status: "restricted" }).state === "restricted" && !/could not be read/.test(dec({ status: "restricted" }).reason ?? ""), "B: restricted Finance decisions read as restricted");
    assert(dec({ status: "unavailable" }).state === "error" && /could not be read/.test(dec({ status: "unavailable" }).reason ?? ""), "B: a failed decision queue reads as a failure");
    assert(dec({ status: "loaded", decisions: { items: [], totalsByCurrency: new Map() }, scope: { complete: true, totalCompanies: 1, accessibleCompanies: 1, uncoveredCompanies: 0 } }).state === "empty", "B: a loaded empty queue over a COMPLETE company scope is a truthful zero");
    // payables failure is explicit
    const { PlatformFinanceServerService } = await import("../src/modules/platform-finance/server/PlatformFinanceServerService");
    const { PlatformFinancePayablesServerService } = await import("../src/modules/platform-finance/server/PlatformFinancePayablesServerService");
    const fp = PlatformFinanceServerService.prototype as unknown as Record<string, unknown>;
    const pp = PlatformFinancePayablesServerService.prototype as unknown as Record<string, unknown>;
    fp.getCommandCentreOverview = async () => ({ pendingCeoDecisions: { count: 0 }, requests: { awaitingReview: { count: 0 } } });
    const access = { organisationId: "o", profileId: "p", session: { roleSlugs: [], enabledModules: [{ slug: "platform_finance", status: "enabled" }] } };
    const entry = { platformFinance: true };
    pp.listCommandCentrePayables = async () => {
      throw new Error("db down");
    };
    const failed = (await proto.composeFinancePulse.call({}, access, entry, "2026-09-20T10:00:00Z", "Africa/Lagos")) as { partial?: boolean; statusLabel: string; lines: string[] };
    assert(failed.partial === true && failed.statusLabel === "Partial view" && failed.lines.join(" ").includes("Open payables unavailable"), "B: a failed payables query becomes an explicit partial state");
    pp.listCommandCentrePayables = async () => [];
    const ok = (await proto.composeFinancePulse.call({}, access, entry, "2026-09-20T10:00:00Z", "Africa/Lagos")) as { partial?: boolean; statusLabel: string; lines: string[] };
    assert(!ok.partial && /^Checked 11:00/.test(ok.statusLabel) && ok.lines.join(" ").includes("0 open payables"), "B: zero payables stays a valid zero; freshness is request-time 'Checked' in the organisation timezone");
    // FM restricted (domain gate respected) is not unavailable and never queries the picture
    let queried = false;
    const restrictedFm = (await proto.composeOperationsPulse.call({}, { session: { roleSlugs: [], enabledModules: [{ slug: "facility_management", status: "enabled" }] } }, { facilityManagement: false }, (queried = true, Promise.resolve(null)), { asOf: "2026-09-20T10:00:00Z", timeZone: null, fmViewAllowed: false })) as { state: string; statusLabel: string };
    void queried;
    assert(restrictedFm.state === "restricted" && restrictedFm.statusLabel === "Restricted", "B: FM without FM view access is restricted, not unavailable");
    const service = src("src/modules/command-centre/server/CommandCentreServerService.ts");
    assert(service.includes('accessCan(operatingAccess, "ops.view")') && /fmViewAllowed\s*\n?\s*\?\s*loadOperationalPictureSummary\(asOf\)/.test(service), "B: the FM domain gate is respected (picture not requested without FM view)");
    assert(!/Stable"/.test(service) && !/"Live data"/.test(service) && !/Nothing requires your attention/.test(src("src/modules/command-centre/components/CommandCentrePage.tsx")), "B: no unsupported 'Stable' / 'Live data' / 'Nothing requires your attention' language");
    assert(service.includes("hasFinanceCapability") && /if \(error\) return null;/.test(service), "B: an unreadable grant is a failure, not a denial");
    pass("B truthfulness: zero ≠ unavailable; restricted ≠ unavailable; payables failure explicit; partial failure keeps successful domains visible");
  }

  // ── C. Last-visit feed ────────────────────────────────────────────────────
  {
    const composer = src("src/modules/command-centre/server/composeLastVisitChanges.ts");
    assert(!/from\("operational_events"\)/.test(composer) && !composer.includes("OperationalEventTypes"), "C: composer does not read operational_events");
    const tables: string[] = [];
    const rows: Record<string, unknown[]> = {
      // stale FM verifier history — must be unreachable
      operational_events: [{ id: "E1", event_type: "facility.work_order_created", entity_type: "work_order", entity_id: "WO-2026-000077", occurred_at: "2026-09-20T09:59:00Z", data: {} }],
      ecc_audit_events: [{ id: "A1", action: "issue.created", entity_type: "issue", entity_id: "I", description: "Created issue", created_at: "2026-09-20T09:58:00Z" }],
      finance_request_events: [], finance_audit_events: [],
    };
    const db = {
      from(table: string) {
        tables.push(table);
        const chain: Record<string, unknown> = {};
        for (const m of ["select", "eq", "gt", "lte", "in", "order", "limit"]) chain[m] = () => chain;
        chain.then = (resolveFn: (v: unknown) => void) => resolveFn({ data: rows[table] ?? [], error: null });
        return chain;
      },
    };
    const res = await composeLastVisitChanges({
      db: db as never, organisationId: "o", previous: "2026-09-20T09:00:00Z", asOf: "2026-09-20T10:00:00Z",
      visibility: { finance: true, ecc: true }, workspaceEntry: { platformFinance: true, eccOperations: true }, timeZone: "Africa/Lagos",
    });
    assert(!tables.includes("operational_events") && res.items.every((i) => i.sourceLabel !== ("Operations" as never)) && !res.items.some((i) => /WO-2026/.test(i.detail)), "C: stale FM operational_events cannot surface");
    assert(res.items.length === 1 && res.items[0].sourceLabel === "ECC" && tables.includes("finance_request_events") && tables.includes("finance_audit_events"), "C: Finance and ECC authoritative history remain supported");
    const service = src("src/modules/command-centre/server/CommandCentreServerService.ts");
    assert(/Facility Management changes are not included/.test(service), "C: the feed states its scope honestly");
    assert(service.includes('.update({ last_visited_at: asOf })') && service.includes("Contract preserved"), "C: per-profile last-visited marker preserved (limitation documented)");
    pass("C feed: FM operational_events not consumed; Finance/ECC history preserved; scope stated");
  }

  // ── D. Assignments ────────────────────────────────────────────────────────
  {
    const files = ["src/modules/command-centre/server/CommandCentreServerService.ts", "src/modules/command-centre/components/CommandCentrePage.tsx", "src/modules/command-centre/presentationTypes.ts"];
    for (const f of files) {
      const t = src(f);
      assert(!/Your Assignments|Legacy Incidents Assigned|composeAssignments|countActiveForProfile|countAssignedForProfile|FmIncidentRepository|assignments:/.test(t), `D: ${f} carries no personal assignment tray`);
    }
    const page = src("src/modules/command-centre/components/CommandCentrePage.tsx");
    assert(!/Ask SentraCore|askSentraCore/.test(page) && !/scc-hero-pillars|Organisation pillars/.test(page), "D/G: no placeholder AI panel and no decorative pillars");
    // Editorial brand copy is permitted, but must stay purely editorial: no data, status, timestamp or provenance attached.
    for (const cls of ["scc-hero-quote", "scc-editorial-quote"]) {
      const block = page.slice(page.indexOf(`className="${cls}"`), page.indexOf("</p>", page.indexOf(`className="${cls}"`)));
      assert(block.length > 0, `D/G: ${cls} present`);
      assert(!/snapshot\./.test(block), `D/G: ${cls} carries no data`);
    }
    pass("D Your Assignments and Legacy Incidents Assigned are absent from Command Centre (FM data untouched)");
  }

  // ── E. Landing workspace ─────────────────────────────────────────────────
  {
    const platform = resolveModuleBoundary({ accessScope: "platform", homeModule: null });
    const eccBound = resolveModuleBoundary({ accessScope: "module", homeModule: "ecc_operations" });
    const chrome = (over: Partial<WorkspaceAccessChrome> = {}): WorkspaceAccessChrome => ({ facilityManagement: false, eccOperations: false, platformFinance: false, commandCentre: false, ...over });
    assert(resolveLandingRoute({ boundary: platform, landingWorkspace: "command_centre", chrome: chrome({ commandCentre: true }) }) === "/command-centre", "E: platform user + accessible preference redirects");
    assert(resolveLandingRoute({ boundary: platform, landingWorkspace: "command_centre", chrome: chrome() }) === null, "E: inaccessible preference falls back to Platform Home (never a forbidden page)");
    assert(resolveLandingRoute({ boundary: platform, landingWorkspace: null, chrome: chrome({ commandCentre: true }) }) === null, "E: NULL preference keeps Platform Home");
    assert(resolveLandingRoute({ boundary: platform, landingWorkspace: "private_office", chrome: chrome({ commandCentre: true }) }) === null && resolveLandingRoute({ boundary: platform, landingWorkspace: "admin", chrome: chrome({ commandCentre: true }) }) === null, "E: unsupported values (incl. admin/private_office) are ignored");
    assert(resolveLandingRoute({ boundary: platform, landingWorkspace: "facility_management", chrome: null }) === null, "E: unresolved workspace flags fail to Platform Home");
    assert(resolveLandingRoute({ boundary: eccBound, landingWorkspace: "command_centre", chrome: chrome({ commandCentre: true }) }) === null, "E/F: a module-bound identity ignores landing_workspace entirely");
    assert(resolveLandingRoute({ boundary: resolveModuleBoundary({ accessScope: "platform", homeModule: "ecc_operations" }), landingWorkspace: "command_centre", chrome: chrome({ commandCentre: true }) }) === null, "F: an invalid boundary never redirects");
    // loop-freedom: in-app navigation to "/" never redirects; only entry does
    assert(isEntryNavigation(null) && isEntryNavigation("https://x.test/login") && isEntryNavigation("https://x.test/auth/callback"), "E: entry (no referrer / auth pages) may redirect");
    assert(!isEntryNavigation("https://x.test/command-centre") && !isEntryNavigation("https://x.test/operations"), "E: 'Return to Platform Home' from a denied workspace shows Platform Home — no loop");
    // preference grants nothing: enterability comes only from capability-derived chrome flags
    const landing = src("src/lib/access/landingWorkspace.ts");
    assert(!/platform_capability_grants|createAdminClient|grant/i.test(landing.replace(/never authority|grants no capability|grant[s]? nothing|it never grants/gi, "")), "E: the resolver reads no grants and confers none");
    const page = src("src/app/(app)/page.tsx");
    assert(page.includes("resolveWorkspaceAccessChrome") && page.includes("resolveLandingRoute") && page.indexOf("boundaryForSession") < page.indexOf("resolveLandingRoute"), "E: the root validates enterability against real access before redirecting; boundary resolved first");
    assert(page.indexOf("redirect(home)") < page.indexOf("isLandingWorkspace(landing)"), "E/F: module-bound users are redirected to home_module before any preference is considered");
    const gate = src("src/modules/command-centre/server/requireCommandCentreAccess.ts");
    assert(gate.includes('assertBoundaryAllows(session, "platform")') && gate.includes("platform_capability_grants") && !gate.includes("landingWorkspace"), "E/F: Command Centre entry still needs the explicit grant and platform scope; the preference is not consulted");
    pass("E landing workspace: valid → redirect; inaccessible/NULL/invalid → Platform Home; module-bound ignore it; no loop; no authority");
  }

  // ── F. IAM ────────────────────────────────────────────────────────────────
  {
    const mig = src("supabase/migrations/20260920210000_profile_landing_workspace.sql");
    assert(/add column if not exists landing_workspace text;/.test(mig) && !/not null/.test(mig.split("add column")[1].split(";")[0]), "F: nullable column");
    assert(/landing_workspace in \('command_centre', 'facility_management', 'ecc_operations', 'platform_finance'\)/.test(mig), "F: constrained to supported values");
    assert(/landing_workspace is null or access_scope = 'platform'/.test(mig), "F: module-bound identities cannot carry a landing workspace (DB constraint)");
    assert(!/update public\.profiles\s+set landing_workspace = '/.test(mig.replace(/set landing_workspace = v_landing/g, "")), "F: no existing profile is configured by the migration");
    assert(/platform_iam_require_super_admin_actor/.test(mig) && /platform_iam_insert_audit_event/.test(mig) && /'landing_workspace\.changed'/.test(mig) && /previousLandingWorkspace/.test(mig), "F: canonical audited path records old and new values");
    assert(/new\.landing_workspace is distinct from old\.landing_workspace/.test(mig), "F: no direct JWT edits of the preference");
    assert(!/grant\s+(insert|update)/i.test(mig.replace(/grant execute[^;]*service_role;/g, "")), "F: RPC is service-role only");
    const repo = src("src/modules/platform-admin/server/PlatformAdminRepository.ts");
    assert(repo.includes("platform_iam_set_landing_workspace"), "F: the admin repository uses the canonical RPC");
    const { PlatformAdminServerService } = await import("../src/modules/platform-admin/server/PlatformAdminServerService");
    const calls: unknown[] = [];
    const svc = new PlatformAdminServerService({ getProfile: async () => ({ id: "p" }), setLandingWorkspace: async (i: unknown) => (calls.push(i), { changed: true }) } as never, {} as never);
    let rejected = 0;
    for (const bad of ["private_office", "admin", "/command-centre", "COMMAND_CENTRE"]) {
      await svc.setLandingWorkspace({ actorProfileId: "a" } as never, { profileId: "p", landingWorkspace: bad }).catch(() => rejected++);
    }
    assert(rejected === 4 && (calls as unknown[]).length === 0, "F: invalid values are rejected server-side before any RPC");
    await svc.setLandingWorkspace({ actorProfileId: "a" } as never, { profileId: "p", landingWorkspace: "command_centre" });
    await svc.setLandingWorkspace({ actorProfileId: "a" } as never, { profileId: "p", landingWorkspace: "" });
    assert((calls as unknown[]).length === 2, "F: valid values and clearing are accepted");
    const types = src("src/modules/platform-admin/types.ts");
    assert(types.includes('"landing_workspace.changed"'), "F: audit action registered");
    assert(!/roleSlugs|isSuperAdmin|job_?title/i.test(src("src/lib/access/landingWorkspace.ts")), "F: never derived from role, Super Admin or job title; Super Admin gains no business authority from it");
    pass("F IAM: nullable, constrained, audited (old/new), canonical RPC only, invalid rejected, existing users unchanged by the migration");
  }

  // ── G. Private Office (foundation now exists — see verify-private-office-boundary; this pass must stay clear of it) ──
  {
    const ccFiles = walk("src/modules/command-centre").filter((f) => /\.(ts|tsx)$/.test(f));
    assert(ccFiles.every((f) => !/batcave/i.test(src(f))), "G: Command Centre modules know nothing of Private Office (doorway is composed by the route)");
    for (const f of walk("supabase/migrations")) {
      assert(!/(create table|create schema)[^;]*batcave/i.test(src(f)) || f.endsWith("20260920240000_batcave_private_notes.sql"), `G: Private Office schema exists only in its own private-notes migration (${f})`);
    }
    assert(!/batcave/i.test(src("src/lib/access/landingWorkspace.ts")), "G: landing values exclude Private Office");
    pass("G Command Centre executive console remains free of Private Office data or knowledge");
  }

  console.log(out.join("\n"));
  console.log(`\n${out.length} groups passed`);
}

main().catch((e) => {
  console.error("FAIL", e instanceof Error ? e.message : e);
  process.exit(1);
});
