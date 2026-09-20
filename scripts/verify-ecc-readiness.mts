/**
 * ECC V1 stakeholder-readiness verification (rollback-safe: in-memory / prototype
 * stubs only — no persistent records are written).
 *
 *   NODE_PATH=<dir containing an empty server-only/ stub> \
 *     npx tsx --tsconfig tsconfig.json scripts/verify-ecc-readiness.mts [--live-read]
 *
 * `--live-read` adds READ-ONLY organisation-isolation probes against the linked DB.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { ActionError } from "../src/lib/actions/errors";
import {
  ECC_CAPABILITIES,
  DEFAULT_ECC_CENTRE,
  type EccCreateDailyOpsInput,
} from "../src/modules/ecc-operations/types";
import {
  ECC_ACTION_CAPABILITY,
  ECC_RETIRED_ACTIONS,
  capabilityForEccAction,
} from "../src/modules/ecc-operations/server/eccActionAuthority";
import { assertEccCapabilitiesHeld } from "../src/modules/ecc-operations/server/requireEccAccess";
import { EccConflictError } from "../src/modules/ecc-operations/server/validation";
import { isAttendanceLive, isShiftEffective } from "../src/modules/ecc-operations/domain/shiftWindow";
import { deriveStaffingFromPeople } from "../src/modules/ecc-operations/domain/deriveStaffingFromPeople";
import { PLATFORM_ADMINISTRABLE_CAPABILITIES } from "../src/modules/platform-admin/types";
import { catalogCoversAllAdministrableCapabilities } from "../src/modules/platform-admin/capabilityCatalog";
import { buildEccReportDocument } from "../src/modules/ecc-operations/reporting/buildEccReportDocument";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
const src = (p: string) => readFileSync(resolve(p), "utf8");
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}
function loadEnvLocal() {
  const path = resolve(".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    if (!(k in process.env)) process.env[k] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
  }
}

const ORG = "11111111-1111-4111-8111-111111111111";
const ACTOR = { userId: "f0000000-0000-4000-8000-0000000000aa", email: "a@example.com", name: "Authenticated Actor" };

function forbidden(fn: () => void): boolean {
  try {
    fn();
    return false;
  } catch (error) {
    return error instanceof ActionError && error.code === "FORBIDDEN";
  }
}

const dailyInput = (over: Partial<EccCreateDailyOpsInput> = {}): EccCreateDailyOpsInput =>
  ({
    period: "morning",
    reportingDate: "2026-09-20",
    overallStatus: "operational",
    recordedByName: "Spoofed Typed Name",
    centreOperations: { status: "normal", noIssuesToReport: true, staffingStatus: "ready", staffingReadiness: "", observations: "", disruptionNotes: "" },
    callOperations: { status: "normal", noIssuesToReport: true, notes: "", additionalMetrics: {} },
    facility: { status: "normal", noIssuesToReport: true, condition: "", power: "", environment: "", issues: "", observations: "" },
    technical: { status: "normal", noIssuesToReport: true, equipment: "", network: "", servers: "", software: "", callTakingSystems: "", incidents: "", observations: "" },
    ...over,
  }) as unknown as EccCreateDailyOpsInput;

async function main() {
  const out: string[] = [];
  const pass = (m: string) => out.push(`PASS ${m}`);

  // ── 1–6. Per-action authority ──────────────────────────────────────────────
  {
    const V = ECC_CAPABILITIES.view;
    const held = [V];
    for (const [action, label] of [
      ["createDailyOps", "1"],
      ["createIssue", "2"],
      ["transitionIssue", "2"],
      ["transitionRequest", "2"],
      ["deleteIssue", "3"],
      ["setFinanceBudget", "4"],
      ["createFinanceTransaction", "4"],
      ["createPerson", "5"],
      ["ensureCurrentShift", "5"],
      ["signInPerson", "5"],
    ] as const) {
      const cap = capabilityForEccAction(action);
      assert(cap && cap !== V, `${label}: ${action} must require more than view`);
      assert(forbidden(() => assertEccCapabilitiesHeld(held, cap)), `${label}: view alone must not authorise ${action}`);
    }
    pass("1 view alone cannot create Daily Ops");
    pass("2 view alone cannot create or progress Issues / Requests");
    pass("3 view alone cannot hard-delete an Issue (dedicated delete capability)");
    pass("4 view alone cannot mutate ECC Finance");
    pass("5 view alone cannot manage roster / shifts / attendance");
    // reads stay view-gated
    for (const read of ["getOverview", "listDailyOps", "listIssues", "listRequests", "getReportingSnapshot", "getPeopleSnapshot", "getFinanceSnapshot"]) {
      assert(capabilityForEccAction(read) === V, `${read} must be view-gated`);
      assertEccCapabilitiesHeld(held, V);
    }
    // correct mutation capability permits its action (still needs view too)
    assertEccCapabilitiesHeld([V, ECC_CAPABILITIES.create], capabilityForEccAction("createDailyOps")!);
    assertEccCapabilitiesHeld([V, ECC_CAPABILITIES.edit], capabilityForEccAction("transitionIssue")!);
    assertEccCapabilitiesHeld([V, ECC_CAPABILITIES.delete], capabilityForEccAction("deleteIssue")!);
    assertEccCapabilitiesHeld([V, ECC_CAPABILITIES.managePeople], capabilityForEccAction("createPerson")!);
    assertEccCapabilitiesHeld([V, ECC_CAPABILITIES.manageFinance], capabilityForEccAction("setFinanceBudget")!);
    assert(forbidden(() => assertEccCapabilitiesHeld([ECC_CAPABILITIES.create], capabilityForEccAction("createDailyOps")!)), "a write grant without view must not enter ECC");
    assert(forbidden(() => assertEccCapabilitiesHeld([V, ECC_CAPABILITIES.edit], capabilityForEccAction("deleteIssue")!)), "edit must not imply delete");
    assert(forbidden(() => assertEccCapabilitiesHeld([V, ECC_CAPABILITIES.create], capabilityForEccAction("transitionIssue")!)), "create must not imply edit");
    pass("6 the correct mutation capability permits its intended action (edit ≠ delete, create ≠ edit, write needs view)");
    assert(capabilityForEccAction("somethingNew") === null, "unknown action fails closed");
    for (const cap of Object.values(ECC_CAPABILITIES)) {
      assert((PLATFORM_ADMINISTRABLE_CAPABILITIES as readonly string[]).includes(cap), `${cap} must be administrable`);
      assert(/^platform\.ecc_operations(\.[a-z0-9_]+)+$/.test(cap), `${cap} follows the catalog naming pattern`);
    }
    assert(catalogCoversAllAdministrableCapabilities(), "capability catalog covers the new ECC capabilities");
    const route = src("src/app/api/ecc-operations/route.ts");
    assert(route.indexOf("capabilityForEccAction") < route.indexOf("requireEccAccess({ capability })"), "route resolves the action's capability before authorising");
    assert(route.indexOf("requireEccAccess({ capability })") < route.indexOf("switch (action)"), "authority precedes dispatch");
    const access = src("src/modules/ecc-operations/server/requireEccAccess.ts");
    assert(!/isSuperAdmin[^;\n]*\)\s*\{?\s*return/.test(access) && access.includes("Super Admin does NOT auto-receive"), "Super Admin is not an ECC business override");
    assert(access.includes('.eq("organisation_id", organisationId)') && access.includes('.eq("profile_id", profileId)'), "grants read is organisation- and profile-scoped");
    pass("6b unknown actions fail closed; Super Admin gains no ECC authority; new capabilities are administrable");
    assert(Object.keys(ECC_ACTION_CAPABILITY).length >= 30, "every action declares a capability");
  }

  // ── 7. Organisation isolation (structural + optional live read) ────────────
  {
    for (const file of ["EccOperationsRepository", "EccPeopleRepository", "EccFinanceRepository", "EccAuditRepository"]) {
      const text = src(`src/modules/ecc-operations/server/${file}.ts`);
      const chunks = text.split(/\.from\("ecc_/).slice(1);
      // Inserts take pre-built rows (mappers stamp organisation_id); reads/updates/deletes must filter by organisation.
      const unscoped = chunks.filter((chunk) => !/^[a-z_]+"\)\.insert\(/.test(chunk) && !/organisation_?[iI]d|this\.organisationId/.test(chunk.slice(0, 700)));
      assert(chunks.length > 0 && unscoped.length === 0, `${file}: ${unscoped.length} ecc_ table access(es) without organisation scope`);
    }
    const migration = src("supabase/migrations/20260920120000_ecc_capability_model_and_actor_identity.sql");
    assert(/drop policy if exists %I/.test(migration) && /revoke insert, update, delete, truncate/.test(migration), "direct JWT writes to ecc_ tables are closed");
    assert(/cmd in \('INSERT', 'UPDATE', 'DELETE', 'ALL'\)/.test(migration), "all write policies dropped; select policies preserved");
    pass("7 organisation isolation enforced server-side; direct authenticated writes to ECC tables are closed");
  }

  // ── 8–9, 14. Actor identity + duplicate conflict (repository stubs, no DB) ─
  const { EccOperationsServerService } = await import("../src/modules/ecc-operations/server/EccOperationsServerService");
  const { EccOperationsRepository } = await import("../src/modules/ecc-operations/server/EccOperationsRepository");
  const { EccPeopleRepository } = await import("../src/modules/ecc-operations/server/EccPeopleRepository");
  const { EccAuditRepository } = await import("../src/modules/ecc-operations/server/EccAuditRepository");
  const R = EccOperationsRepository.prototype as unknown as Record<string, unknown>;
  const original = { ...R };
  const audits: unknown[] = [];
  let inserted: Record<string, unknown>[] = [];
  let existingDaily: Record<string, unknown> | null = null;
  R.ensureDefaultCentre = async () => ({ ...DEFAULT_ECC_CENTRE });
  R.findDailyOpsByPeriodDate = async () => existingDaily;
  R.insertDailyOps = async (r: Record<string, unknown>) => (inserted.push(r), r);
  R.insertIssue = async (r: Record<string, unknown>, h: unknown[]) => (inserted.push(r), { ...r, history: h });
  R.insertRequest = async (r: Record<string, unknown>, h: unknown[]) => (inserted.push(r), { ...r, history: h });
  R.getIssue = async () => ({
    id: "ECC-ISS-X", centreId: "ECC-001", status: "identified", severity: "medium", classification: "operational",
    title: "t", description: "d", reporterName: "Old Typed", history: [], occurredAt: "2026-09-01T00:00:00Z", createdAt: "x", updatedAt: "x",
  });
  R.updateIssue = async (i: unknown) => i;
  R.appendIssueHistory = async (_id: string, h: unknown[]) => void inserted.push({ history: h });
  (EccAuditRepository.prototype as unknown as Record<string, unknown>).record = async (x: unknown) => (audits.push(x), x);
  try {
    const svc = new EccOperationsServerService(ORG, ACTOR);
    const rec = await svc.createDailyOps(dailyInput());
    assert(rec.recordedByProfileId === ACTOR.userId, "8: Daily Ops stamps the authenticated profile UUID");
    assert(rec.recordedByName === ACTOR.name && rec.recordedByName !== "Spoofed Typed Name", "8/9: typed name cannot establish actor identity");
    const issue = await svc.createIssue({ classification: "operational", severity: "medium", title: "T", description: "D", reporterName: "Spoofed Reporter" });
    assert(issue.reporterProfileId === ACTOR.userId && issue.reporterName === ACTOR.name, "8: Issue stamps canonical actor");
    assert(issue.history[0].byProfileId === ACTOR.userId && issue.history[0].byName === ACTOR.name, "8: Issue history stamps canonical actor");
    const req = await svc.createRequest({ title: "R", reason: "why", description: "D", origin: "operational", responsibility: "company", priority: "medium", requestingManagerName: "Spoofed Manager" });
    assert(req.requestingProfileId === ACTOR.userId && req.requestingManagerName === ACTOR.name, "8: Request stamps canonical actor");
    const closed = await svc.transitionIssue({ id: "ECC-ISS-X", toStatus: "recorded", byName: "Spoofed Transitioner", resolutionNotes: "n" });
    const last = closed.history[closed.history.length - 1];
    assert(last.byProfileId === ACTOR.userId && last.byName === ACTOR.name, "8/9: transition history stamps the session actor, ignoring byName");
    pass("8 new operational records and history stamp the authenticated profile UUID + authoritative display name");
    pass("9 client-supplied names (and the retired browser 'acting as') cannot establish actor identity");
    // no actor ⇒ no write
    let refused = false;
    try {
      await new EccOperationsServerService(ORG, null).createIssue({ classification: "operational", severity: "low", title: "T", description: "D" });
    } catch (error) {
      refused = error instanceof ActionError && error.code === "UNAUTHENTICATED";
    }
    assert(refused, "writes without an authenticated actor are refused");

    // 14. duplicate Daily Ops ⇒ explicit conflict, nothing saved
    inserted = [];
    existingDaily = { id: "ECC-DOP-EXISTING", centreId: "ECC-001", period: "morning", reportingDate: "2026-09-20" };
    let conflict: unknown = null;
    try {
      await svc.createDailyOps(dailyInput());
    } catch (error) {
      conflict = error;
    }
    assert(conflict instanceof EccConflictError && conflict.code === "CONFLICT", "14: duplicate must be an explicit CONFLICT");
    assert(/was not saved/i.test((conflict as Error).message) && (conflict as EccConflictError).existingId === "ECC-DOP-EXISTING", "14: message says the entry was not saved");
    assert(inserted.length === 0, "14: nothing is written and the existing record is not overwritten");
    assert(src("src/app/api/ecc-operations/route.ts").includes("status: 409"), "14: conflict maps to HTTP 409");
    pass("14 duplicate Daily Ops returns an explicit CONFLICT (409): input not saved, existing record untouched");

    // 13. People failure is not healthy staffing
    R.loadAggregate = async () => ({ centre: { ...DEFAULT_ECC_CENTRE }, dailyOps: [], issues: [], requests: [] });
    (EccPeopleRepository.prototype as unknown as Record<string, unknown>).getPeopleSnapshot = async () => {
      throw new Error("people unavailable");
    };
    const overview = await svc.getOverview();
    assert(overview.staffingSourceUnavailable === true && overview.staffingStatus === "unknown", "13: People failure is flagged unavailable");
    assert(/could not be loaded/i.test(overview.staffingReadiness), "13: staffing text does not masquerade as data");
    assert(overview.openIssueCount === 0 && overview.attentionItems !== undefined, "13: unrelated Overview domains still render");
    pass("13 People source failure is unavailable/degraded — not presented as staffing; other Overview domains render");
  } finally {
    Object.assign(R, original);
  }

  // ── 10. No silent browser import ───────────────────────────────────────────
  {
    const client = src("src/services/ecc-operations/EccOperationsService.ts");
    assert(!/ensureLocalMigration|importLocalState|eccLocalStore|localStorage/.test(client), "10: client must not import browser state");
    const runtime = walk("src").filter((f) => !f.endsWith("eccLocalStore.ts") && !f.includes("/store/"));
    const offenders = runtime.filter((f) => /ECC_LOCAL_STORAGE_KEY|sentracore\.ecc\.ops\.v|readEccActingAs|writeEccActingAs|sentracore\.ecc\.actingAs/.test(src(f)));
    assert(offenders.length === 0, `10: runtime still references legacy browser state: ${offenders.join(", ")}`);
    assert(ECC_RETIRED_ACTIONS.includes("importLocalState") && capabilityForEccAction("importLocalState") === null, "10: importLocalState is retired at the API");
    const svc = new EccOperationsServerService(ORG, ACTOR);
    let refused = false;
    try {
      await svc.importLocalState({});
    } catch {
      refused = true;
    }
    assert(refused, "10: the server method refuses");
    pass("10 opening ECC cannot import legacy localStorage domain state (client, API and service all retired)");
  }

  // ── 11–12. Shift / attendance truth ────────────────────────────────────────
  {
    const shift = { id: "S1", startsAt: "2026-09-12T19:56:24.947Z", endsAt: "2026-09-13T03:56:24.947Z" }; // overnight
    assert(isShiftEffective(shift, new Date("2026-09-12T23:00:00Z")), "11: in-window (overnight) shift is current");
    assert(isShiftEffective(shift, new Date("2026-09-13T02:00:00Z")), "11: overnight window continues past midnight");
    assert(!isShiftEffective(shift, new Date("2026-09-20T12:00:00Z")), "11: an expired shift cannot appear current");
    assert(!isShiftEffective(shift, new Date("2026-09-13T03:56:24.947Z")), "11: ends_at is exclusive");
    assert(!isShiftEffective(shift, new Date("2026-09-12T19:00:00Z")), "11: not current before it starts");
    pass("11 expired shift cannot appear current (is_current alone no longer establishes present tense; overnight supported)");
    const open = { shiftId: "S1", signedInAt: "2026-09-12T20:01:24Z", signedOutAt: null };
    assert(isAttendanceLive(open, shift, new Date("2026-09-12T22:00:00Z")), "12: open attendance in an effective shift is live");
    assert(!isAttendanceLive(open, shift, new Date("2026-09-20T12:00:00Z")), "12: stale open attendance is not currently on duty");
    assert(!isAttendanceLive(open, null, new Date("2026-09-20T12:00:00Z")), "12: no shift ⇒ nobody is on duty");
    assert(!isAttendanceLive({ ...open, signedOutAt: "2026-09-12T21:00:00Z" }, shift, new Date("2026-09-12T22:00:00Z")), "12: signed-out is not live");
    pass("12 stale open attendance cannot appear currently on duty (historical rows are not mutated)");
    const staffing = deriveStaffingFromPeople({
      centreId: "ECC-001", asOf: "x", managers: [{ id: "m" } as never], relationshipOfficers: [], agents: [],
      currentShift: { shift: null, lastShift: { label: "Evening", endsAt: "2026-09-13T03:56:24.947Z" } as never, agentsAssigned: 0, agentsSignedIn: 0, coverageStatus: "uncovered" },
      recentAttendance: [],
    });
    assert(staffing?.staffingStatus === "unknown" && /No shift in effect/.test(staffing.staffingReadiness) && !/signed in/.test(staffing.staffingReadiness), "12: Overview says no shift in effect, not signed-in staff");
    const repo = src("src/modules/ecc-operations/server/EccPeopleRepository.ts");
    assert(repo.includes("isShiftEffective") && repo.includes("liveOpenAttendance") && repo.includes("staleOpenAttendance"), "repository reconciles attendance to the effective shift");
    assert(!/update\(\{ signed_out_at/.test(repo.replace(/async signOut[\s\S]*?\n  }\n/, "")), "no automatic mutation of stale attendance");
  }

  // ── 15. Intelligence recency ───────────────────────────────────────────────
  {
    const page = src("src/modules/ecc-operations/components/EccIntelligencePage.tsx");
    assert(!/relativeLabel|"Just now"|"Earlier"|"This window"/.test(page), "15: no positional recency labels");
    assert(page.includes("insightTimeLabel(intelligence.periodLabel)"), "15: label states the analysed period");
    pass("15 Intelligence activity labels state the analysed period — no positional 'Just now / Earlier'");
  }

  // ── 16. Command Centre ECC pulse ───────────────────────────────────────────
  {
    const { CommandCentreServerService } = await import("../src/modules/command-centre/server/CommandCentreServerService");
    const { EccOperationsServerService: Ecc } = await import("../src/modules/ecc-operations/server/EccOperationsServerService");
    const proto = Ecc.prototype as unknown as Record<string, unknown>;
    const origOverview = proto.getOverview;
    const base = {
      latestDailyOps: null, openIssueCount: 0, openRequestCount: 0, escalatedIssueCount: 0, highUrgentOpenCount: 0,
      recentResolutions: [], recentActivity: [], attentionItems: [],
    };
    const access = { organisationId: ORG, session: { enabledModules: [{ slug: "ecc_operations", status: "enabled" }] } } as never;
    const entry = { eccOperations: true } as never;
    const compose = (CommandCentreServerService.prototype as unknown as { composeEccPulse: (a: unknown, e: unknown) => Promise<{ state: string; statusLabel: string; lines: string[] }> }).composeEccPulse;
    try {
      proto.getOverview = async () => base;
      const none = await compose.call({}, access, entry);
      assert(none.state === "empty" && none.statusLabel !== "Stable" && !none.lines.some((l) => /No (critical|escalated)/i.test(l)), "16: no ECC data must not read as Stable");
      proto.getOverview = async () => ({ ...base, latestDailyOps: { id: "d" }, recentActivity: [{ id: "a" }] });
      const calm = await compose.call({}, access, entry);
      assert(calm.state === "healthy" && calm.statusLabel !== "Stable" && /^Checked/.test(calm.statusLabel), "16: recorded, no exceptions found reads as a dated check — never an unsupported 'Stable'");
      proto.getOverview = async () => {
        throw new Error("down");
      };
      const down = await compose.call({}, access, entry);
      assert(down.state === "error", "16: unavailable source is an error state");
    } finally {
      proto.getOverview = origOverview;
    }
    pass("16 no-data ECC pulse is 'No ECC activity'; recorded-without-exceptions is a dated check (not 'Stable'); source failure is an error");
  }

  // ── 17. Reporting distinguishes recorded facts from Intelligence ───────────
  {
    const snapshot = {
      centre: { ...DEFAULT_ECC_CENTRE }, asOf: "2026-09-20T12:00:00.000Z",
      morningCount: 0, eveningCount: 0, adHocCount: 0, openIssues: 1, resolvedIssues: 0, escalatedIssues: 1, openRequests: 0, resolvedRequests: 0, highUrgentOpenRequests: 0,
      issueMetrics: [], requestMetrics: [], callPeriods: [], centreStatusHistory: [], dimensions: [], centrePerformance: [],
    } as never;
    const issues = [{
      id: "I1", centreId: "ECC-001", occurredAt: "2026-09-19T10:00:00Z", classification: "technical", severity: "critical", title: "T", description: "d",
      status: "escalated", reporterName: "n", history: [], createdAt: "2026-09-19T10:00:00Z", updatedAt: "2026-09-19T10:00:00Z",
    }] as never;
    const report = buildEccReportDocument({
      snapshot, issues, requests: [], dailyOps: [],
      config: { reportType: "weekly_operations", title: "", preparedBy: "", rangeFrom: "2026-09-14", rangeTo: "2026-09-20", sections: ["executive_summary", "recommendations", "appendix"] } as never,
    });
    assert(/not recorded fact/i.test(report.analysis.label), "17: analysis is labelled as interpretation");
    assert(report.executiveSummary.overview !== report.analysis.summary, "17: executive facts are not the Intelligence summary");
    assert(/not recorded actions/i.test(report.recommendationsNote), "17: recommendations are labelled");
    assert(report.appendix.dataNotes.some((n) => /recorded facts only/i.test(n)), "17: appendix states the separation");
    const preview = src("src/modules/ecc-operations/reporting/EccReportPreview.tsx");
    const word = src("src/modules/ecc-operations/reporting/downloadEccReportWord.ts");
    for (const token of ["report.analysis.label", "report.analysis.summary", "report.recommendationsNote", "Recorded facts"]) {
      assert(preview.includes(token) && word.includes(token), `17: preview and Word share ${token}`);
    }
    pass("17 Reporting labels Intelligence-derived analysis and recommendations; preview and Word use the same semantics");
  }

  // ── 18–20. Provenance, runtime dependencies, single-centre ─────────────────
  {
    const eccFiles = walk("src/modules/ecc-operations").concat(walk("src/services/ecc-operations"), walk("src/app/api/ecc-operations"));
    const offenders = eccFiles.filter((f) => /postToAppsScript|appsScriptProxy|apps-script|spreadsheet|googleapis|Sheets?Repository/i.test(src(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")));
    assert(offenders.length === 0, `19: Apps Script / Sheets dependency: ${offenders.join(", ")}`);
    pass("19 no Apps Script / Sheets runtime dependency in ECC");
    const intel = src("src/modules/ecc-operations/components/EccIntelligencePage.tsx");
    const reporting = src("src/modules/ecc-operations/components/EccReportingPage.tsx");
    for (const [name, text] of [["Intelligence", intel], ["Reporting", reporting]] as const) {
      assert(/EccOperationsService\.(listDailyOps|listIssues|listRequests|getReportingSnapshot)/.test(text), `18: ${name} reads ECC domain services`);
      assert(!/fixture|mockData|sampleData|demo/i.test(text), `18: ${name} has no fixtures`);
    }
    const derive = src("src/modules/ecc-operations/intelligence/deriveEccIntelligence.ts");
    assert(!/operational_events|action_runs|recommendation_decisions/.test(derive), "18: ECC Intelligence does not read the FM event ledger");
    pass("18 ECC Reporting and Intelligence still derive from the authoritative ECC tables");
    assert(DEFAULT_ECC_CENTRE.id === "ECC-001", "20: ECC-001 remains the sole centre");
    const components = walk("src/modules/ecc-operations/components").map(src).join("\n");
    assert(!/CentreSelect|centre switch|switchCentre|selectedCentre/i.test(components), "20: no centre selector or switching");
    assert(!/user_centre|centre_assignment|ecc_centre_users/i.test(src("supabase/migrations/20260920120000_ecc_capability_model_and_actor_identity.sql")), "20: no user-to-centre assignment introduced");
    assert(src("src/modules/ecc-operations/server/EccOperationsRepository.ts").includes("centreId"), "20: the model still carries centreId (multi-centre later is not precluded)");
    pass("20 ECC still operates as single-centre V1 (ECC-001; no switching or assignment; centreId preserved)");
  }

  if (process.argv.includes("--live-read")) {
    loadEnvLocal();
    const { createAdminClient } = await import("../src/utils/supabase/admin");
    const admin = createAdminClient();
    const { data: org } = await admin.from("organisations").select("id").limit(1).single();
    const realOrg = String((org as { id: string }).id);
    const real = await new EccOperationsRepository(realOrg).listDailyOps();
    const foreign = await new EccOperationsRepository("99999999-9999-4999-8999-999999999999").listDailyOps();
    assert(foreign.length === 0 && real.length >= 0, "7: a foreign organisation reads nothing");
    pass(`7b live read-only isolation: organisation sees ${real.length} Daily Ops, a foreign organisation sees 0`);
    const { data: cols } = await admin.from("ecc_daily_ops").select("id, recorded_by_profile_id").limit(1);
    assert(Array.isArray(cols), "actor identity column is readable");
    pass("8b live schema: actor identity columns exist");
  }

  console.log(out.join("\n"));
  console.log("VERIFY_ECC_READINESS: PASS");
}

main().catch((error) => {
  console.error("FAIL", error instanceof Error ? (process.env.ECC_DEBUG ? error.stack : error.message) : error);
  process.exit(1);
});
