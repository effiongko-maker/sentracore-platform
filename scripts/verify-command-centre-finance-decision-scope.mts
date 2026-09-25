/**
 * Command Centre Finance decision SCOPE truthfulness. Non-mutating: pure functions, prototype
 * stubs and source inspection only.
 *
 *   NODE_PATH=<dir containing an empty server-only/ stub> \
 *     npx tsx --tsconfig tsconfig.json scripts/verify-command-centre-finance-decision-scope.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { decisionScopeNote, evaluateDecisionScope } from "../src/modules/command-centre/server/composeFinanceDecisionQueue";
import { composeExecutiveAttention } from "../src/modules/command-centre/server/composeExecutiveAttention";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
const src = (p: string) => readFileSync(resolve(p), "utf8");

type Decisions = { items: Array<{ id: string }>; totalsByCurrency: Map<string, number> };
const decisions = (n: number): Decisions => ({
  items: Array.from({ length: n }, (_, i) => ({ id: `d${i}` })),
  totalsByCurrency: n ? new Map([["NGN", 100 * n]]) : new Map(),
});
const ORG = ["c1", "c2", "c3"];

async function main() {
  const out: string[] = [];
  const pass = (m: string) => out.push(`PASS ${m}`);
  const { CommandCentreServerService } = await import("../src/modules/command-centre/server/CommandCentreServerService");
  const proto = CommandCentreServerService.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const decide = (q: unknown) => proto.composeDecisions.call({}, q) as { state: string; items: unknown[]; reason: string | null; scopeNote: string | null };
  const attend = (q: unknown) => proto.financeAttentionResult.call({}, q) as { status: string; items: Array<{ detail: string | null }>; note?: string | null };
  const loaded = (n: number, scope: ReturnType<typeof evaluateDecisionScope>) => ({ status: "loaded", decisions: decisions(n), scope });
  const full = evaluateDecisionScope(ORG, ["c1", "c2", "c3"]);
  const partial = evaluateDecisionScope(ORG, ["c1"]);
  const none = evaluateDecisionScope(ORG, []);

  // Scope calculation is set-based, never a count comparison.
  assert(full.complete && !partial.complete && !none.complete, "scope: complete only when every organisation company is covered");
  assert(!evaluateDecisionScope(ORG, ["x1", "x2", "x3"]).complete, "scope: three unrelated access rows do not equal three companies (ids, not counts)");
  assert(evaluateDecisionScope(ORG, ["c1", "c2", "c3", "stale"]).complete, "scope: extra/stale access rows do not break completeness");
  assert(evaluateDecisionScope([], []).complete, "scope: an organisation with no Finance companies has a complete (empty) population");
  assert(partial.accessibleCompanies === 1 && partial.totalCompanies === 3 && partial.uncoveredCompanies === 2, "scope: counts are exact");
  assert(decisionScopeNote(full) === null && /limited by company access \(1 of 3 companies\)/.test(decisionScopeNote(partial) ?? "") && /no Finance company access/.test(decisionScopeNote(none) ?? ""), "scope: notes are truthful");

  // A. complete + zero
  const a = decide(loaded(0, full));
  assert(a.state === "empty" && a.items.length === 0 && a.reason === null, "A: complete scope + zero visible ⇒ a true empty state");
  const aAtt = attend(loaded(0, full));
  assert(aAtt.status === "loaded" && aAtt.items.length === 0, "A: attention: complete zero is a loaded zero");
  pass("A complete + zero ⇒ truthful empty");

  // B. complete + items
  const b = decide(loaded(2, full));
  assert(b.state === "healthy" && b.items.length === 2 && b.scopeNote === null, "B: complete scope + items ⇒ healthy, all shown, no caveat");
  pass("B complete + items ⇒ shown, not partial");

  // C. partial + zero
  for (const scope of [partial, none]) {
    const c = decide(loaded(0, scope));
    assert(c.state === "partial" && c.items.length === 0 && /company access/.test(c.reason ?? ""), "C: partial scope + zero visible ⇒ NOT empty; explains the limit");
    const att = attend(loaded(0, scope));
    assert(att.status === "partial" && !!att.note, "C: attention stays partial for a partial zero");
    const composed = composeExecutiveAttention([att as never, { domain: "ecc", status: "loaded", items: [] }, { domain: "facility_management", status: "loaded", items: [] }]);
    assert(!composed.complete && composed.state !== "empty" && !/No qualifying/.test(composed.summary), "C/H: a partial Finance zero can never yield 'nothing requires attention'");
  }
  const page = src("src/modules/command-centre/components/CommandCentrePage.tsx");
  assert(/decisions\.state === "empty"\) \{\s*return <QuietEmpty label="No Finance decisions are waiting on you\."/.test(page), "C: the 'No Finance decisions are waiting on you' message is reachable ONLY from state === empty");
  pass("C partial + zero ⇒ no global empty claim (queue and attention)");

  // D. partial + items
  const d = decide(loaded(2, partial));
  assert(d.state === "partial" && d.items.length === 2 && /limited by company access/.test(d.scopeNote ?? ""), "D: visible decisions are shown AND the view stays partial");
  const dAtt = attend(loaded(2, partial));
  assert(dAtt.status === "partial" && dAtt.items.length === 1 && /within your company access/.test(dAtt.items[0].detail ?? ""), "D: attention surfaces the visible decisions, labelled as within company access");
  assert(/decisions\.scopeNote \? <p className="scc-panel-scope">/.test(page), "D: the UI shows the partial note beside visible decisions");
  pass("D partial + items ⇒ decisions shown, visibly partial");

  // E. restricted
  const e = decide({ status: "restricted" });
  assert(e.state === "restricted" && !/could not be read/.test(e.reason ?? ""), "E: missing decide / approve ⇒ restricted, not empty, not a failure");
  assert(attend({ status: "restricted" }).status === "restricted", "E: attention stays restricted");
  pass("E restricted stays restricted");

  // F. failure
  const f = decide({ status: "unavailable" });
  assert(f.state === "error" && /could not be read/.test(f.reason ?? ""), "F: failure ⇒ error, not zero");
  assert(attend({ status: "unavailable" }).status === "unavailable", "F: attention stays unavailable");
  const svc = src("src/modules/command-centre/server/CommandCentreServerService.ts");
  assert(/Finance company scope could not be read/.test(svc) && /if \(companies\.error \|\| accessRows\.error\)/.test(svc), "F: a failed scope read throws (⇒ unavailable), never 'complete'");
  const loadBody = svc.slice(svc.indexOf("private async loadFinanceQueue"), svc.indexOf("/**\n   * Is the actor's Finance company access complete"));
  assert(/this\.readDecisionScope\(access\)/.test(loadBody) && /catch \(error\)[\s\S]*status: "unavailable"/.test(loadBody), "F: scope read is inside the guarded block whose failure is 'unavailable'");
  pass("F failure stays unavailable/failed");

  // G. Pulse remains organisation-wide
  const { PlatformFinanceServerService } = await import("../src/modules/platform-finance/server/PlatformFinanceServerService");
  const { PlatformFinancePayablesServerService } = await import("../src/modules/platform-finance/server/PlatformFinancePayablesServerService");
  (PlatformFinanceServerService.prototype as unknown as Record<string, unknown>).getCommandCentreOverview = async () => ({ pendingCeoDecisions: { count: 4 }, requests: { awaitingReview: { count: 1 } } });
  (PlatformFinancePayablesServerService.prototype as unknown as Record<string, unknown>).listCommandCentrePayables = async () => [];
  const pulse = (await proto.composeFinancePulse.call({}, { organisationId: "o", profileId: "p", session: { roleSlugs: [], enabledModules: [{ slug: "platform_finance", status: "enabled" }] } }, { platformFinance: true }, "2026-09-20T10:00:00Z", "Africa/Lagos")) as { lines: string[]; statusLabel: string };
  assert(pulse.lines[0] === "4 pending CEO decisions" && pulse.statusLabel === "Needs attention", "G: the pulse keeps the organisation-wide count, independent of the actor's queue scope");
  // The pulse reads the shared Finance projection (one read per request); that loader is the organisation-wide
  // Executive Office projection and is not narrowed by company access.
  const pulseBody = svc.slice(svc.indexOf("private async composeFinancePulse"), svc.indexOf("// ── Lens compositions"));
  const loaderBody = svc.slice(svc.indexOf("async function loadFinanceProjection"), svc.indexOf("export class CommandCentreServerService"));
  assert(pulseBody.includes("loadFinanceProjection") && loaderBody.includes("getCommandCentreOverview") && ![pulseBody, loaderBody].some((b) => b.includes("readDecisionScope") || b.includes("finance_company_access")), "G: the pulse is not narrowed by (or coupled to) company access");
  pass("G pulse stays an organisation-wide projection");

  // I. Authority unchanged
  const queueBody = svc.slice(svc.indexOf("private async loadFinanceQueue"), svc.indexOf("/**\n   * Is the actor's Finance company access complete"));
  assert(queueBody.indexOf("!canApprove || !canDecide") < queueBody.indexOf("listApprovalQueue"), "I: approve AND decide are still required before any queue is read");
  const scopeBody = svc.slice(svc.indexOf("private async readDecisionScope"), svc.indexOf("private composeDecisions"));
  assert(/\.select\(/.test(scopeBody) && !/\.(insert|update|upsert|delete)\(/.test(scopeBody), "I: company access is only READ — never granted, broadened or bypassed");
  assert(!/approveRequest|approveVendorBill|finance_request_approve/.test(svc), "I: Command Centre performs no approvals; command_centre.decide remains visibility only");
  assert(/listApprovalQueue\(actor\)/.test(svc), "I: the queue still uses the Finance services' company-scoped readers");
  pass("I authority: no broadening, no bypass, no approvals from Command Centre");

  console.log(out.join("\n"));
  console.log(`\n${out.length} groups passed`);
}

main().catch((e) => {
  console.error("FAIL", e instanceof Error ? e.message : e);
  process.exit(1);
});
